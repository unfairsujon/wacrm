"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CheckCircle2, Clock, Copy, LifeBuoy, ShieldAlert } from "lucide-react";
import {
  BILLING_PLANS,
  PAYMENT_RECEIVE_NUMBER,
  TELEGRAM_SUPPORT_URL,
  type BillingPlanId,
  type PaymentMethod,
} from "@/lib/billing/plans";

interface StatusResponse {
  status: "trial" | "active" | "pending_review" | "expired";
  isLocked: boolean;
  trialEndsAt: string;
  subscriptionActiveUntil: string | null;
  latestSubmission: {
    id: string;
    plan: BillingPlanId;
    amount_bdt: number;
    method: PaymentMethod;
    status: "pending" | "approved" | "rejected";
    created_at: string;
    admin_note: string | null;
  } | null;
}

function daysLeft(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export default function BillingPage() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<BillingPlanId>("30day");
  const [method, setMethod] = useState<PaymentMethod>("bkash");
  const [senderNumber, setSenderNumber] = useState("");
  const [trxId, setTrxId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/status");
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCopy = () => {
    navigator.clipboard?.writeText(PAYMENT_RECEIVE_NUMBER).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!senderNumber.trim() || !trxId.trim()) {
      setFormError("Please fill in your number and the transaction ID.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/billing/submit-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, method, senderNumber, trxId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(body?.error ?? "Something went wrong. Please try again.");
        return;
      }
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const selectedPlan = BILLING_PLANS.find((p) => p.id === plan)!;

  return (
    <div className="flex min-h-screen items-start justify-center bg-background px-4 py-10">
      <div className="flex w-full max-w-lg flex-col gap-4">
        {/* Status banner */}
        {data?.status === "trial" && (
          <Card className="border-border bg-card">
            <CardContent className="flex items-center gap-3 py-4">
              <Clock className="h-5 w-5 shrink-0 text-primary" />
              <p className="text-sm text-foreground">
                Your free trial ends in{" "}
                <span className="font-semibold">
                  {daysLeft(data.trialEndsAt)} day
                  {daysLeft(data.trialEndsAt) === 1 ? "" : "s"}
                </span>
                . You can pay any time before or after it ends to keep access.
              </p>
            </CardContent>
          </Card>
        )}

        {data?.status === "active" && data.subscriptionActiveUntil && (
          <Card className="border-border bg-card">
            <CardContent className="flex items-center gap-3 py-4">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Your plan is active.
                </p>
                <p className="text-xs text-muted-foreground">
                  Access until{" "}
                  {new Date(data.subscriptionActiveUntil).toLocaleDateString()}.
                  You can renew any time — it stacks onto your remaining time.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {data?.status === "pending_review" && (
          <Card className="border-border bg-card">
            <CardContent className="flex items-center gap-3 py-4">
              <Clock className="h-5 w-5 shrink-0 text-amber-500" />
              <p className="text-sm text-foreground">
                We received your payment submission and it&apos;s waiting for
                manual review. This is usually quick — contact support below if
                it&apos;s been a while.
              </p>
            </CardContent>
          </Card>
        )}

        {data?.status === "expired" && (
          <Card className="border-border bg-card">
            <CardContent className="flex items-center gap-3 py-4">
              <ShieldAlert className="h-5 w-5 shrink-0 text-red-500" />
              <p className="text-sm text-foreground">
                Your trial or plan has ended. Pay below to restore access —
                your data is safe and untouched.
              </p>
            </CardContent>
          </Card>
        )}

        {data?.latestSubmission?.status === "rejected" && (
          <Card className="border-red-500/30 bg-red-500/5">
            <CardContent className="py-4">
              <p className="text-sm text-foreground">
                Your last submission was rejected
                {data.latestSubmission.admin_note
                  ? `: "${data.latestSubmission.admin_note}"`
                  : "."}{" "}
                Please double-check the transaction ID and try again below.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Only show the payment form when there isn't already a pending one */}
        {data?.status !== "pending_review" && (
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">Choose a plan</CardTitle>
              <CardDescription>
                One-time payment via bKash or Nagad. Reviewed and activated by
                hand — usually fast.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                <RadioGroup
                  value={plan}
                  onValueChange={(v) => setPlan(v as BillingPlanId)}
                  className="grid grid-cols-2 gap-3"
                >
                  {BILLING_PLANS.map((p) => (
                    <Label
                      key={p.id}
                      htmlFor={`plan-${p.id}`}
                      className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 ${
                        plan === p.id
                          ? "border-primary bg-primary/10"
                          : "border-border"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value={p.id} id={`plan-${p.id}`} />
                        <span className="text-sm font-medium text-foreground">
                          {p.label}
                        </span>
                      </div>
                      <span className="text-lg font-semibold text-foreground">
                        ৳{p.priceBdt}
                      </span>
                    </Label>
                  ))}
                </RadioGroup>

                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">
                    Send{" "}
                    <span className="font-semibold text-foreground">
                      ৳{selectedPlan.priceBdt}
                    </span>{" "}
                    via bKash or Nagad (Send Money) to:
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-lg font-mono font-semibold text-foreground">
                      {PAYMENT_RECEIVE_NUMBER}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Copy number"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    {copied && (
                      <span className="text-xs text-primary">Copied</span>
                    )}
                  </div>
                </div>

                <RadioGroup
                  value={method}
                  onValueChange={(v) => setMethod(v as PaymentMethod)}
                  className="flex gap-4"
                >
                  <Label htmlFor="method-bkash" className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                    <RadioGroupItem value="bkash" id="method-bkash" />
                    bKash
                  </Label>
                  <Label htmlFor="method-nagad" className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                    <RadioGroupItem value="nagad" id="method-nagad" />
                    Nagad
                  </Label>
                </RadioGroup>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="senderNumber" className="text-muted-foreground">
                    The number you sent money FROM
                  </Label>
                  <Input
                    id="senderNumber"
                    value={senderNumber}
                    onChange={(e) => setSenderNumber(e.target.value)}
                    placeholder="01XXXXXXXXX"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="trxId" className="text-muted-foreground">
                    Transaction ID (TrxID)
                  </Label>
                  <Input
                    id="trxId"
                    value={trxId}
                    onChange={(e) => setTrxId(e.target.value)}
                    placeholder="e.g. 9G7H2K3ABC"
                  />
                </div>

                {formError && (
                  <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                    {formError}
                  </div>
                )}

                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? "Submitting…" : "I've sent the payment"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground">
            Back to dashboard
          </Link>
          <a
            href={TELEGRAM_SUPPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-foreground"
          >
            <LifeBuoy className="h-4 w-4" />
            Contact support
          </a>
        </div>
      </div>
    </div>
  );
}
