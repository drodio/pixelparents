import { db } from "@/db";
import { events, scoringJobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getViewerScopes, getViewerEmail } from "@/lib/grants";

// Direct-access ownership guards for "theirs"-scoped roles (see role-scope.ts).
// List pages filter what's shown; these guard a record reached directly by id
// (URL, API mutation) so scope can't be bypassed. An "all"-scoped viewer always
// passes; a "theirs"-scoped viewer passes only when the record's created_by_email
// matches their email (a null viewer email fails closed).

async function ownsByEmail(rowEmail: string | null | undefined): Promise<boolean> {
  const viewerEmail = await getViewerEmail();
  if (!viewerEmail) return false; // fail closed
  return (rowEmail ?? "").toLowerCase() === viewerEmail;
}

// Can the viewer act on this event? True when events scope is "all", or the
// event was created by the viewer. Unknown event id → false.
export async function canAccessEvent(eventId: string): Promise<boolean> {
  const scopes = await getViewerScopes();
  if (scopes.events === "all") return true;
  const [row] = await db
    .select({ createdByEmail: events.createdByEmail })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!row) return false;
  return ownsByEmail(row.createdByEmail);
}

// Can the viewer act on this scoring job? True when users scope is "all", or the
// job was created by the viewer. Unknown job id → false.
export async function canAccessJob(jobId: string): Promise<boolean> {
  const scopes = await getViewerScopes();
  if (scopes.users === "all") return true;
  const [row] = await db
    .select({ createdByEmail: scoringJobs.createdByEmail })
    .from(scoringJobs)
    .where(eq(scoringJobs.id, jobId))
    .limit(1);
  if (!row) return false;
  return ownsByEmail(row.createdByEmail);
}

// True when the viewer's Users scope is "theirs" (used to block inherently
// cross-tenant operations like "re-score all profiles").
export async function viewerIsUsersScoped(): Promise<boolean> {
  return (await getViewerScopes()).users === "theirs";
}

// True when the viewer's Events scope is "theirs".
export async function viewerIsEventsScoped(): Promise<boolean> {
  return (await getViewerScopes()).events === "theirs";
}
