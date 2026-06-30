import type { Metadata } from "next";
import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { isAdminEmail } from "@/lib/admin";
import { getSignupByEmail } from "@/lib/db/signups";
import { readApprovalStatus, type ApprovalStatus } from "@/lib/approval";
import { listNotifications } from "@/lib/db/notifications";
import { DashboardShell } from "@/components/dashboard-shell";
import { SignedOutPanel } from "@/components/signed-out-panel";
import { NotificationsClient } from "./notifications-client";

// The notifications CENTER. Renders inside the DashboardShell tab. Identity is
// resolved server-side from the Clerk session; the list is scoped to the caller's
// own signup id (the data layer keys on recipient_signup_id). Unlike the
// community/events surfaces this isn't gated on verification — anyone with a
// signup can read notifications addressed to them. A signed-out / no-signup
// visitor gets the locked shell + sign-in prompt (no PII rendered).

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Notifications — Pixel Parents",
  robots: { index: false, follow: false },
};

export default async function NotificationsPage() {
  const user = await currentUser();
  const email = user ? primaryEmail(user) : null;

  // Signed out → locked shell with the sign-in prompt (mirrors the other tabs).
  if (!user || !email) {
    return (
      <DashboardShell authed={false} firstName={null} email={null} status={null}>
        <SignedOutPanel area="notifications" />
      </DashboardShell>
    );
  }

  const [signup, isAdmin] = await Promise.all([getSignupByEmail(email), isAdminEmail(email)]);
  const firstName = signup?.firstName ?? user.firstName ?? null;
  const status: ApprovalStatus | null = signup
    ? readApprovalStatus((signup.extra ?? {}) as Record<string, unknown>)
    : null;

  // Load the caller's notifications (empty when they have no signup row yet).
  const notifications = signup ? await listNotifications(signup.id) : [];

  return (
    <DashboardShell firstName={firstName} email={email} status={status} isAdmin={isAdmin}>
      <NotificationsClient initial={notifications} />
    </DashboardShell>
  );
}
