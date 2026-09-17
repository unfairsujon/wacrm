// ============================================================
// GET /api/billing/status
//
// Current caller's trial/subscription status, plus their most
// recent payment submission (so the /billing page can show
// "pending review" or "rejected — try again" instead of just a
// blank payment form). Any member may read this.
// ============================================================

import { NextResponse } from "next/server";

import { getCurrentAccount, toErrorResponse } from "@/lib/auth/account";
import { computeBillingStatus } from "@/lib/billing/status";

export async function GET() {
  try {
    const ctx = await getCurrentAccount();

    const { data: account, error: accountErr } = await ctx.supabase
      .from("accounts")
      .select("trial_ends_at, subscription_active_until")
      .eq("id", ctx.accountId)
      .single();

    if (accountErr || !account) {
      console.error("[GET /api/billing/status] account fetch error:", accountErr);
      return NextResponse.json(
        { error: "Failed to load billing status" },
        { status: 500 },
      );
    }

    const { data: latestSubmission, error: subErr } = await ctx.supabase
      .from("payment_submissions")
      .select("id, plan, amount_bdt, method, status, created_at, admin_note")
      .eq("account_id", ctx.accountId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subErr) {
      console.error("[GET /api/billing/status] submission fetch error:", subErr);
    }

    const hasPendingSubmission = latestSubmission?.status === "pending";

    const result = computeBillingStatus({
      account,
      hasPendingSubmission,
    });

    return NextResponse.json({
      status: result.status,
      isLocked: result.isLocked,
      trialEndsAt: result.trialEndsAt.toISOString(),
      subscriptionActiveUntil: result.subscriptionActiveUntil?.toISOString() ?? null,
      latestSubmission: latestSubmission ?? null,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
