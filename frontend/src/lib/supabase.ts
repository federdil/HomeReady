import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

/**
 * Local development escape hatch: run the app with no Supabase project at all.
 * Set VITE_DEV_NO_AUTH=true in .env.local only — the backend applies the same
 * bypass via DEV_NO_AUTH, and both default to off.
 */
export const DEV_NO_AUTH = import.meta.env.VITE_DEV_NO_AUTH === 'true'

// Must match DEV_USER_ID in backend/app/core/auth.py so local rows line up.
export const DEV_USER_ID = '00000000-0000-0000-0000-0000000000de'

export const supabase = createClient(
  supabaseUrl || 'http://localhost:54321',
  supabaseAnonKey || 'dev-anon-key',
)
