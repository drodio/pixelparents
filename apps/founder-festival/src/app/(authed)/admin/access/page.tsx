import { currentUser } from "@clerk/nextjs/server";
import { isSuperAdmin } from "@/lib/admin";
import { can } from "@/lib/grants";
import { NotAuthorized } from "@/components/admin/NotAuthorized";
import { listAdminAccess } from "@/lib/admin-access";
import { listRoles } from "@/lib/admin-roles";
import { AdminAccessTable } from "@/components/admin/AdminAccessTable";
import { AddAdmin } from "@/components/admin/AddAdmin";
import { InviteAdmin } from "@/components/admin/InviteAdmin";

export const dynamic = "force-dynamic";

export default async function AdminAccessPage() {
  // Super-admins, or any admin granted approve_admin_requests, can decide
  // access requests (matches the nav gate + the decision API's requireGrant).
  if (!((await isSuperAdmin()) || (await can("approve_admin_requests")))) {
    const user = await currentUser().catch(() => null);
    const email =
      user?.primaryEmailAddress?.emailAddress ??
      user?.emailAddresses?.[0]?.emailAddress ??
      null;
    return <NotAuthorized email={email} />;
  }

  const [rows, roles] = await Promise.all([listAdminAccess(), listRoles()]);
  const roleMap = new Map(roles.map((r) => [r.id, r.name]));
  // Map to a serializable shape for the client component (Date → ISO string).
  const serialized = rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    imageUrl: r.imageUrl,
    status: r.status,
    requestedAt: r.requestedAt.toISOString(),
    decidedByEmail: r.decidedByEmail,
    roleId: r.roleId,
    roleName: r.roleId ? (roleMap.get(r.roleId) ?? null) : null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4 text-sm">
        <a href="/admin" className="link text-sm">← Admin home</a>
      </div>
      <h1 className="font-display text-3xl font-bold tracking-tight">Admin access</h1>
      <p className="text-zinc-400 text-sm -mt-2">
        Add admins directly, or approve / deny requests for admin access.
      </p>
      <InviteAdmin roles={roles.map((r) => ({ id: r.id, name: r.name }))} />
      <AddAdmin roles={roles.map((r) => ({ id: r.id, name: r.name }))} />
      <AdminAccessTable
        rows={serialized}
        roles={roles.map((r) => ({ id: r.id, name: r.name }))}
      />
    </div>
  );
}
