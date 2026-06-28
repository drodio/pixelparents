import { adminGate } from "@/lib/admin";
import { can } from "@/lib/grants";
import { NotAuthorized } from "@/components/admin/NotAuthorized";
import { listSponsors, getSponsorProfiles } from "@/lib/sponsors";
import { SponsorsManager } from "@/components/admin/SponsorsManager";

export const dynamic = "force-dynamic";

export default async function AdminSponsorsPage() {
  const gate = await adminGate();
  if (!gate.ok) return <NotAuthorized email={gate.email} />;
  if (!(await can("manage_events"))) return <NotAuthorized email={null} />;
  const sponsorRows = await listSponsors();
  // Attach each sponsor's people so the list can show who's attached at a glance.
  const sponsors = await Promise.all(
    sponsorRows.map(async (s) => ({
      ...s,
      people: (await getSponsorProfiles(s.id)).map((p) => ({ evaluationId: p.evaluationId, fullName: p.fullName })),
    })),
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tight">Sponsors</h1>
        <p className="text-sm text-zinc-500">
          Companies that sponsor events. Assign sponsors to events on each event&apos;s Recap
          page; attach the people who work there on the sponsor&apos;s page.
        </p>
      </header>
      <SponsorsManager initialSponsors={sponsors} />
    </div>
  );
}
