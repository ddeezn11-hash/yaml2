import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const TICKET_TTL_MS = 30_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Issues a short-lived Team Create ticket after checking the Supabase owner
 * or collaborator record. The browser cannot choose its own role. */
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

  const room = body && typeof body === "object"
    ? String((body as Record<string, unknown>).room ?? "").trim().slice(0, 80)
    : "";
  if (!room) return NextResponse.json({ ok: false, error: "Missing Team Create room." }, { status: 400 });

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json({ ok: true, ticket: null, mode: "dev" });
    }
    return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ ok: false, error: "Sign in before joining Team Create." }, { status: 401 });
  }

  const { data: profileData, error: profileError } = await supabase.rpc("get_my_profile");
  if (profileError) return NextResponse.json({ ok: false, error: "Could not verify your Blockyard profile." }, { status: 503 });
  const profile = Array.isArray(profileData) ? profileData[0] : profileData;
  if (!profile || profile.id !== authData.user.id || typeof profile.username !== "string") {
    return NextResponse.json({ ok: false, error: "Your Blockyard profile could not be found." }, { status: 403 });
  }
  if (profile.banned === true) return NextResponse.json({ ok: false, error: "This Blockyard account is suspended." }, { status: 403 });

  // Local development can use temporary Studio IDs. In production, never
  // trust a role from the browser: require a cloud project row and derive the
  // role from its owner/collaborator records.
  let role: "owner" | "editor" | "builder" | "viewer" = "owner";
  if (process.env.NODE_ENV === "production" && !UUID_RE.test(room)) {
    return NextResponse.json({
      ok: false,
      error: "This project is still stored locally. Publish/save it to the cloud before using secure Team Create across computers.",
    }, { status: 403 });
  }

  const { data: experience, error: experienceError } = await supabase
    .from("experiences")
    .select("id, owner_id")
    .eq("id", room)
    .maybeSingle();
  if (experienceError || !experience) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ ok: false, error: "You do not have access to this cloud project." }, { status: 403 });
    }
    // Dev-only fallback for local drafts that have no cloud record.
    role = "owner";
  } else if (experience.owner_id === authData.user.id) {
    role = "owner";
  } else {
    const { data: collaborator, error: collaboratorError } = await supabase
      .from("experience_collaborators")
      .select("role")
      .eq("experience_id", room)
      .eq("user_id", authData.user.id)
      .maybeSingle();
    if (collaboratorError || !collaborator) {
      return NextResponse.json({ ok: false, error: "The project owner has not given you Team Create access." }, { status: 403 });
    }
    role = collaborator.role === "editor" || collaborator.role === "builder" ? collaborator.role : "viewer";
  }

  const secret = process.env.GAME_SERVER_TICKET_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV !== "production") return NextResponse.json({ ok: true, ticket: null, mode: "dev" });
    return NextResponse.json({ ok: false, error: "The Team Create ticket secret is not configured." }, { status: 503 });
  }

  const claims = {
    sub: authData.user.id,
    u: profile.username,
    n: typeof profile.display_name === "string" && profile.display_name.trim()
      ? profile.display_name.trim().slice(0, 24)
      : profile.username,
    room,
    role,
    x: Date.now() + TICKET_TTL_MS,
  };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return NextResponse.json({ ok: true, ticket: `${payload}.${signature}`, mode: "ticket", expiresIn: TICKET_TTL_MS });
}
