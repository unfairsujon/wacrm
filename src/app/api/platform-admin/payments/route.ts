// ============================================================
// GET /api/platform-admin/payments
//
// Lists payment_submissions across EVERY account — this is the
// one place in the app that intentionally reads cross-tenant.
// Restricted to the platform owner (see
// src/lib/auth/platform-owner.ts) and uses the service-role
// client, since no per-account RLS policy grants this by design.
// ============================================================

import { NextResponse } from "next/server";

import {
  requirePlatformOwner,
  NotPlatformOwnerError,
} from "@/lib/auth/platform-owner";
import { supabaseAdmin } from "@/lib/flows/admin-client";

export async function GET(request: Request) {
  try {
    await requirePlatformOwner();

    const url = new URL(request.url);
    const statusFilter = url.searchParams.get("status") ?? "pending";

    let query = supabaseAdmin()
      .from("payment_submissions")
      .select(
        "id, account_id, plan, amount_bdt, method, sender_number, trx_id, status, admin_note, created_at, reviewed_at, accounts(name)",
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[GET /api/platform-admin/payments] query error:", error);
      return NextResponse.json(
        { error: "Failed to load payments" },
        { status: 500 },
      );
    }

    return NextResponse.json({ payments: data ?? [] });
  } catch (err) {
    if (err instanceof NotPlatformOwnerError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[GET /api/platform-admin/payments] unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
