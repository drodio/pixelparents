import { db } from "@/db";
import { eventRecommendedConnections } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";

// Persisted "Attendee Insights" (Recommended Connections) per (event, attendee).
// Sibling of personalized-store.ts (same async-generation lifecycle): a row is
// "generating" (html empty, Chief ids set) until the chief-insights-sweep cron
// polls Chief and fills it in ("done") or gives up ("failed"). All reads are
// deploy-safe (return null/{} if the table isn't present yet).

export type StoredConnections = {
  html: string;
  method: string;
  status: string; // "generating" | "done" | "failed"
  error: string | null;
  generatedAt: string;
};

// Synchronous upsert of a finished result (kept for parity / non-async callers).
export async function storeRecommendedConnections(
  eventId: string,
  evaluationId: string,
  method: string,
  html: string,
): Promise<void> {
  await db
    .insert(eventRecommendedConnections)
    .values({ eventId, evaluationId, method, html, status: "done", error: null, generatedAt: new Date() })
    .onConflictDoUpdate({
      target: [eventRecommendedConnections.eventId, eventRecommendedConnections.evaluationId],
      set: { method, html, status: "done", error: null, generatedAt: new Date() },
    });
}

// Mark a (re)generation as in-flight. On RE-generate the prior html is PRESERVED
// (the conflict-update omits html) so the last good answer survives a failed
// regeneration and keeps showing to viewers until a new "done" replaces it.
export async function submitConnectionsGenerating(
  eventId: string,
  evaluationId: string,
  method: string,
  chiefChatId: string,
  chiefMessageId: string,
): Promise<void> {
  await db
    .insert(eventRecommendedConnections)
    .values({ eventId, evaluationId, method, html: "", status: "generating", chiefChatId, chiefMessageId, error: null, generatedAt: new Date() })
    .onConflictDoUpdate({
      target: [eventRecommendedConnections.eventId, eventRecommendedConnections.evaluationId],
      set: { method, status: "generating", chiefChatId, chiefMessageId, error: null, generatedAt: new Date() }, // html preserved
    });
}

// Cron: rows still generating, with their Chief handle, to poll.
export async function listGeneratingConnections(): Promise<
  Array<{ id: string; chiefChatId: string | null; chiefMessageId: string | null; generatedAt: Date }>
> {
  return db
    .select({
      id: eventRecommendedConnections.id,
      chiefChatId: eventRecommendedConnections.chiefChatId,
      chiefMessageId: eventRecommendedConnections.chiefMessageId,
      generatedAt: eventRecommendedConnections.generatedAt,
    })
    .from(eventRecommendedConnections)
    .where(eq(eventRecommendedConnections.status, "generating"));
}

export async function markConnectionsDone(id: string, html: string): Promise<void> {
  await db
    .update(eventRecommendedConnections)
    .set({ html, status: "done", error: null, generatedAt: new Date() })
    .where(eq(eventRecommendedConnections.id, id));
}

export async function markConnectionsFailed(id: string, error: string): Promise<void> {
  await db
    .update(eventRecommendedConnections)
    .set({ status: "failed", error })
    .where(eq(eventRecommendedConnections.id, id));
}

// One viewer's connections — the last GOOD answer (any row with non-empty html),
// so a re-generation in flight (or one that failed) keeps showing the prior
// answer. Null when nothing has ever completed.
export async function getStoredConnectionsForViewer(
  eventId: string,
  evaluationId: string,
): Promise<StoredConnections | null> {
  try {
    const [r] = await db
      .select({
        method: eventRecommendedConnections.method,
        html: eventRecommendedConnections.html,
        status: eventRecommendedConnections.status,
        error: eventRecommendedConnections.error,
        generatedAt: eventRecommendedConnections.generatedAt,
      })
      .from(eventRecommendedConnections)
      .where(
        and(
          eq(eventRecommendedConnections.eventId, eventId),
          eq(eventRecommendedConnections.evaluationId, evaluationId),
          ne(eventRecommendedConnections.html, ""),
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
// (the admin rows render the live status). Deploy-safe: {} if absent.
export async function getStoredConnectionsForEvent(
  eventId: string,
): Promise<Record<string, StoredConnections>> {
  try {
    const rows = await db
      .select({
        evaluationId: eventRecommendedConnections.evaluationId,
        method: eventRecommendedConnections.method,
        html: eventRecommendedConnections.html,
        status: eventRecommendedConnections.status,
        error: eventRecommendedConnections.error,
        generatedAt: eventRecommendedConnections.generatedAt,
      })
      .from(eventRecommendedConnections)
      .where(eq(eventRecommendedConnections.eventId, eventId));
    const out: Record<string, StoredConnections> = {};
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
