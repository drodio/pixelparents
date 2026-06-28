import { chiefPoll } from "@/lib/chief";
import { sanitizeRecapHtml } from "@/lib/event-recap";
import {
  listGeneratingPersonalized,
  markPersonalizedDone,
  markPersonalizedFailed,
} from "@/lib/personalized-store";
import {
  listGeneratingConnections,
  markConnectionsDone,
  markConnectionsFailed,
} from "@/lib/recommended-connections-store";

// Advances in-flight Chief insight generations (personalized learnings + attendee
// insights). For each row still "generating", polls its Chief message: when the
// answer lands it's sanitized + stored ("done"); a row that has been generating
// too long is failed so the UI stops spinning. Each poll is a fast GET, so no
// single cron run blocks — the work spreads across ticks. Idempotent + safe on a
// schedule. See the chief-insights-sweep cron route.

// Give Chief generous headroom (research can take 6+ min) before declaring a
// generation dead. After this, the row flips to "failed" with an error.
const STALE_MS = 15 * 60 * 1000;

type GenRow = { id: string; chiefChatId: string | null; chiefMessageId: string | null; generatedAt: Date };

async function advanceOne(
  row: GenRow,
  now: number,
  markDone: (id: string, html: string) => Promise<void>,
  markFailed: (id: string, error: string) => Promise<void>,
): Promise<"done" | "failed" | "pending"> {
  const age = now - new Date(row.generatedAt).getTime();
  if (!row.chiefChatId || !row.chiefMessageId) {
    await markFailed(row.id, "Missing Chief handle");
    return "failed";
  }
  const poll = await chiefPoll({ chatId: row.chiefChatId, messageId: row.chiefMessageId });
  if (poll.status === "ready") {
    await markDone(row.id, sanitizeRecapHtml(poll.text) || poll.text.trim());
    return "done";
  }
  // pending or a transient error this tick — only give up once it's clearly stale.
  if (age > STALE_MS) {
    await markFailed(row.id, "Timed out waiting for Chief (no response after 15 min)");
    return "failed";
  }
  return "pending";
}

export async function sweepChiefInsights(): Promise<{
  learnings: { done: number; failed: number; pending: number };
  connections: { done: number; failed: number; pending: number };
}> {
  const now = Date.now();
  const tally = () => ({ done: 0, failed: 0, pending: 0 });
  const learnings = tally();
  const connections = tally();

  const [pers, conn] = await Promise.all([listGeneratingPersonalized(), listGeneratingConnections()]);

  // Poll sequentially within each kind to keep Chief request pressure modest;
  // the two kinds run concurrently.
  await Promise.all([
    (async () => {
      for (const row of pers) {
        const r = await advanceOne(row, now, markPersonalizedDone, markPersonalizedFailed);
        learnings[r]++;
      }
    })(),
    (async () => {
      for (const row of conn) {
        const r = await advanceOne(row, now, markConnectionsDone, markConnectionsFailed);
        connections[r]++;
      }
    })(),
  ]);

  return { learnings, connections };
}
