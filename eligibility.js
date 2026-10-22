// Client-side eligibility explainer. Every opportunity column below is OPTIONAL:
// if the backend does not provide it, the rule is skipped. Rename fields here
// to match the real opportunities table.
export const LABELS = {
  eligible: 'Eligible based on known criteria',
  possible: 'Possibly eligible',
  insufficient: 'Insufficient information',
  not_eligible: 'Not eligible based on known criteria',
  expired: 'Expired',
}

export function deadlineStatus(deadline) {
  if (!deadline) return { state: 'unknown', text: 'Deadline not verified' }
  const d = new Date(deadline)
  if (isNaN(d)) return { state: 'unknown', text: 'Deadline not verified' }
  const days = Math.ceil((d - new Date()) / 864e5)
  const when = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  if (days < 0) return { state: 'expired', text: `Closed on ${when}` }
  if (days <= 7) return { state: 'closing', text: `Closes ${when} (${days} day${days === 1 ? '' : 's'} left)` }
  return { state: 'open', text: `Closes ${when}` }
}

const list = (v) => (Array.isArray(v) ? v : v ? [v] : []).map((s) => String(s).toLowerCase().trim())

export function checkEligibility(o, p) {
  const reasons = []
  let failed = false, unsure = false, checked = 0

  const degrees = list(o.degrees)
  if (degrees.length) {
    checked++
    if (!p.degree) { unsure = true; reasons.push({ t: 'unknown', m: 'Add your degree to confirm the course requirement.' }) }
    else if (degrees.includes(p.degree.toLowerCase().trim())) reasons.push({ t: 'pass', m: `Your course (${p.degree}) is accepted.` })
    else { failed = true; reasons.push({ t: 'fail', m: `Open to ${o.degrees.join(', ')}; your course is ${p.degree}.` }) }
  }

  if (o.min_year != null || o.max_year != null) {
    checked++
    const range = `year ${o.min_year ?? '1'}${o.max_year != null ? `–${o.max_year}` : '+'}`
    if (!p.year) { unsure = true; reasons.push({ t: 'unknown', m: `Add your year of study to check the ${range} requirement.` }) }
    else if ((o.min_year == null || p.year >= o.min_year) && (o.max_year == null || p.year <= o.max_year))
      reasons.push({ t: 'pass', m: `Your year (${p.year}) fits ${range}.` })
    else { failed = true; reasons.push({ t: 'fail', m: `Requires ${range}; you are in year ${p.year}.` }) }
  }

  const required = list(o.skills_required)
  if (required.length) {
    checked++
    const have = list(p.skills)
    const missing = required.filter((s) => !have.includes(s))
    if (!missing.length) reasons.push({ t: 'pass', m: 'You have all the listed skills.' })
    else { unsure = true; reasons.push({ t: 'unknown', m: `Not on your profile yet: ${missing.join(', ')}.` }) }
  }

  if (o.income_limit != null) {
    checked++
    if (p.income == null || p.income === '') { unsure = true; reasons.push({ t: 'unknown', m: 'Income eligibility is not confirmed because you haven’t provided that information.' }) }
    else if (Number(p.income) <= Number(o.income_limit)) reasons.push({ t: 'pass', m: 'Your income is within the stated limit.' })
    else { failed = true; reasons.push({ t: 'fail', m: 'Your income is above the stated limit.' }) }
  }

  const dl = deadlineStatus(o.deadline)
  let status
  if (dl.state === 'expired') status = 'expired'
  else if (failed) status = 'not_eligible'
  else if (!checked) { status = 'insufficient'; reasons.push({ t: 'unknown', m: 'The source page did not list clear eligibility criteria.' }) }
  else status = unsure ? 'possible' : 'eligible'

  return { status, reasons, deadline: dl }
}
