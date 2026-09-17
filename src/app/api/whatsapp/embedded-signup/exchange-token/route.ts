// ============================================================
// POST /api/whatsapp/embedded-signup/exchange-token
//
// The WhatsApp Embedded Signup popup (Facebook JS SDK, FB.login
// with response_type: 'code') only hands the browser a short-lived
// OAuth `code` — trading it for a real access token requires
// META_APP_SECRET, which must never reach client-side code. This
// route does that one exchange and returns nothing else.
//
// Per Meta's docs, the token returned from a code obtained via
// Embedded Signup belongs to a System User created during the flow
// and does not expire the way a normal user token does — no refresh
// step is implemented here because none is needed.
//
// The actual WhatsApp config save (verify + /register + subscribe +
// encrypt + persist) happens client-side afterwards by calling the
// existing POST /api/whatsapp/config with this token — reusing that
// route's logic rather than duplicating it here.
// ============================================================

import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";

export async function POST(request: Request) {
  try {
    // Embedded Signup writes credentials the same way the manual form
    // does, so it needs the same minimum privilege as saving
    // whatsapp_config (admin+, enforced again at the DB layer by RLS
    // when the client calls /api/whatsapp/config next).
    await requireRole("admin");

    const body = (await request.json().catch(() => null)) as
      | { code?: unknown }
      | null;
    const code = typeof body?.code === "string" ? body.code : "";
    if (!code) {
      return NextResponse.json({ error: "'code' is required" }, { status: 400 });
    }

    const appId = process.env.NEXT_PUBLIC_META_APP_ID || process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    if (!appId || !appSecret) {
      return NextResponse.json(
        {
          error:
            "Embedded Signup isn't configured on this deployment (missing NEXT_PUBLIC_META_APP_ID or META_APP_SECRET).",
        },
        { status: 500 },
      );
    }

    const url = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    url.searchParams.set("client_id", appId);
    url.searchParams.set("client_secret", appSecret);
    url.searchParams.set("code", code);

    const metaRes = await fetch(url.toString());
    const metaBody = await metaRes.json().catch(() => ({}));

    if (!metaRes.ok || !metaBody.access_token) {
      console.error(
        "[POST /api/whatsapp/embedded-signup/exchange-token] Meta rejected code exchange:",
        metaBody,
      );
      return NextResponse.json(
        {
          error:
            metaBody?.error?.message ||
            "Meta rejected the signup code. Please try connecting again.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ accessToken: metaBody.access_token as string });
  } catch (err) {
    return toErrorResponse(err);
  }
}
