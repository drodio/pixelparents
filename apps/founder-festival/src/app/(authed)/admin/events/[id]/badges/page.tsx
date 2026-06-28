import { adminGate } from "@/lib/admin";
import { canAccessEvent } from "@/lib/ownership";
import { NotAuthorized } from "@/components/admin/NotAuthorized";
import { getEventById, listApplicants, type ApplicantStatus } from "@/lib/events";
import { db } from "@/db";
import { evaluations } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getCredibilityRadars } from "@/lib/credibility";
import { buildBadgeData, type BadgeData, type BadgeEval } from "@/lib/event-badges";
import { qrSvg } from "@/lib/qr";
import { BadgeRadar } from "@/components/BadgeRadar";
import { AutoPrint } from "@/components/admin/AutoPrint";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
};

const ALL_STATUSES: ApplicantStatus[] = ["pending", "scored", "approved", "denied", "waitlist"];

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://festival.so";

// Print-ready name badges for the Brother QL-800 (62mm continuous DK-2251).
// Each badge is one CSS page (90mm × 62mm landscape) carrying name, company, a
// red mini spider chart, and a QR to the attendee's profile. Opened in a new
// tab from the event page; AutoPrint pops the print dialog. The two-color red
// in the radar prints on the DK-2251's red channel.
export default async function EventBadgesPage({ params, searchParams }: PageProps) {
  const gate = await adminGate();
  if (!gate.ok) return <NotAuthorized email={gate.email} />;
  const { id } = await params;
  const sp = await searchParams;
  if (!(await canAccessEvent(id))) return <NotAuthorized email={null} />;
  const event = await getEventById(id);
  if (!event) notFound();

  const status = (ALL_STATUSES.includes(sp.status as ApplicantStatus) ? sp.status : "approved") as ApplicantStatus;
  const applicants = await listApplicants({ eventId: event.id, status, limit: 1000 });

  const evalIds = applicants.map((a) => a.evaluationId).filter((x): x is string => !!x);
  const evals = evalIds.length
    ? await db
        .select({
          id: evaluations.id,
          fullName: evaluations.fullName,
          founderScore: evaluations.founderScore,
          investorScore: evaluations.investorScore,
          slug: evaluations.slug,
          slugKind: evaluations.slugKind,
          profile: evaluations.profile,
          breakdown: evaluations.breakdown,
        })
        .from(evaluations)
        .where(inArray(evaluations.id, evalIds))
    : [];
  const evalById = new Map(evals.map((e) => [e.id, e]));

  // Build one badge per applicant that has a scored evaluation. getPopulation()
  // (inside getCredibilityRadars) is cached, so the per-attendee cost is just
  // pure bucketing + a QR render.
  const badges: Array<BadgeData & { qr: string }> = [];
  for (const a of applicants) {
    const ev = a.evaluationId ? evalById.get(a.evaluationId) : null;
    if (!ev) continue;
    const radars = await getCredibilityRadars(ev.breakdown);
    const data = buildBadgeData({
      applicantFullName: a.fullName,
      ev: ev as BadgeEval,
      radars,
      siteUrl: SITE_URL,
    });
    const qr = await qrSvg(data.profileUrl);
    badges.push({ ...data, qr });
  }

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @page { size: 90mm 62mm; margin: 0; }
            html, body { margin: 0; padding: 0; background: #fff; }
            .badge-toolbar { padding: 12px 16px; font: 14px ui-sans-serif, system-ui; background: #f4f4f5; border-bottom: 1px solid #e4e4e7; color: #18181b; }
            .badge-toolbar button { margin-left: 8px; padding: 4px 10px; border: 1px solid #18181b; background: #18181b; color: #fff; border-radius: 6px; cursor: pointer; }
            .badge-sheet { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px; background: #e4e4e7; }
            .badge {
              box-sizing: border-box;
              width: 90mm; height: 62mm;
              padding: 4mm 4.5mm;
              background: #fff; color: #000;
              position: relative; overflow: hidden;
              font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
              break-inside: avoid;
            }
            .badge__brand { font-size: 2.6mm; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #e2231a; }
            .badge__name { font-size: 8mm; font-weight: 800; line-height: 1.02; margin-top: 2mm; max-width: 58mm; word-break: break-word; }
            .badge__company { font-size: 3.6mm; color: #444; margin-top: 1.5mm; max-width: 52mm; }
            .badge__radar { position: absolute; top: 3.5mm; right: 4mm; width: 24mm; height: 24mm; }
            .badge__qr { position: absolute; bottom: 4mm; right: 4mm; width: 15mm; height: 15mm; }
            .badge__qr svg { width: 100%; height: 100%; display: block; }
            .badge__qrcap { position: absolute; bottom: 4mm; right: 20mm; width: 26mm; text-align: right; font-size: 2.4mm; color: #666; line-height: 1.1; }
            @media print {
              .badge-toolbar { display: none; }
              .badge-sheet { padding: 0; gap: 0; background: #fff; }
              .badge { page-break-after: always; }
            }
          `,
        }}
      />
      <AutoPrint />
      <div className="badge-toolbar">
        {badges.length} badge{badges.length === 1 ? "" : "s"} · {event.title} · status: {status} · press
        {" "}⌘/Ctrl+P to print again
        {badges.length === 0 && (
          <span> — no scored attendees in this status. Pick another status filter on the event page.</span>
        )}
      </div>
      <div className="badge-sheet">
        {badges.map((b, i) => (
          <div className="badge" key={i}>
            <div className="badge__brand">Founder Festival</div>
            <div className="badge__name">{b.name}</div>
            {b.company && <div className="badge__company">{b.company}</div>}
            <div className="badge__radar">
              <BadgeRadar vectors={b.vectors} size={90} />
            </div>
            <div className="badge__qrcap">scan for profile</div>
            <div className="badge__qr" dangerouslySetInnerHTML={{ __html: b.qr }} />
          </div>
        ))}
      </div>
    </>
  );
}
