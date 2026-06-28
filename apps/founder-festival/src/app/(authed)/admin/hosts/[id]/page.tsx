import Link from "next/link";
import { adminGate } from "@/lib/admin";
import { can } from "@/lib/grants";
import { NotAuthorized } from "@/components/admin/NotAuthorized";
import { getHostById, getHostStats, getHostProfiles, hostSlug } from "@/lib/hosts";
import { notFound } from "next/navigation";
import { HostEditor } from "@/components/admin/HostEditor";
import { OrgBadgeEditor } from "@/components/admin/OrgBadgeEditor";
import { listOrgBadges } from "@/lib/org-badges";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
      <span className="font-display text-2xl font-bold">{value}</span>
      <span className="text-xs uppercase tracking-wide text-zinc-500 text-center">{label}</span>
    </div>
  );
}

export default async function AdminHostDetail({ params }: PageProps) {
  const gate = await adminGate();
  if (!gate.ok) return <NotAuthorized email={gate.email} />;
  if (!(await can("manage_events"))) return <NotAuthorized email={null} />;
  const { id } = await params;
  const host = await getHostById(id);
  if (!host) notFound();
  const [hs, hostPeople, orgBadges] = await Promise.all([
    getHostStats(id),
    getHostProfiles(id),
    listOrgBadges("host", id),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <Link href="/admin/hosts" className="text-sm text-zinc-400 hover:underline">
          ← Hosts
        </Link>
        <h1 className="font-display text-2xl font-bold">{host.name}</h1>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xl font-semibold">Details</h2>
        <HostEditor
          hostId={host.id}
          initial={{ name: host.name, blurb: host.blurb ?? "", url: host.url ?? "", slug: hostSlug(host), iconUrl: host.iconUrl }}
          initialProfiles={hostPeople}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xl font-semibold">Badges</h2>
        <OrgBadgeEditor ownerType="host" ownerId={host.id} initial={orgBadges} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xl font-semibold">Aggregate stats (all events)</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Events hosted" value={String(hs.eventCount)} />
          <Stat label="Total attendees" value={String(hs.totalAttendees)} />
          <Stat label="Founders" value={String(hs.stats.founderCount)} />
          <Stat label="Investors" value={String(hs.stats.investorCount)} />
          <Stat label="Avg founder score" value={hs.stats.avgFounderScore ? String(hs.stats.avgFounderScore) : "—"} />
          <Stat label="Avg investor score" value={hs.stats.avgInvestorScore ? String(hs.stats.avgInvestorScore) : "—"} />
        </div>
      </section>
    </div>
  );
}
