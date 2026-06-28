import { adminGate } from "@/lib/admin";
import { canAccessEvent } from "@/lib/ownership";
import { NotAuthorized } from "@/components/admin/NotAuthorized";
import { ExternalLinkIcon } from "@/components/ExternalLinkIcon";
import { getEventById, listApplicants, getEventPhotos, ensureLumaCoverPhoto, getRescoreableAttendeeProfiles, type ApplicantStatus } from "@/lib/events";
import { db } from "@/db";
import { evaluations } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ApplicantQueueFilters } from "@/components/admin/ApplicantQueueFilters";
import { ApplicantRow } from "@/components/admin/ApplicantRow";
import { ApplicantRowsExpander } from "@/components/admin/ApplicantRowsExpander";
import { BulkAllToolbar } from "@/components/admin/BulkAllToolbar";
import { EventLearningsEditor } from "@/components/admin/EventLearningsEditor";
import { EventDateEditor } from "@/components/admin/EventDateEditor";
import { EventDetailsEditor } from "@/components/admin/EventDetailsEditor";
import { ReimportLumaButton } from "@/components/admin/ReimportLumaButton";
import { descriptionToHtml } from "@/lib/event-recap";
import { EventSlugEditor } from "@/components/admin/EventSlugEditor";
import { EventTitleEditor } from "@/components/admin/EventTitleEditor";
import { EventPhotoManager, type AdminPhoto } from "@/components/admin/EventPhotoManager";
import { EventBadgePicker } from "@/components/admin/EventBadgePicker";
import { getBadgesForEvent } from "@/lib/event-badges-catalog";
import { EventHostPicker } from "@/components/admin/EventHostPicker";
import { listHosts, getHostsForEvent } from "@/lib/hosts";
import { EventSponsorPicker } from "@/components/admin/EventSponsorPicker";
import { listSponsors, getSponsorsForEvent } from "@/lib/sponsors";
import { EventPrioritiesEditor } from "@/components/admin/EventPrioritiesEditor";
import { getEventPriorities } from "@/lib/event-priorities";
import { listEventAttendeesAdmin, getAttendeeScoringStatuses, resolveAttendeeProfileEmails } from "@/lib/event-attendees-admin";
import { AttendeeManager } from "@/components/admin/AttendeeManager";
import { ChiefInsightsPanel } from "@/components/admin/ChiefInsightsPanel";
import { CollapsibleSection } from "@/components/admin/CollapsibleSection";
import { getStoredPersonalizedForEvent } from "@/lib/personalized-store";
import { getStoredConnectionsForEvent } from "@/lib/recommended-connections-store";
import { can, getViewerEmail } from "@/lib/grants";
import { EmailsTextsPanel } from "@/components/admin/email/EmailsTextsPanel";
import { listEventCampaigns, EVENT_EMAIL_FROM_OPTIONS } from "@/lib/event-email-send";
import { getEmailSignatureText } from "@/lib/email-signature";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; minScore?: string; side?: string }>;
};

const ALL_STATUSES: ApplicantStatus[] = ["pending", "scored", "approved", "denied", "waitlist"];

export default async function AdminEventDetail({ params, searchParams }: PageProps) {
  const gate = await adminGate();
  if (!gate.ok) return <NotAuthorized email={gate.email} />;
  const { id } = await params;
  const sp = await searchParams;
  // RBAC scope: a "theirs"-scoped role can only open events it created.
  if (!(await canAccessEvent(id))) return <NotAuthorized email={null} />;
  const event = await getEventById(id);
  if (!event) notFound();

  // Materialize the Luma cover as a real photo row so it shows in the manager as
  // a draggable, captionable photo (idempotent — only inserts once).
  await ensureLumaCoverPhoto(id, event.coverUrl);

  const status = (ALL_STATUSES.includes(sp.status as ApplicantStatus) ? sp.status : "scored") as ApplicantStatus;

  // Fetch the applicant queue for the current status alongside all the recap /
  // content management data — it now all lives on this one page.
  const [applicants, photos, allHosts, eventHostsList, allSponsors, eventSponsorsList, priorities, attendees, eventBadgeList, scoringStatuses, campaigns, emailSignature] = await Promise.all([
    listApplicants({ eventId: event.id, status, limit: 200 }),
    getEventPhotos(id),
    listHosts(),
    getHostsForEvent(id),
    listSponsors(),
    getSponsorsForEvent(id),
    getEventPriorities(id),
    listEventAttendeesAdmin(id),
    getBadgesForEvent(id),
    getAttendeeScoringStatuses(id),
    listEventCampaigns(id),
    getEmailSignatureText(),
  ]);

  // The exact count the "Re-Score All" job would queue (same path as the route),
  // so the button label matches what actually gets re-scored.
  const rescoreableCount = (await getRescoreableAttendeeProfiles(id)).length;
  // Stored Chief insights (per attendee) for the expandable attendee rows.
  const personalizedByEval = await getStoredPersonalizedForEvent(id);
  const connectionsByEval = await getStoredConnectionsForEvent(id);

  const canRescore = await can("run_scoring_jobs");
  // The admin's own email — the default "send preview to" address.
  const viewerEmail = await getViewerEmail();

  const evalIds = applicants.map((a) => a.evaluationId).filter((x): x is string => !!x);
  const evals = evalIds.length
    ? await db.select().from(evaluations).where(inArray(evaluations.id, evalIds))
    : [];
  const evalById = new Map(evals.map((e) => [e.id, e]));

  const allCounts = await Promise.all(
    ALL_STATUSES.map(async (s) => ({
      status: s,
      count: (await listApplicants({ eventId: event.id, status: s, limit: 1000 })).length,
    })),
  );
  // Shown in bold red on the collapsed "Attendance Requests" title (like the
  // left-nav pending badge) so a pending queue is visible even when collapsed.
  const pendingCount = allCounts.find((c) => c.status === "pending")?.count ?? 0;

  const minScoreNum = sp.minScore ? parseInt(sp.minScore, 10) : 0;
  const sideFilter = sp.side === "founder" || sp.side === "investor" ? sp.side : null;

  const filtered = applicants.filter((a) => {
    const ev = a.evaluationId ? evalById.get(a.evaluationId) : null;
    if (!ev) {
      // No eval yet — only show on "either" side with no minScore.
      return !sideFilter && minScoreNum === 0;
    }
    if (sideFilter === "founder" && ev.founderScore <= 0) return false;
    if (sideFilter === "investor" && ev.investorScore <= 0) return false;
    if (minScoreNum > 0) {
      const top = Math.max(ev.founderScore ?? 0, ev.investorScore ?? 0);
      if (top < minScoreNum) return false;
    }
    return true;
  });

  const adminPhotos: AdminPhoto[] = photos.map((p) => ({
    id: p.id,
    blobUrl: p.blobUrl,
    source: p.source,
    visibility: p.visibility,
    caption: p.caption,
    captionManual: p.captionManual,
    sortOrder: p.sortOrder,
  }));

  // ── "Emails & Texts" composer inputs ──────────────────────────────────────
  // A matched attendee whose Luma row has no email (hosts, some registrations)
  // is still emailable via their profile — resolve the claimer's login email /
  // best profile_email as a fallback so e.g. the host can email themselves.
  const matchedEvalIds = attendees.filter((a) => !a.email && a.evaluationId).map((a) => a.evaluationId!);
  const profileEmailByEval = await resolveAttendeeProfileEmails(matchedEvalIds);
  // Only attendees with an email address (stored or resolved) are emailable.
  const emailRecipients = attendees
    .map((a) => ({
      evaluationId: a.evaluationId,
      name: a.name,
      nickname: a.nickname,
      email: a.email ?? (a.evaluationId ? profileEmailByEval.get(a.evaluationId) ?? null : null),
      profileHref: a.profileHref,
      combinedScore: a.combinedScore,
    }))
    .filter((a): a is typeof a & { email: string } => !!a.email);
  // Personalized learnings per attendee (HTML) for the {{personalized-learnings}}
  // variable in the live preview.
  const personalizedHtmlByEval: Record<string, string> = Object.fromEntries(
    Object.entries(personalizedByEval).map(([evalId, v]) => [evalId, v.html]),
  );
  // Attendee insights per attendee (HTML) for the {{recommended-connections}} variable.
  const connectionsHtmlByEval: Record<string, string> = Object.fromEntries(
    Object.entries(connectionsByEval).map(([evalId, v]) => [evalId, v.html]),
  );
  const composerEvent = {
    title: event.title,
    descriptionHtml: event.description ?? null,
    slug: event.slug,
    startsAtIso: event.startsAt.toISOString(),
    venue: event.venue ?? event.location ?? null,
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Event header — always visible (not collapsible). */}
      <header className="flex flex-col gap-1">
        <EventTitleEditor eventId={event.id} initialTitle={event.title} />
        <p className="text-zinc-400 text-sm">
          Capacity {allCounts.find((c) => c.status === "approved")?.count ?? 0} / {event.capacity ?? "∞"} ·
          Mode {event.approvalMode}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <EventSlugEditor eventId={event.id} initialSlug={event.slug} eventTitle={event.title} />
          <a
            href={`/events/${event.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View public page"
            title="View public page"
            className="text-zinc-400 transition-colors hover:text-zinc-100"
          >
            <ExternalLinkIcon size={16} />
          </a>
        </div>
        {event.source === "luma" && (
          <div className="mt-2">
            <ReimportLumaButton eventId={event.id} lumaUrl={event.lumaUrl} />
          </div>
        )}
      </header>

      <CollapsibleSection sectionKey="attendance-requests" title="Attendance Requests" badgeCount={pendingCount}>

        <div className="flex flex-wrap gap-2 text-sm items-center">
          {allCounts.map((c) => (
            <a key={c.status} href={`/admin/events/${event.id}?status=${c.status}`}
               className={`px-3 py-1.5 rounded ${c.status === status ? "bg-white text-black" : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"}`}>
              {c.status} <span className="opacity-60 ml-1">{c.count}</span>
            </a>
          ))}
          {/* Print name badges for the currently-selected status (defaults to
              approved). Opens the QL-800 print sheet in a new tab. */}
          <a
            href={`/admin/events/${event.id}/badges?status=${status}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto px-3 py-1.5 rounded border border-amber-500/60 text-amber-300 hover:bg-amber-500/10"
          >
            🏷️ Print badges
          </a>
        </div>
        <ApplicantQueueFilters eventId={event.id} />
        <BulkAllToolbar eventId={event.id} applicantIds={filtered.map((a) => a.id)} />
        {filtered.length === 0 ? (
          <p className="text-zinc-500 text-sm">
            No applicants in {status}{sideFilter || minScoreNum > 0 ? " matching the current filters" : ""}.
          </p>
        ) : (
          <div className="border border-zinc-800 rounded-md overflow-hidden">
            {/* Horizontal-scroll the ~5-col applicant queue (plus its Actions
                cell) inside its box so it never blows out page width at 390px. */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3">Name / contact</th>
                  <th className="text-left px-4 py-3">F / I</th>
                  <th className="text-left px-4 py-3">Stage</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                <ApplicantRowsExpander
                  colSpan={5}
                  rows={filtered.map((a) => {
                    const ev = a.evaluationId ? evalById.get(a.evaluationId) : null;
                    return (
                      <ApplicantRow
                        key={a.id}
                        applicantId={a.id}
                        eventId={event.id}
                        fullName={a.fullName ?? ev?.fullName ?? null}
                        email={a.email}
                        linkedinUrl={a.linkedinUrl}
                        founderScore={ev?.founderScore ?? null}
                        investorScore={ev?.investorScore ?? null}
                        companyStage={ev?.companyStage ?? null}
                        status={a.status}
                        adminNote={a.adminNote}
                      />
                    );
                  })}
                />
              </tbody>
            </table>
            </div>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection sectionKey="chief-insights" title="Run Chief to generate insights">
        <ChiefInsightsPanel
          eventId={event.id}
          attendees={attendees
            .filter((a) => a.evaluationId)
            .map((a) => ({ evaluationId: a.evaluationId!, name: a.name }))}
          haveLearnings={Object.entries(personalizedByEval).filter(([, v]) => v.status !== "failed").map(([k]) => k)}
          haveConnections={Object.entries(connectionsByEval).filter(([, v]) => v.status !== "failed").map(([k]) => k)}
        />
      </CollapsibleSection>

      <CollapsibleSection sectionKey="attendees" title="Attendees">
        <AttendeeManager eventId={event.id} initialAttendees={attendees} canRescore={canRescore} rescoreableCount={rescoreableCount} initialLearnings={personalizedByEval} initialConnections={connectionsByEval} initialScoringStatuses={scoringStatuses} />
      </CollapsibleSection>

      <CollapsibleSection sectionKey="emails-texts" title="Emails & Texts">
        <EmailsTextsPanel
          eventId={event.id}
          initialCampaigns={campaigns}
          attendees={emailRecipients}
          event={composerEvent}
          personalizedByEval={personalizedHtmlByEval}
          connectionsByEval={connectionsHtmlByEval}
          fromOptions={EVENT_EMAIL_FROM_OPTIONS}
          initialSignature={emailSignature}
          defaultPreviewEmail={viewerEmail ?? "drodio@festival.so"}
        />
      </CollapsibleSection>

      <CollapsibleSection sectionKey="description" title="Description">
        <p className="text-xs text-zinc-500">
          Imported from Luma; editable here. &ldquo;Re-Import from Luma&rdquo; (above) overwrites the
          title + description with the current Luma values.
        </p>
        <EventDetailsEditor eventId={event.id} initialDescriptionHtml={descriptionToHtml(event.description)} />
      </CollapsibleSection>

      <CollapsibleSection sectionKey="date-time" title="Date & time">
        <EventDateEditor
          eventId={event.id}
          initialStartsAt={event.startsAt.toISOString()}
          initialEndsAt={event.endsAt ? event.endsAt.toISOString() : null}
          initialLocation={event.location}
        />
      </CollapsibleSection>

      <CollapsibleSection sectionKey="hosts" title="Hosts">
        <EventHostPicker
          eventId={event.id}
          allHosts={allHosts.map((h) => ({ id: h.id, name: h.name }))}
          initialSelectedIds={eventHostsList.map((h) => h.id)}
        />
      </CollapsibleSection>

      <CollapsibleSection sectionKey="sponsors" title="Sponsors">
        <EventSponsorPicker
          eventId={event.id}
          allSponsors={allSponsors.map((s) => ({ id: s.id, name: s.name }))}
          initialSelectedIds={eventSponsorsList.map((s) => s.id)}
        />
      </CollapsibleSection>

      <CollapsibleSection sectionKey="badges" title="Badges">
        <p className="text-xs text-zinc-500">
          Category badges (e.g. Intimate dinner, Founder + Investor Mixer, Family friendly).
          They show on the event card + page and let visitors filter the events list.
        </p>
        <EventBadgePicker eventId={event.id} initialBadges={eventBadgeList} />
      </CollapsibleSection>

      <CollapsibleSection sectionKey="photos" title="Photos">
        <p className="text-xs text-zinc-500">
          Drag photos to reorder. The first photo is the cover. The Luma cover is pulled in
          as a regular photo you can move, caption, or replace.
        </p>
        <EventPhotoManager eventId={event.id} initialPhotos={adminPhotos} />
      </CollapsibleSection>

      <CollapsibleSection sectionKey="event-priorities" title="Event priorities">
        <EventPrioritiesEditor
          eventId={event.id}
          initial={priorities.map((p) => ({ text: p.text, category: p.category }))}
        />
      </CollapsibleSection>

      <CollapsibleSection sectionKey="learnings" title="Learnings">
        <EventLearningsEditor
          eventId={event.id}
          initialPublic={event.learningsPublic ?? ""}
          initialMembers={event.learningsMembers ?? ""}
          initialAttendees={event.learningsAttendees ?? ""}
        />
        <a
          href={`/admin/events/${event.id}/personalized`}
          className="self-start text-sm text-[#dfa43a] hover:underline"
        >
          ✨ Personalized learnings — eval (AI vs Chief) →
        </a>
      </CollapsibleSection>
    </div>
  );
}
