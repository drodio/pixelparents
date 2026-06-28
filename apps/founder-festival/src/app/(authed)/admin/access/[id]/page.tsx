import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { isSuperAdmin } from "@/lib/admin";
import { can } from "@/lib/grants";
import { NotAuthorized } from "@/components/admin/NotAuthorized";
import { getAdminAccessById } from "@/lib/admin-access";
import { getAdminAssignments } from "@/lib/org-badges";
import { listHosts } from "@/lib/hosts";
import { listSponsors } from "@/lib/sponsors";
import { AdminDetailEditor } from "@/components/admin/AdminDetailEditor";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function AdminDetailPage({ params }: PageProps) {
  // Same gate as the access list: super-admin or approve_admin_requests.
  if (!((await isSuperAdmin()) || (await can("approve_admin_requests")))) {
    const user = await currentUser().catch(() => null);
    const email =
      user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? null;
    return <NotAuthorized email={email} />;
  }

  const { id } = await params;
  const row = await getAdminAccessById(id);
  if (!row) notFound();

  const [hosts, sponsors, assignments] = await Promise.all([
    listHosts(),
    listSponsors(),
    getAdminAssignments(row.clerkUserId),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <Link href="/admin/access" className="text-sm text-zinc-400 hover:underline">
          ← Admin access
        </Link>
        <h1 className="font-display text-2xl font-bold">{row.name ?? row.email ?? "Admin"}</h1>
        {row.email && <p className="text-sm text-zinc-500">{row.email}</p>}
      </header>

      <AdminDetailEditor
        accessId={row.id}
        initialName={row.name ?? ""}
        hosts={hosts.map((h) => ({ id: h.id, name: h.name }))}
        sponsors={sponsors.map((s) => ({ id: s.id, name: s.name }))}
        initialAssignments={assignments}
      />
    </div>
  );
}
