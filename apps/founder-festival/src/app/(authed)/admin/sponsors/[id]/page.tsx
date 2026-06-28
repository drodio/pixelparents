import Link from "next/link";
import { adminGate } from "@/lib/admin";
import { can } from "@/lib/grants";
import { NotAuthorized } from "@/components/admin/NotAuthorized";
import { getSponsorById, getSponsorProfiles } from "@/lib/sponsors";
import { notFound } from "next/navigation";
import { SponsorEditor } from "@/components/admin/SponsorEditor";
import { OrgBadgeEditor } from "@/components/admin/OrgBadgeEditor";
import { listOrgBadges } from "@/lib/org-badges";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function AdminSponsorDetail({ params }: PageProps) {
  const gate = await adminGate();
  if (!gate.ok) return <NotAuthorized email={gate.email} />;
  if (!(await can("manage_events"))) return <NotAuthorized email={null} />;
  const { id } = await params;
  const sponsor = await getSponsorById(id);
  if (!sponsor) notFound();
  const [profiles, orgBadges] = await Promise.all([
    getSponsorProfiles(id),
    listOrgBadges("sponsor", id),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <Link href="/admin/sponsors" className="text-sm text-zinc-400 hover:underline">
          ← Sponsors
        </Link>
        <h1 className="font-display text-2xl font-bold">{sponsor.name}</h1>
      </header>
      <SponsorEditor
        sponsorId={sponsor.id}
        initial={{ name: sponsor.name, blurb: sponsor.blurb ?? "", websiteUrl: sponsor.websiteUrl ?? "", logoUrl: sponsor.logoUrl }}
        initialProfiles={profiles}
      />

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xl font-semibold">Badges</h2>
        <OrgBadgeEditor ownerType="sponsor" ownerId={sponsor.id} initial={orgBadges} />
      </section>
    </div>
  );
}
