"use client";

// ============================================================
// Platform-owner-only payment review queue.
//
// Not linked from anywhere in the regular UI (no nav item) — this
// is Sujon's own tool, reached by typing the URL directly. The
// underlying API routes are the real gate (403 for anyone whose
// email isn't PLATFORM_OWNER_EMAIL); this page just renders
// whatever they return, including the 403.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Payment {
  id: string;
  account_id: string;
  plan: "30day" | "1year";
  amount_bdt: number;
  method: "bkash" | "nagad";
  sender_number: string;
  trx_id: string;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  created_at: string;
  accounts: { name: string } | null;
}

export default function PlatformAdminPaymentsPage() {
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/platform-admin/payments?status=pending");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body?.error ?? `Error ${res.status}`);
      setPayments(null);
      return;
    }
    setPayments(body.payments ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id: string, action: "approve" | "reject") => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/platform-admin/payments/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setPayments((prev) => prev?.filter((p) => p.id !== id) ?? null);
      } else {
        const body = await res.json().catch(() => ({}));
        alert(body?.error ?? "Failed");
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 bg-background px-4 py-10">
      <h1 className="text-xl font-semibold text-foreground">
        Pending payments
      </h1>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {payments && payments.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">
          Nothing waiting for review.
        </p>
      )}

      {payments?.map((p) => (
        <Card key={p.id} className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base text-foreground">
              {p.accounts?.name ?? "Unknown account"}
            </CardTitle>
            <Badge variant="outline">{p.method}</Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">Plan</span>
              <span className="text-foreground">
                {p.plan} — ৳{p.amount_bdt}
              </span>
              <span className="text-muted-foreground">From number</span>
              <span className="font-mono text-foreground">
                {p.sender_number}
              </span>
              <span className="text-muted-foreground">Transaction ID</span>
              <span className="font-mono text-foreground">{p.trx_id}</span>
              <span className="text-muted-foreground">Submitted</span>
              <span className="text-foreground">
                {new Date(p.created_at).toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Check this TrxID in your bKash/Nagad app before approving.
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                onClick={() => act(p.id, "approve")}
                disabled={busyId === p.id}
                className="flex-1"
              >
                Approve
              </Button>
              <Button
                onClick={() => act(p.id, "reject")}
                disabled={busyId === p.id}
                variant="outline"
                className="flex-1"
              >
                Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
