// ============================================================
// POST /api/platform-admin/payments/[id]
//
// Body: { action: "approve" | "reject", note?: string }
//
// Approve: extends the submission's account.subscription_active_
// until by the plan's day count — from the LATER of "now" or the
// account's current active-until, so a renewal made before expiry
// stacks onto the remaining time instead of discarding it.
// Reject: just marks the row 'rejected' with an optional note;
// the account's access is unaffected (it was never granted).
//
// Platform-owner only, service-role client (see
// GET /api/platform-admin/payments for why).
// ============================================================

import { NextResponse } from "next/server";

import {
  requirePlatformOwner,
  NotPlatformOwnerError,
} from "@/lib/auth/platform-owner";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import { getPlan, isBillingPlanId } from "@/lib/billing/plans";

const MAX_NOTE_LEN = 500;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const owner = await requirePlatformOwner();
    const { id } = await params;

    const body = (await request.json().catch(() => null)) as
      | { action?: unknown; note?: unknown }
      | null;

    const action = body?.action;
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json(
        { error: "'action' must be 'approve' or 'reject'" },
        { status: 400 },
      );
    }
    const note =
      typeof body?.note === "string" ? body.note.trim().slice(0, MAX_NOTE_LEN) : null;

    const admin = supabaseAdmin();

    const { data: submission, error: fetchErr } = await admin
      .from("payment_submissions")
      .select("id, account_id, plan, status")
      .eq("id", id)
      .single();

    if (fetchErr || !submission) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }
    if (submission.status !== "pending") {
      return NextResponse.json(
        { error: `Already ${submission.status} — nothing to do` },
        { status: 409 },
      );
    }
    if (!isBillingPlanId(submission.plan)) {
      return NextResponse.json(
        { error: "Submission has an invalid plan; cannot process" },
        { status: 500 },
      );
    }

    const newStatus = action === "approve" ? "approved" : "rejected";

    const { error: updateErr } = await admin
      .from("payment_submissions")
      .update({
        status: newStatus,
        admin_note: note,
        reviewed_at: new Date().toISOString(),
        reviewed_by_user_id: owner.userId,
      })
      .eq("id", id)
      .eq("status", "pending"); // guard against a double-click race

    if (updateErr) {
      console.error(
        "[POST /api/platform-admin/payments/[id]] update error:",
        updateErr,
      );
      return NextResponse.json(
        { error: "Failed to update payment" },
        { status: 500 },
      );
    }

    if (action === "approve") {
      const plan = getPlan(submission.plan);

      const { data: account, error: accountErr } = await admin
        .from("accounts")
        .select("subscription_active_until")
        .eq("id", submission.account_id)
        .single();

      if (accountErr || !account) {
        console.error(
          "[POST /api/platform-admin/payments/[id]] account fetch error:",
          accountErr,
        );
        return NextResponse.json(
          { error: "Payment approved but failed to extend account — check manually" },
          { status: 500 },
        );
      }

      const now = new Date();
      const currentActiveUntil = account.subscription_active_until
        ? new Date(account.subscription_active_until)
        : null;
      const base = currentActiveUntil && currentActiveUntil > now ? currentActiveUntil : now;
      const newActiveUntil = new Date(base.getTime() + plan.days * 24 * 60 * 60 * 1000);

      const { error: extendErr } = await admin
        .from("accounts")
        .update({ subscription_active_until: newActiveUntil.toISOString() })
        .eq("id", submission.account_id);

      if (extendErr) {
        console.error(
          "[POST /api/platform-admin/payments/[id]] extend error:",
          extendErr,
        );
        return NextResponse.json(
          { error: "Payment approved but failed to extend account — check manually" },
          { status: 500 },
        );
      }

      return NextResponse.json({
        status: "approved",
        subscriptionActiveUntil: newActiveUntil.toISOString(),
      });
    }

    return NextResponse.json({ status: "rejected" });
  } catch (err) {
    if (err instanceof NotPlatformOwnerError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[POST /api/platform-admin/payments/[id]] unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
