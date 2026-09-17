// ============================================================
// POST /api/billing/submit-payment
//
// Customer claims they sent bKash/Nagad money to the platform's
// personal number and reports the transaction ID. This does NOT
// activate anything by itself — it only creates a 'pending' row
// for the platform owner to verify by hand against their bKash/
// Nagad app, then approve from /platform-admin/payments.
//
// Admin+ only (matches payment_submissions_insert RLS policy —
// this check is a friendlier 403 before hitting the DB, RLS is
// still the real enforcement).
// ============================================================

import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { getPlan, isBillingPlanId, isPaymentMethod } from "@/lib/billing/plans";

const MAX_TRX_ID_LEN = 60;
const MAX_SENDER_LEN = 20;

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("admin");

    // A submission spam-loop shouldn't be able to flood the
    // platform owner's review queue. Reuses the existing
    // per-user admin-action bucket.
    const limit = checkRateLimit(
      `billing:submit:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as
      | {
          plan?: unknown;
          method?: unknown;
          senderNumber?: unknown;
          trxId?: unknown;
        }
      | null;

    if (!body || !isBillingPlanId(body.plan)) {
      return NextResponse.json(
        { error: "'plan' must be '30day' or '1year'" },
        { status: 400 },
      );
    }
    if (!isPaymentMethod(body.method)) {
      return NextResponse.json(
        { error: "'method' must be 'bkash' or 'nagad'" },
        { status: 400 },
      );
    }
    const senderNumber =
      typeof body.senderNumber === "string" ? body.senderNumber.trim() : "";
    const trxId = typeof body.trxId === "string" ? body.trxId.trim() : "";

    if (!senderNumber || senderNumber.length > MAX_SENDER_LEN) {
      return NextResponse.json(
        { error: `'senderNumber' is required (max ${MAX_SENDER_LEN} chars)` },
        { status: 400 },
      );
    }
    if (!trxId || trxId.length > MAX_TRX_ID_LEN) {
      return NextResponse.json(
        { error: `'trxId' is required (max ${MAX_TRX_ID_LEN} chars)` },
        { status: 400 },
      );
    }

    const plan = getPlan(body.plan);

    const { data, error } = await ctx.supabase
      .from("payment_submissions")
      .insert({
        account_id: ctx.accountId,
        submitted_by_user_id: ctx.userId,
        plan: plan.id,
        amount_bdt: plan.priceBdt,
        method: body.method,
        sender_number: senderNumber,
        trx_id: trxId,
      })
      .select("id, status, created_at")
      .single();

    if (error) {
      // Unique violation on trx_id — someone already submitted this
      // exact transaction ID (possibly a genuine double-submit).
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "This transaction ID has already been submitted." },
          { status: 409 },
        );
      }
      console.error("[POST /api/billing/submit-payment] insert error:", error);
      return NextResponse.json(
        { error: "Failed to submit payment" },
        { status: 500 },
      );
    }

    return NextResponse.json({ submission: data }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
