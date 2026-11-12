import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/* Next.js 16 uses proxy.ts (the renamed middleware) — creating a legacy
 * middleware.ts would be wrong for this version. This refreshes Supabase
 * auth sessions on every matched request. While no Supabase project is
 * configured it's a no-op pass-through, so prototype mode is unaffected. */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  if (!SUPABASE_URL || !SUPABASE_KEY) return response;

  try {
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });
    // IMPORTANT: do not run heavy logic between createServerClient and
    // getUser() — the session refresh depends on this exact ordering.
    const { data } = await supabase.auth.getUser();
    void data; // authenticated user available to later routes via cookies
  } catch {
    // Never block the request on auth refresh failure
  }
  return response;
}

export const config = {
  matcher: [
    // refresh sessions everywhere except static assets and the two
    // WebSocket mini-service paths
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
