// ============================================================
// Platform-owner check — for the single person operating this
// UnFair Chat deployment (Sujon), NOT a per-account role.
//
// There is no "platform admin" table. The owner is identified by
// email against PLATFORM_OWNER_EMAIL (set in the deployment's env
// vars). This keeps the multi-tenant RLS model untouched: regular
// accounts and their RLS policies know nothing about this — the
// routes that use this helper switch to the service-role client
// (supabaseAdmin) to read/write across every account on purpose.
//
// Set PLATFORM_OWNER_EMAIL in Railway to the login email you use
// for UnFair Chat. Until it's set, every platform-admin route
// returns 403 for everyone — fails closed, not open.
// ============================================================

import { createClient } from "@/lib/supabase/server";

export class NotPlatformOwnerError extends Error {
  readonly status = 403 as const;
  constructor(message = "Not authorized") {
    super(message);
    this.name = "NotPlatformOwnerError";
  }
}

/**
 * Throws unless the logged-in user's email matches
 * `PLATFORM_OWNER_EMAIL`. Returns the user's id/email on success
 * so callers can log who approved/rejected a payment.
 */
export async function requirePlatformOwner(): Promise<{
  userId: string;
  email: string;
}> {
  const ownerEmail = process.env.PLATFORM_OWNER_EMAIL?.trim().toLowerCase();
  if (!ownerEmail) {
    throw new NotPlatformOwnerError(
      "PLATFORM_OWNER_EMAIL is not configured on this deployment",
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email || user.email.toLowerCase() !== ownerEmail) {
    throw new NotPlatformOwnerError();
  }

  return { userId: user.id, email: user.email };
}
