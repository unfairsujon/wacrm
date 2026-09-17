// ============================================================
// Billing status — pure function over account + pending-submission
// data, so middleware (edge-friendly, no extra query shape needed)
// and the /billing page compute the exact same thing.
// ============================================================

export type BillingStatus = "trial" | "active" | "pending_review" | "expired";

export interface BillingAccountRow {
  trial_ends_at: string; // ISO timestamp
  subscription_active_until: string | null;
}

export interface ComputeBillingStatusInput {
  account: BillingAccountRow;
  hasPendingSubmission: boolean;
  now?: Date;
}

export interface BillingStatusResult {
  status: BillingStatus;
  trialEndsAt: Date;
  subscriptionActiveUntil: Date | null;
  /** True when the app should block normal usage and redirect to /billing. */
  isLocked: boolean;
}

export function computeBillingStatus({
  account,
  hasPendingSubmission,
  now = new Date(),
}: ComputeBillingStatusInput): BillingStatusResult {
  const trialEndsAt = new Date(account.trial_ends_at);
  const subscriptionActiveUntil = account.subscription_active_until
    ? new Date(account.subscription_active_until)
    : null;

  const trialActive = now < trialEndsAt;
  const subscriptionActive =
    subscriptionActiveUntil !== null && now < subscriptionActiveUntil;

  let status: BillingStatus;
  if (subscriptionActive) {
    status = "active";
  } else if (trialActive) {
    status = "trial";
  } else if (hasPendingSubmission) {
    status = "pending_review";
  } else {
    status = "expired";
  }

  return {
    status,
    trialEndsAt,
    subscriptionActiveUntil,
    // Only "active" and "trial" get full access. A pending review
    // still shows the waiting screen rather than the app — it's
    // not verified yet, so it isn't billed access yet either.
    isLocked: status === "expired" || status === "pending_review",
  };
}
