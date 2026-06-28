import { currentUser } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { isAdmin, isSuperAdmin } from "@/lib/admin";
import { getViewerGrants } from "@/lib/grants";
import { getAdminAccessStatus, type AdminAccessStatus } from "@/lib/admin-access";
import { AdminAccessGate } from "@/components/admin/AdminAccessGate";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminBreadcrumbs } from "@/components/admin/AdminBreadcrumbs";
import { buildAdminBreadcrumbs } from "@/lib/admin-breadcrumbs";
import { getPendingItemsCount } from "@/lib/pending-items";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // The admin-invite acceptance page lives under /admin but MUST render for
  // not-yet-admins — an invitee is by definition not an admin until they
  // redeem. Skip the gate (and the admin chrome) for it; the redeem API's
  // token + verified-email check is the real security boundary. Path comes
  // from the x-pathname header set in proxy.ts.
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (pathname.startsWith("/admin/accept-invite")) {
    return (
      <div className="flex flex-col flex-1 bg-[#151515] text-zinc-100">
        {children}
      </div>
    );
  }

  const user = await currentUser().catch(() => null);
  const admin = await isAdmin();

  // Not an admin → render the sign-in / request-access gate instead of bouncing
  // home, so a user can log in (no profile claim) and ask for access right here.
  if (!admin) {
    const dbStatus: AdminAccessStatus = user
      ? await getAdminAccessStatus(user.id)
      : "none";
    // The gate only ever shows none/pending/denied (approved users are admins).
    const gateStatus = dbStatus === "approved" ? "none" : dbStatus;
    const email =
      user?.primaryEmailAddress?.emailAddress ??
      user?.emailAddresses?.[0]?.emailAddress ??
      null;
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-[#151515] text-zinc-100 px-6 py-16">
        <AdminAccessGate signedIn={!!user} email={email} status={gateStatus} />
      </div>
    );
  }

  // The viewer's effective grants drive which nav sections show (super-admins
  // and env-bootstrap admins get all). RBAC roles can toggle each section.
  const grants = await getViewerGrants();
  const superAdmin = await isSuperAdmin();
  // Pending-items badge count — only computed for viewers who can see the section
  // (manage_pending), so we don't run the aggregation for everyone.
  const pendingCount = grants.includes("manage_pending") ? await getPendingItemsCount() : 0;
  const host = (await headers()).get("host") ?? "";
  const envLabel =
    host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "DEV" : "PROD";
  const envColor = envLabel === "PROD" ? "#dfa43a" : "#3a8fdf";
  // Breadcrumb trail (Admin › Section › Detail) derived from the path. Resolves
  // dynamic ids (event/host/sponsor/ticket) to names; best-effort, never throws.
  const crumbs = await buildAdminBreadcrumbs(pathname).catch(() => []);

  return (
    <div className="flex flex-col md:flex-row flex-1 bg-[#151515] text-zinc-100">
      <AdminNav grants={grants} isSuperAdmin={superAdmin} envLabel={envLabel} envColor={envColor} host={host} pendingCount={pendingCount} />
      {/* min-w-0 lets this flex child shrink below its content width so the wide
          data tables scroll inside their own overflow-x-auto wrappers instead of
          stretching the whole page (which would force a horizontal page scroll
          on mobile). */}
      <main className="flex-1 min-w-0 px-4 sm:px-6 py-6 sm:py-8 max-w-[1600px] w-full mx-auto">
        <AdminBreadcrumbs crumbs={crumbs} />
        {children}
      </main>
    </div>
  );
}
