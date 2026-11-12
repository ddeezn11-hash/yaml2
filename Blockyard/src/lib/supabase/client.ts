"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/* Supabase browser client for cloud authentication. If credentials are absent,
 * cloud login is disabled rather than falling back to insecure local passwords.
 * Configure the project URL and publishable key in the host environment. */

let cached: SupabaseClient | null | undefined;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    cached = null;
    return cached;
  }
  try {
    cached = createBrowserClient(url, key);
  } catch {
    cached = null;
  }
  return cached;
}

/** True when the app has real Supabase credentials (cloud mode). */
export function supabaseConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
}
