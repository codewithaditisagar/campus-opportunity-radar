import { createClient } from '@supabase/supabase-js'

// Only the URL and publishable key belong in the browser.
// Never put the secret key, TinyFish key or Anthropic key in a VITE_ variable.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
)
