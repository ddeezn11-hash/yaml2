import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const TICKET_TTL_MS = 30_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Issues a short-lived game ticket only after Supabase verifies the caller's
 * cookie-backed session. The client cannot choose its username or display name.
 */
export async function POST(req: Request) {
  // Reject cross-origin browser POSTs. Supabase auth is cookie-backed, so
  // ticket minting must not be usable as a cross-site request primitive.
  const origin = req.headers.get("origin");
  if (origin) {
    const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = forwardedHost || req.headers.get("host");
    const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const protocol = forwardedProto || new URL(req.url).protocol.replace(":", "");
    const expectedOrigin = host ? `${protocol}://${host}` : new URL(req.url).origin;
    if (origin !== expectedOrigin) {
      return NextResponse.json({ ok: false, error: "Cross-origin request rejected." }, { status: 403 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Missing request origin." }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const experienceId = body && typeof body === "object"
    ? String((body as Record<string, unknown>).experienceId ?? "").trim().slice(0, 80)
    : "";
  if (!experienceId) return NextResponse.json({ ok: false, error: "Missing experience id." }, { status: 400 });

  const supabase = await getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ ok: false, error: "Sign in before joining a multiplayer server." }, { status: 401 });
  }

  const { data: profileData, error: profileError } = await supabase.rpc("get_my_profile");
  if (profileError) {
    return NextResponse.json({ ok: false, error: "Could not verify your Blockyard profile. Check the Supabase migrations." }, { status: 503 });
  }
  const profile = Array.isArray(profileData) ? profileData[0] : profileData;
  if (!profile || profile.id !== authData.user.id || typeof profile.username !== "string") {
    return NextResponse.json({ ok: false, error: "Your Blockyard profile could not be found." }, { status: 403 });
  }
  if (profile.banned === true) {
    return NextResponse.json({ ok: false, error: "This Blockyard account is suspended." }, { status: 403 });
  }

  // Production tickets require a real cloud experience visible under the
  // experiences table's RLS policy. Local development may use seeded/local IDs.
  if (process.env.NODE_ENV === "production") {
    if (!UUID_RE.test(experienceId)) {
      return NextResponse.json({ ok: false, error: "This game has not been published to cloud storage yet." }, { status: 403 });
    }
    const { data: experience, error: experienceError } = await supabase
      .from("experiences")
      .select("id")
      .eq("id", experienceId)
      .maybeSingle();
    if (experienceError || !experience) {
      return NextResponse.json({ ok: false, error: "This game is not published or you do not have access to it." }, { status: 403 });
    }
  }

  const secret = process.env.GAME_SERVER_TICKET_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ ok: false, error: "The multiplayer ticket secret is not configured on the website." }, { status: 503 });
    }
    // Local development only. The local WebSocket server must also run in dev mode.
    return NextResponse.json({ ok: true, ticket: null, mode: "dev", expiresIn: 0 });
  }

  const claims = {
    sub: authData.user.id,
    u: profile.username,
    n: typeof profile.display_name === "string" && profile.display_name.trim()
      ? profile.display_name.trim().slice(0, 24)
      : profile.username,
    e: experienceId,
    x: Date.now() + TICKET_TTL_MS,
  };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return NextResponse.json({ ok: true, ticket: `${payload}.${signature}`, mode: "ticket", expiresIn: TICKET_TTL_MS });
}
