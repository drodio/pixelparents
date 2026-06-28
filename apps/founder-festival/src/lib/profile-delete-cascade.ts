// Single source of truth for "delete one evaluation row and all of its
// dependent rows." Used by the user-initiated /api/account/delete, the
// superadmin /api/admin/profile/[evalId]/delete, AND as the final cleanup step
// of mergeProfiles (after a merge repoints the relationships it wants to keep).
//
// CAUTION: this is irreversible. Callers handle their OWN auth + confirmation.
//
// MAINTAINING THIS LIST:
// Postgres rejects a parent-row delete with a 23503 (foreign-key violation) the
// first time a child row exists for ANY referencing table not handled below.
// Several FKs in schema.ts declare `onDelete: "cascade"`, but the ACTUAL prod
// constraint doesn't always match (e.g. the 2026-05-28 incident). So: ALWAYS add
// an explicit delete here when a new table references evaluations.id, regardless
// of the schema's onDelete clause. Audit: grep schema.ts for
// `references(() => evaluations.id`.

import { inArray, or } from "drizzle-orm";
import { db } from "@/db";
import {
  badgeOverrides,
  connectionPreferences,
  connectionRequests,
  evaluations,
  eventApplicants,
  eventAttendees,
  eventChatComments,
  eventChatThreads,
  eventChatVotes,
  eventContactSharing,
  eventPhotos,
  familyMemberViewers,
  familyMembers,
  hostProfiles,
  profileEmails,
  profileSlugAliases,
  recommendationResponses,
  recommendationVisibility,
  scoreItems,
  scoringJobItems,
  sponsorProfiles,
  users,
} from "@/db/schema";

export async function deleteEvaluationsCascade(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  // Nullable eval links: keep the host record, just unlink the deleted profile.
  // (event_attendees stays as an "unmatched" Luma row; the photo keeps its blob.)
  await db.update(eventAttendees).set({ evaluationId: null }).where(inArray(eventAttendees.evaluationId, ids));
  await db.update(eventPhotos).set({ uploadedByEvaluationId: null }).where(inArray(eventPhotos.uploadedByEvaluationId, ids));

  // Own-data + relationship children — delete (children before the parent eval).
  await db.delete(badgeOverrides).where(inArray(badgeOverrides.evaluationId, ids));
  await db.delete(scoreItems).where(inArray(scoreItems.evaluationId, ids));
  await db.delete(recommendationResponses).where(inArray(recommendationResponses.evaluationId, ids));
  await db.delete(recommendationVisibility).where(inArray(recommendationVisibility.evaluationId, ids));
  await db.delete(scoringJobItems).where(inArray(scoringJobItems.evaluationId, ids));
  await db.delete(profileSlugAliases).where(inArray(profileSlugAliases.evaluationId, ids));
  await db.delete(profileEmails).where(inArray(profileEmails.evaluationId, ids));
  await db.delete(hostProfiles).where(inArray(hostProfiles.evaluationId, ids));
  await db.delete(sponsorProfiles).where(inArray(sponsorProfiles.evaluationId, ids));
  await db.delete(eventContactSharing).where(inArray(eventContactSharing.evaluationId, ids));
  await db.delete(connectionPreferences).where(inArray(connectionPreferences.evaluationId, ids));
  await db
    .delete(connectionRequests)
    .where(or(inArray(connectionRequests.fromEvaluationId, ids), inArray(connectionRequests.toEvaluationId, ids)));
  await db.delete(familyMemberViewers).where(inArray(familyMemberViewers.viewerEvaluationId, ids));
  await db.delete(familyMembers).where(inArray(familyMembers.evaluationId, ids));
  await db.delete(eventChatVotes).where(inArray(eventChatVotes.voterEvalId, ids));
  await db.delete(eventChatComments).where(inArray(eventChatComments.authorEvalId, ids));
  await db.delete(eventChatThreads).where(inArray(eventChatThreads.authorEvalId, ids));
  // event_applicants — event_decision_log FKs it with ON DELETE CASCADE.
  await db.delete(eventApplicants).where(inArray(eventApplicants.evaluationId, ids));
  // Claims last among children (the users → evaluations FK would block the eval).
  await db.delete(users).where(inArray(users.evaluationId, ids));

  // Finally the eval itself.
  await db.delete(evaluations).where(inArray(evaluations.id, ids));
}
