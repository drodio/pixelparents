import { currentUser } from "@clerk/nextjs/server";
import { can, GRANTS } from "@/lib/grants";
import { isSuperAdmin } from "@/lib/admin";
import { NotAuthorized } from "@/components/admin/NotAuthorized";
import { listRoles } from "@/lib/admin-roles";
import { clampScope } from "@/lib/role-scope";
import { RolesManager } from "@/components/admin/RolesManager";

export const dynamic = "force-dynamic";

export default async function AdminRolesPage() {
  const allowed = (await isSuperAdmin()) || (await can("create_roles")) || (await can("edit_roles"));
  if (!allowed) {
    const user = await currentUser().catch(() => null);
    const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? null;
    return <NotAuthorized email={email} />;
  }
  const roles = await listRoles();
  const serialized = roles.map((r) => ({
    id: r.id,
    name: r.name,
    grants: (r.grants ?? []) as string[],
    costMultiplier: r.costMultiplier,
    usersScope: clampScope(r.usersScope),
    eventsScope: clampScope(r.eventsScope),
  }));
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4 text-sm">
        <a href="/admin" className="link text-sm">← Admin home</a>
      </div>
      <h1 className="font-display text-3xl font-bold tracking-tight">Roles</h1>
      <p className="text-zinc-400 text-sm -mt-2">
        Define roles and the grants each one carries. Assign a role when approving an admin on{" "}
        <a href="/admin/access" className="link">Access</a>.
      </p>
      <RolesManager roles={serialized} grantCatalog={GRANTS} />
    </div>
  );
}
