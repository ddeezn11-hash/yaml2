import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/* Supabase server client for Route Handlers / Server Actions (Phase 1).
 * Returns null while no credentials are configured — callers must treat
 * that as "prototype mode" and NOT trust unauthenticated requests.
 * Never import the service-role key here; SUPABASE_SECRET_KEY stays
 * server-only and is used only in explicitly-trusted admin paths. */

export async function getSupabaseServerClient(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;

  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component — safe to ignore when middleware
          // (proxy.ts) refreshes sessions instead.
        }
      },
    },
  });
}

/** Verified user id for the current request, or null. NEVER trust a
 *  client-supplied userId in a privileged route — call this instead. */
export async function verifiedUserId(): Promise<string | null> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user.id;
}
