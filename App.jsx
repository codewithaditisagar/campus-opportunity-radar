import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { checkEligibility, LABELS } from './eligibility'

const TRACK = ['saved', 'applying', 'applied']
const ORDER = { eligible: 0, possible: 1, insufficient: 2, not_eligible: 3, expired: 4 }

export default function App() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (!ready) return <p className="center">Loading…</p>
  return session ? <Home user={session.user} /> : <Auth />
}

function Auth() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  async function submit(e) {
    e.preventDefault()
    setMsg('')
    const fn = mode === 'signin' ? supabase.auth.signInWithPassword : supabase.auth.signUp
    const { error } = await fn.call(supabase.auth, { email, password })
    if (error) setMsg(error.message)
    else if (mode === 'signup') setMsg('Account created. Check your email to confirm, then sign in.')
  }
  return (
    <main className="auth">
      <h1>Campus Opportunity Radar</h1>
      <p>Scholarships, internships and hackathons matched to your profile, with the evidence shown.</p>
      <form onSubmit={submit}>
        <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button className="primary">{mode === 'signin' ? 'Sign in' : 'Create account'}</button>
        {msg && <p role="alert" className="note">{msg}</p>}
      </form>
      <button className="link" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
        {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
      </button>
    </main>
  )
}

function Home({ user }) {
  const [tab, setTab] = useState('opportunities')
  const [profile, setProfile] = useState(null)
  const [opps, setOpps] = useState([])
  const [tracker, setTracker] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      const [p, o, t] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('opportunities').select('*'),
        supabase.from('application_tracker').select('*').eq('user_id', user.id),
      ])
      const err = p.error || o.error || t.error
      if (err) setError(err.message)
      setProfile(p.data || {})
      setOpps(o.data || [])
      setTracker(t.data || [])
    })()
  }, [user.id])

  async function setStatus(opportunity_id, status) {
    const row = tracker.find((r) => r.opportunity_id === opportunity_id)
    const q = row
      ? supabase.from('application_tracker').update({ status }).eq('id', row.id)
      : supabase.from('application_tracker').insert({ user_id: user.id, opportunity_id, status })
    const { data, error } = await q.select().single()
    if (error) return setError(error.message)
    setTracker((t) => (row ? t.map((r) => (r.id === row.id ? data : r)) : [...t, data]))
  }

  return (
    <>
      <header className="top">
        <strong>Campus Opportunity Radar</strong>
        <nav>
          {[['opportunities', 'Opportunities'], ['tracker', 'My applications'], ['profile', 'Profile']].map(([k, l]) => (
            <button key={k} aria-current={tab === k} onClick={() => setTab(k)}>{l}</button>
          ))}
        </nav>
        <button className="link" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>
      <main>
        {error && <p role="alert" className="note bad">{error}</p>}
        {!profile ? <p>Loading…</p> : tab === 'profile' ? (
          <ProfileForm user={user} profile={profile} onSaved={setProfile} />
        ) : tab === 'tracker' ? (
          <Tracker opps={opps} tracker={tracker} profile={profile} setStatus={setStatus} />
        ) : (
          <Opportunities opps={opps} tracker={tracker} profile={profile} setStatus={setStatus} goProfile={() => setTab('profile')} />
        )}
        <p className="fine">Matches are based on the criteria we could verify. They are not a guarantee of selection by any organisation.</p>
      </main>
    </>
  )
}

function Opportunities({ opps, tracker, profile, setStatus, goProfile }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const [elig, setElig] = useState('all')
  const [hideExpired, setHideExpired] = useState(true)

  const cats = useMemo(() => ['all', ...new Set(opps.map((o) => o.category).filter(Boolean))], [opps])
  const rows = useMemo(() =>
    opps.map((o) => ({ o, r: checkEligibility(o, profile) }))
      .filter(({ o, r }) =>
        (cat === 'all' || o.category === cat) &&
        (elig === 'all' || r.status === elig) &&
        (!hideExpired || r.status !== 'expired') &&
        `${o.title} ${o.description || ''}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => ORDER[a.r.status] - ORDER[b.r.status]),
    [opps, profile, q, cat, elig, hideExpired])

  const summary = Object.keys(LABELS).map((k) => [k, rows.filter((x) => x.r.status === k).length])

  return (
    <>
      <h2>{profile.full_name ? `Opportunities for ${profile.full_name}` : 'Opportunities'}</h2>
      {!profile.degree && <p className="note">Complete your <button className="link" onClick={goProfile}>profile</button> so matches can be checked.</p>}
      <div className="summary">
        {summary.map(([k, n]) => <span key={k} className={`pill ${k}`}>{n} {LABELS[k].toLowerCase()}</span>)}
      </div>
      <div className="filters">
        <label>Search<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title or keyword" /></label>
        <label>Type<select value={cat} onChange={(e) => setCat(e.target.value)}>{cats.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label>Match<select value={elig} onChange={(e) => setElig(e.target.value)}>
          <option value="all">all</option>
          {Object.entries(LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select></label>
        <label className="check"><input type="checkbox" checked={hideExpired} onChange={(e) => setHideExpired(e.target.checked)} />Hide expired</label>
      </div>
      {rows.length === 0 ? <p className="empty">Nothing matches these filters. Clear a filter or search a different keyword.</p> : (
        <ul className="cards">
          {rows.map(({ o, r }) => <Card key={o.id} o={o} r={r} row={tracker.find((t) => t.opportunity_id === o.id)} setStatus={setStatus} />)}
        </ul>
      )}
    </>
  )
}

function Card({ o, r, row, setStatus }) {
  const source = o.source || (o.url ? new URL(o.url).hostname : 'Source not listed')
  return (
    <li className={`card ${r.status}`}>
      <div className="card-head">
        <h3>{o.title}</h3>
        <span className={`pill ${r.status}`}>{LABELS[r.status]}</span>
      </div>
      <p className="meta">{o.category} · {r.deadline.text}</p>
      {o.description && <p>{o.description}</p>}
      <ul className="reasons">
        {r.reasons.map((x, i) => <li key={i} className={x.t}>{x.m}</li>)}
      </ul>
      <p className="meta">Source: {source}{o.last_checked ? ` · checked ${new Date(o.last_checked).toLocaleDateString('en-IN')}` : ''}</p>
      <div className="actions">
        {o.url && <a className="primary" href={o.url} target="_blank" rel="noreferrer">Open official page</a>}
        <label>Status
          <select value={row?.status || ''} onChange={(e) => setStatus(o.id, e.target.value)}>
            <option value="" disabled>Not tracked</option>
            {TRACK.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
      </div>
    </li>
  )
}

function Tracker({ opps, tracker, profile, setStatus }) {
  if (!tracker.length) return <p className="empty">You haven’t tracked anything yet. Set a status on an opportunity to follow it here.</p>
  return (
    <>
      <h2>My applications</h2>
      <ul className="cards">
        {tracker.map((t) => {
          const o = opps.find((x) => x.id === t.opportunity_id)
          return o ? <Card key={t.id} o={o} r={checkEligibility(o, profile)} row={t} setStatus={setStatus} /> : null
        })}
      </ul>
    </>
  )
}

function ProfileForm({ user, profile, onSaved }) {
  const [f, setF] = useState({
    full_name: profile.full_name || '',
    degree: profile.degree || '',
    year: profile.year || '',
    skills: (profile.skills || []).join(', '),
  })
  const [msg, setMsg] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  async function save(e) {
    e.preventDefault()
    const row = {
      id: user.id,
      full_name: f.full_name,
      degree: f.degree,
      year: f.year ? Number(f.year) : null,
      skills: f.skills.split(',').map((s) => s.trim()).filter(Boolean),
    }
    const { data, error } = await supabase.from('profiles').upsert(row).select().single()
    if (error) setMsg(error.message)
    else { onSaved(data); setMsg('Profile saved.') }
  }
  return (
    <form className="profile" onSubmit={save}>
      <h2>Your profile</h2>
      <label>Full name<input required value={f.full_name} onChange={set('full_name')} /></label>
      <label>Degree<input required placeholder="B.Tech" value={f.degree} onChange={set('degree')} /></label>
      <label>Year of study<input type="number" min="1" max="6" required value={f.year} onChange={set('year')} /></label>
      <label>Skills<input placeholder="python, react, machine learning" value={f.skills} onChange={set('skills')} /></label>
      <p className="meta">Separate skills with commas.</p>
      <button className="primary">Save profile</button>
      {msg && <p role="status" className="note">{msg}</p>}
    </form>
  )
}
