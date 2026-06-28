import { db } from "@/db";
import { eventPersonalizedLearnings } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";

// Persisted personalized learnings per (event, attendee). Generation is slow +
// costs credits, so we store and read back rather than regenerate per view.
// Generation is ASYNC: a row is "generating" (html empty, Chief ids set) until
// the chief-insights-sweep cron polls Chief and fills it in ("done") or gives up
// ("failed"). See lib/recommended-connections-store.ts for the mirror.

export type StoredPersonalized = {
  html: string;
  method: string;
  status: string; // "generating" | "done" | "failed"
  error: string | null;
  generatedAt: string;
};

// Synchronous upsert of a finished result (the AI-Gateway path + the AI-vs-Chief
// eval tool, which wait inline). Always lands as "done".
export async function storePersonalizedLearning(
  eventId: string,
  evaluationId: string,
  method: string,
  html: string,
): Promise<void> {
  await db
    .insert(eventPersonalizedLearnings)
    .values({ eventId, evaluationId, method, html, status: "done", error: null, generatedAt: new Date() })
    .onConflictDoUpdate({
      target: [eventPersonalizedLearnings.eventId, eventPersonalizedLearnings.evaluationId],
      set: { method, html, status: "done", error: null, generatedAt: new Date() },
    });
}

// Mark a (re)generation as in-flight: records the Chief chat ids and flips the
// row to "generating". On RE-generate the prior html is intentionally PRESERVED
// (the conflict-update omits html) so the last good answer survives a failed
// regeneration and keeps showing to viewers until a new "done" replaces it.
export async function submitPersonalizedGenerating(
  eventId: string,
  evaluationId: string,
  method: string,
  chiefChatId: string,
  chiefMessageId: string,
): Promise<void> {
  await db
    .insert(eventPersonalizedLearnings)
    .values({ eventId, evaluationId, method, html: "", status: "generating", chiefChatId, chiefMessageId, error: null, generatedAt: new Date() })
    .onConflictDoUpdate({
      target: [eventPersonalizedLearnings.eventId, eventPersonalizedLearnings.evaluationId],
      set: { method, status: "generating", chiefChatId, chiefMessageId, error: null, generatedAt: new Date() }, // html preserved
    });
}

// Cron: rows still generating, with their Chief handle, to poll.
export async function listGeneratingPersonalized(): Promise<
  Array<{ id: string; chiefChatId: string | null; chiefMessageId: string | null; generatedAt: Date }>
> {
  return db
    .select({
      id: eventPersonalizedLearnings.id,
      chiefChatId: eventPersonalizedLearnings.chiefChatId,
      chiefMessageId: eventPersonalizedLearnings.chiefMessageId,
      generatedAt: eventPersonalizedLearnings.generatedAt,
    })
    .from(eventPersonalizedLearnings)
    .where(eq(eventPersonalizedLearnings.status, "generating"));
}

export async function markPersonalizedDone(id: string, html: string): Promise<void> {
  await db
    .update(eventPersonalizedLearnings)
    .set({ html, status: "done", error: null, generatedAt: new Date() })
    .where(eq(eventPersonalizedLearnings.id, id));
}

export async function markPersonalizedFailed(id: string, error: string): Promise<void> {
  await db
    .update(eventPersonalizedLearnings)
    .set({ status: "failed", error })
    .where(eq(eventPersonalizedLearnings.id, id));
}

// One viewer's learnings — the last GOOD answer (any row with non-empty html),
// so a re-generation in flight (or one that failed) keeps showing the prior
// answer instead of hiding it. Null when nothing has ever completed. Deploy-safe.
export async function getStoredPersonalizedForViewer(
  eventId: string,
  evaluationId: string,
): Promise<StoredPersonalized | null> {
  try {
    const [r] = await db
      .select({
        method: eventPersonalizedLearnings.method,
        html: eventPersonalizedLearnings.html,
        status: eventPersonalizedLearnings.status,
        error: eventPersonalizedLearnings.error,
        generatedAt: eventPersonalizedLearnings.generatedAt,
      })
      .from(eventPersonalizedLearnings)
      .where(
        and(
          eq(eventPersonalizedLearnings.eventId, eventId),
          eq(eventPersonalizedLearnings.evaluationId, evaluationId),
          ne(eventPersonalizedLearnings.html, ""),
        ),
      )
      .limit(1);
    if (!r) return null;
    return {
      html: r.html,
      method: r.method,
      status: r.status,
      error: r.error,
      generatedAt: r.generatedAt instanceof Date ? r.generatedAt.toISOString() : String(r.generatedAt),
    };
  } catch {
    return null;
  }
}

// All rows for an event → keyed by evaluation id, INCLUDING generating/failed
// (the admin attendee rows render the live status). Deploy-safe: {} if absent.
export async function getStoredPersonalizedForEvent(
  eventId: string,
): Promise<Record<string, StoredPersonalized>> {
  try {
    const rows = await db
      .select({
        evaluationId: eventPersonalizedLearnings.evaluationId,
        method: eventPersonalizedLearnings.method,
        html: eventPersonalizedLearnings.html,
        status: eventPersonalizedLearnings.status,
        error: eventPersonalizedLearnings.error,
        generatedAt: eventPersonalizedLearnings.generatedAt,
      })
      .from(eventPersonalizedLearnings)
      .where(eq(eventPersonalizedLearnings.eventId, eventId));
    const out: Record<string, StoredPersonalized> = {};
    for (const r of rows) {
      out[r.evaluationId] = {
        html: r.html,
        method: r.method,
        status: r.status,
        error: r.error,
        generatedAt: r.generatedAt instanceof Date ? r.generatedAt.toISOString() : String(r.generatedAt),
      };
    }
    return out;
  } catch {
    return {};
  }
}
