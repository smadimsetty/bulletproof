// apps/web/lib/supabase.ts
//
// Anon-key-only Supabase client -- no auth, no session persistence, no
// AsyncStorage (unlike apps/mobile/lib/supabase.ts, which configures all
// three for its authenticated Apple Sign-In flow). This app never signs
// in; every request is an anonymous `anon`-role request, which is exactly
// what recommendations_public's `grant select ... to anon` already
// allows. See docs/superpowers/specs/2026-06-22-web-dashboard-design.md
// Decision 2.
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
