// ============================================================
// Billing plan catalog — single source of truth for prices/labels.
//
// Changing a price here only affects *new* submissions; already
// -approved payments keep the `amount_bdt` they were submitted
// and approved with (see payment_submissions table), so past
// receipts stay accurate even if prices change later.
// ============================================================

export type BillingPlanId = "30day" | "1year";

export interface BillingPlan {
  id: BillingPlanId;
  label: string;
  days: number;
  priceBdt: number;
}

export const BILLING_PLANS: readonly BillingPlan[] = [
  { id: "30day", label: "30 Days", days: 30, priceBdt: 1000 },
  { id: "1year", label: "1 Year", days: 365, priceBdt: 3000 },
];

export function getPlan(id: BillingPlanId): BillingPlan {
  const plan = BILLING_PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`Unknown billing plan: ${id}`);
  return plan;
}

export function isBillingPlanId(value: unknown): value is BillingPlanId {
  return value === "30day" || value === "1year";
}

export const TRIAL_DAYS = 3;

/** Personal bKash/Nagad number payments are sent to (semi-manual review). */
export const PAYMENT_RECEIVE_NUMBER = "01745479863";

export const TELEGRAM_SUPPORT_URL = "https://t.me/UNFAIRSUJON";

export type PaymentMethod = "bkash" | "nagad";

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return value === "bkash" || value === "nagad";
}
