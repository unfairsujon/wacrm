-- ============================================================
-- 040_billing.sql — Trial + manual (bKash/Nagad) billing
--
-- UnFair Chat billing model:
--   - Every new account gets a 3-day free trial from creation.
--   - After the trial, the account must be on an active paid
--     period (30-day or 1-year) to keep using the app.
--   - Payment is manual/semi-automatic: the customer sends money
--     to a personal bKash/Nagad number and submits the
--     transaction ID here. The platform owner (not a per-account
--     role — there is exactly one, identified by
--     PLATFORM_OWNER_EMAIL) reviews and approves/rejects from a
--     service-role API route, which then extends
--     accounts.subscription_active_until.
--
-- This migration only adds columns/tables — it does not touch
-- existing RLS on other tables. Idempotent (IF NOT EXISTS
-- throughout; policies dropped before recreate).
-- ============================================================

-- ------------------------------------------------------------
-- ACCOUNTS: trial + active-until columns
-- ------------------------------------------------------------
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '3 days'),
  ADD COLUMN IF NOT EXISTS subscription_active_until TIMESTAMPTZ;

COMMENT ON COLUMN accounts.trial_ends_at IS
  'End of the 3-day free trial, set at account creation.';
COMMENT ON COLUMN accounts.subscription_active_until IS
  'Paid access expires at this timestamp. NULL until the first payment is approved. Extended (not stacked from now()) on each approval — see /api/platform-admin/payments/[id] route.';

-- ------------------------------------------------------------
-- PAYMENT_SUBMISSIONS
--
-- One row per bKash/Nagad transaction the customer claims to
-- have made. Starts 'pending'; the platform owner flips it to
-- 'approved' or 'rejected'. Regular account members can insert
-- (admin+) and read (any member) their own account's rows, but
-- cannot update status themselves — that only happens through
-- the service-role platform-admin API route, enforced by RLS
-- having no UPDATE policy for authenticated members at all.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billing_plan_enum') THEN
    CREATE TYPE billing_plan_enum AS ENUM ('30day', '1year');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method_enum') THEN
    CREATE TYPE payment_method_enum AS ENUM ('bkash', 'nagad');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status_enum') THEN
    CREATE TYPE payment_status_enum AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS payment_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  submitted_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  plan billing_plan_enum NOT NULL,
  amount_bdt INTEGER NOT NULL CHECK (amount_bdt > 0),
  method payment_method_enum NOT NULL,
  sender_number TEXT NOT NULL,
  trx_id TEXT NOT NULL,
  status payment_status_enum NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Prevent the same TrxID being submitted twice across the whole
-- platform (double-spend / accidental resubmit protection).
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_submissions_trx_id
  ON payment_submissions (trx_id);

CREATE INDEX IF NOT EXISTS idx_payment_submissions_account_status
  ON payment_submissions (account_id, status);

CREATE INDEX IF NOT EXISTS idx_payment_submissions_pending
  ON payment_submissions (created_at)
  WHERE status = 'pending';

ALTER TABLE payment_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_submissions_select ON payment_submissions;
CREATE POLICY payment_submissions_select ON payment_submissions
  FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS payment_submissions_insert ON payment_submissions;
CREATE POLICY payment_submissions_insert ON payment_submissions
  FOR INSERT
  WITH CHECK (
    is_account_member(account_id, 'admin')
    AND submitted_by_user_id = auth.uid()
  );

-- No UPDATE/DELETE policy for authenticated users on purpose —
-- approving/rejecting a submission is a platform-owner-only
-- action performed with the service-role key from
-- /api/platform-admin/payments/[id], which bypasses RLS entirely.
