import { adminGate } from "@/lib/admin";
import { can } from "@/lib/grants";
import { NotAuthorized } from "@/components/admin/NotAuthorized";
import { listHosts } from "@/lib/hosts";
import { HostsManager } from "@/components/admin/HostsManager";

export const dynamic = "force-dynamic";

export default async function AdminHostsPage() {
  const gate = await adminGate();
  if (!gate.ok) return <NotAuthorized email={gate.email} />;
  if (!(await can("manage_events"))) return <NotAuthorized email={null} />;
  const hosts = await listHosts();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tight">Hosts</h1>
        <p className="text-sm text-zinc-500">
          Organizations that host events (e.g. District, Agate Hound). Assign hosts to events
          on each event&apos;s Recap page.
        </p>
      </header>
      <HostsManager initialHosts={hosts} />
    </div>
  );
}
