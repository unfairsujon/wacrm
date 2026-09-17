// ============================================================
// POST /api/whatsapp/embedded-signup
//
// Second half of Meta's WhatsApp Embedded Signup flow (the first
// half — FB.login() with the Embedded Signup config — runs in the
// browser, see EmbeddedSignupButton.tsx).
//
// Input:  { code }            — the auth code FB.login() returned
// Output: { access_token, generated_pin }
//
// The client is expected to immediately POST these, together with
// the waba_id/phone_number_id it captured from Meta's postMessage
// events during the popup flow, to the EXISTING
// POST /api/whatsapp/config route — that route already does
// credential verification, phone registration, WABA subscription,
// and encrypted storage. We deliberately don't duplicate any of
// that here; this route's only job is the code → token exchange
// Meta requires before those calls become possible.
//
// Why a PIN is generated here: Meta's /phone_number/register call
// needs a 2-step-verification PIN, but Embedded Signup's postMessage
// payload doesn't hand one back. Since this is a brand-new
// registration (not recovering an existing PIN), any 6-digit PIN is
// valid to set at registration time — we generate one so the
// customer isn't asked to invent one mid-flow. It's stored later by
// /api/whatsapp/config the same way a manually-typed PIN would be.
// ============================================================

import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

const GRAPH_VERSION = "v21.0";

function generatePin(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("admin");

    const limit = checkRateLimit(
      `whatsapp:embedded-signup:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    if (!appId || !appSecret) {
      return NextResponse.json(
        {
          error:
            "META_APP_ID and META_APP_SECRET must be set on the server for Embedded Signup to work.",
        },
        { status: 500 },
      );
    }

    const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
    const code = typeof body?.code === "string" ? body.code : "";
    if (!code) {
      return NextResponse.json({ error: "'code' is required" }, { status: 400 });
    }

    const tokenUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("code", code);

    const metaRes = await fetch(tokenUrl.toString());
    const metaBody = await metaRes.json().catch(() => ({}));

    if (!metaRes.ok || !metaBody?.access_token) {
      console.error("[embedded-signup] Meta token exchange failed:", metaBody);
      return NextResponse.json(
        {
          error:
            metaBody?.error?.message ??
            "Meta rejected the authorization code. Please try connecting again.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      access_token: metaBody.access_token as string,
      generated_pin: generatePin(),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
