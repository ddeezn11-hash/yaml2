import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Supabase email-confirmation / PKCE callback.
 * Exchange the one-time code server-side so the SSR auth cookies are set by
 * the trusted server, then send the user back to the app.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const rawNext = url.searchParams.get("next") || "/";
  // Only allow a local relative redirect; never turn this callback into an
  // open redirect to an external website.
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  if (!code) {
    return NextResponse.redirect(new URL("/?auth_error=missing_code", url.origin));
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.redirect(new URL("/?auth_error=auth_not_configured", url.origin));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/?auth_error=confirmation_failed", url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
