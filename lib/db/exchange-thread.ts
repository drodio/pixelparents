import { getSql, hasDatabase } from "@/lib/db";

// ---------------------------------------------------------------------------
// Exchange thread — the conversation on a single Community RESPONSE.
//
// When a member responds to a post (an OFFER on an Ask, or a REQUEST on an
// Offer), the POST AUTHOR and the RESPONDER can have a real back-and-forth on
// that response. This module is the data layer for that thread:
//   • `comment` messages — public (anyone viewing the post) or private (only the
//     two parties).
//   • `event_proposal` messages — a proposed calendar event the OTHER party can
//     turn into a real /events entry ("make it an OHS event").
//
// Pure DB access — authorization lives in the server actions
// (app/(authed)/community/[id]/thread-actions.ts). Mirrors lib/db/resources.ts.
//
// DDL is SELF-CONTAINED here (its own memoized ensureThreadTables) rather than in
// the shared lib/db/ensure.ts — the app shares one Neon DB across in-flight
// features and a sibling `drizzle-kit push` could DROP a table it doesn't know
// about (the country-column P0 lesson). Every read/write calls ensureThreadTables()
// first so a cold instance — or a table dropped out from under us — self-heals
// before it queries. All statements are idempotent.
// ---------------------------------------------------------------------------

let ensured: Promise<void> | null = null;
export function ensureThreadTables(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      const sql = getSql();
      await sql.transaction([
        sql`
          CREATE TABLE IF NOT EXISTS response_messages (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            created_at timestamptz NOT NULL DEFAULT now(),
            response_id uuid NOT NULL REFERENCES ask_responses(id) ON DELETE CASCADE,
            ask_id uuid NOT NULL,
            author_signup_id uuid NOT NULL,
            author_clerk_id text,
            kind text NOT NULL DEFAULT 'comment',
            visibility text NOT NULL DEFAULT 'public',
            body text,
            proposed_event jsonb,
            event_id uuid,
            event_status text
          )
        `,
        // Upgrade an older table in place (idempotent ALTERs).
        sql`ALTER TABLE response_messages ADD COLUMN IF NOT EXISTS ask_id uuid`,
        sql`ALTER TABLE response_messages ADD COLUMN IF NOT EXISTS author_clerk_id text`,
        sql`ALTER TABLE response_messages ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'comment'`,
        sql`ALTER TABLE response_messages ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public'`,
        sql`ALTER TABLE response_messages ADD COLUMN IF NOT EXISTS body text`,
        sql`ALTER TABLE response_messages ADD COLUMN IF NOT EXISTS proposed_event jsonb`,
        sql`ALTER TABLE response_messages ADD COLUMN IF NOT EXISTS event_id uuid`,
        sql`ALTER TABLE response_messages ADD COLUMN IF NOT EXISTS event_status text`,
        sql`
          CREATE INDEX IF NOT EXISTS response_messages_response_created_idx
            ON response_messages (response_id, created_at)
        `,
      ]);
    })().catch((e) => {
      ensured = null;
      throw e;
    });
  }
  return ensured;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MessageKind = "comment" | "event_proposal";
export type MessageVisibility = "public" | "private";
export type EventProposalStatus = "proposed" | "accepted" | "declined";

// The event details a proposal carries (mirrors CreateEventInput's user-facing
// fields; dates are ISO strings so the json is serializable).
export type ProposedEvent = {
  title: string;
  startsAt: string; // ISO
  endsAt: string | null; // ISO
  isOnline: boolean;
  location: string | null;
  onlineUrl: string | null;
  allDay: boolean;
};

export type ResponseMessage = {
  id: string;
  createdAt: Date | null;
  responseId: string;
  askId: string;
  authorSignupId: string;
  authorClerkId: string | null;
  kind: MessageKind;
  visibility: MessageVisibility;
  body: string | null;
  proposedEvent: ProposedEvent | null;
  eventId: string | null;
  eventStatus: EventProposalStatus | null;
};

// The two parties + ask id for a response — the authorization context.
export type ResponseParties = {
  askId: string;
  askStatus: string;
  postAuthorSignupId: string;
  responderSignupId: string;
};

type RawMessage = {
  id: string;
  created_at: string | null;
  response_id: string;
  ask_id: string;
  author_signup_id: string;
  author_clerk_id: string | null;
  kind: string;
  visibility: string;
  body: string | null;
  proposed_event: unknown;
  event_id: string | null;
  event_status: string | null;
};

function toDate(s: string | null | undefined): Date | null {
  return s ? new Date(s) : null;
}

function mapMessage(r: RawMessage): ResponseMessage {
  const kind: MessageKind = r.kind === "event_proposal" ? "event_proposal" : "comment";
  const visibility: MessageVisibility = r.visibility === "private" ? "private" : "public";
  const eventStatus: EventProposalStatus | null =
    r.event_status === "proposed" || r.event_status === "accepted" || r.event_status === "declined"
      ? r.event_status
      : null;
  return {
    id: r.id,
    createdAt: toDate(r.created_at),
    responseId: r.response_id,
    askId: r.ask_id,
    authorSignupId: r.author_signup_id,
    authorClerkId: r.author_clerk_id,
    kind,
    visibility,
    body: r.body,
    proposedEvent: (r.proposed_event as ProposedEvent | null) ?? null,
    eventId: r.event_id,
    eventStatus,
  };
}

// ---------------------------------------------------------------------------
// Authorization context
// ---------------------------------------------------------------------------

// Resolve the two parties + ask context for a response id (join ask_responses →
// asks). Used by every server action to authorize: the caller must be the post
// author OR the responder. A forged/unknown response id resolves null.
export async function getResponseParties(responseId: string): Promise<ResponseParties | null> {
  await ensureThreadTables();
  const rows = (await getSql()`
    SELECT
      r.id AS response_id,
      a.id AS ask_id,
      a.status AS ask_status,
      a.author_signup_id AS post_author_signup_id,
      r.responder_signup_id AS responder_signup_id
    FROM ask_responses r
    INNER JOIN asks a ON a.id = r.ask_id
    WHERE r.id = ${responseId}
    LIMIT 1
  `) as unknown as {
    ask_id: string;
    ask_status: string;
    post_author_signup_id: string;
    responder_signup_id: string;
  }[];
  const row = rows[0];
  if (!row) return null;
  return {
    askId: row.ask_id,
    askStatus: row.ask_status,
    postAuthorSignupId: row.post_author_signup_id,
    responderSignupId: row.responder_signup_id,
  };
}

// The parties for the RESPONSE that owns a given message (join through
// response_messages → ask_responses → asks). Used by the event accept/decline +
// delete actions, which are keyed by messageId. Returns the parties plus the
// message's own row so the action can enforce proposer/idempotency rules without a
// second round-trip.
export async function getMessageContext(messageId: string): Promise<
  | (ResponseParties & { message: ResponseMessage })
  | null
> {
  await ensureThreadTables();
  const rows = (await getSql()`
    SELECT
      m.*,
      a.id AS ctx_ask_id,
      a.status AS ctx_ask_status,
      a.author_signup_id AS ctx_post_author_signup_id,
      r.responder_signup_id AS ctx_responder_signup_id
    FROM response_messages m
    INNER JOIN ask_responses r ON r.id = m.response_id
    INNER JOIN asks a ON a.id = r.ask_id
    WHERE m.id = ${messageId}
    LIMIT 1
  `) as unknown as (RawMessage & {
    ctx_ask_id: string;
    ctx_ask_status: string;
    ctx_post_author_signup_id: string;
    ctx_responder_signup_id: string;
  })[];
  const row = rows[0];
  if (!row) return null;
  return {
    askId: row.ctx_ask_id,
    askStatus: row.ctx_ask_status,
    postAuthorSignupId: row.ctx_post_author_signup_id,
    responderSignupId: row.ctx_responder_signup_id,
    message: mapMessage(row),
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

// List messages across a set of responses, oldest first. PUBLIC messages are
// returned for every response; PRIVATE messages are returned ONLY for a response
// the viewer is a party of. `viewerIsPartyByResponseId` maps response id → whether
// this viewer is a party (post author or responder) of that response — the server
// computes it (never trusting the client), and this filter is the privacy gate.
export async function listMessagesForResponses(
  responseIds: string[],
  viewerSignupId: string,
  viewerIsPartyByResponseId: Map<string, boolean>,
): Promise<ResponseMessage[]> {
  if (responseIds.length === 0) return [];
  await ensureThreadTables();
  const rows = (await getSql()`
    SELECT * FROM response_messages
    WHERE response_id = ANY(${responseIds}::uuid[])
    ORDER BY created_at ASC
  `) as unknown as RawMessage[];
  const mapped = rows.map(mapMessage);
  return mapped.filter((m) => {
    if (m.visibility === "public") return true;
    // Private → only when the viewer is a party of THAT response. Author of the
    // private message is always a party, so this also covers "see your own".
    return viewerIsPartyByResponseId.get(m.responseId) === true || m.authorSignupId === viewerSignupId;
  });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function addResponseMessage(input: {
  responseId: string;
  askId: string;
  authorSignupId: string;
  authorClerkId: string | null;
  kind: MessageKind;
  visibility: MessageVisibility;
  body: string | null;
  proposedEvent?: ProposedEvent | null;
  eventStatus?: EventProposalStatus | null;
}): Promise<ResponseMessage> {
  await ensureThreadTables();
  const rows = (await getSql()`
    INSERT INTO response_messages
      (response_id, ask_id, author_signup_id, author_clerk_id, kind, visibility, body, proposed_event, event_status)
    VALUES (
      ${input.responseId},
      ${input.askId},
      ${input.authorSignupId},
      ${input.authorClerkId ?? null},
      ${input.kind},
      ${input.visibility},
      ${input.body ?? null},
      ${input.proposedEvent ? JSON.stringify(input.proposedEvent) : null}::jsonb,
      ${input.eventStatus ?? null}
    )
    RETURNING *
  `) as unknown as RawMessage[];
  return mapMessage(rows[0]!);
}

// Mark an event proposal ACCEPTED and attach the created events row. Scoped so the
// message must be an 'event_proposal' still in 'proposed' state — a
// declined/already-accepted proposal matches 0 rows (idempotency guard at the SQL
// level; the action ALSO checks the loaded status). Returns the updated row or null.
export async function acceptEventProposal(input: {
  messageId: string;
  eventId: string;
}): Promise<ResponseMessage | null> {
  await ensureThreadTables();
  const rows = (await getSql()`
    UPDATE response_messages
    SET event_status = 'accepted', event_id = ${input.eventId}
    WHERE id = ${input.messageId}
      AND kind = 'event_proposal'
      AND event_status = 'proposed'
    RETURNING *
  `) as unknown as RawMessage[];
  return rows[0] ? mapMessage(rows[0]) : null;
}

// Mark an event proposal DECLINED. Scoped to a still-'proposed' proposal so a
// decline can't clobber an accepted one. Returns the updated row or null.
export async function declineEventProposal(messageId: string): Promise<ResponseMessage | null> {
  await ensureThreadTables();
  const rows = (await getSql()`
    UPDATE response_messages
    SET event_status = 'declined'
    WHERE id = ${messageId}
      AND kind = 'event_proposal'
      AND event_status = 'proposed'
    RETURNING *
  `) as unknown as RawMessage[];
  return rows[0] ? mapMessage(rows[0]) : null;
}

// Delete a message — SCOPED to its author (a message owned by someone else matches
// 0 rows → no-op). Returns true if a row was removed.
export async function deleteResponseMessage(input: {
  messageId: string;
  authorSignupId: string;
}): Promise<boolean> {
  await ensureThreadTables();
  const rows = (await getSql()`
    DELETE FROM response_messages
    WHERE id = ${input.messageId} AND author_signup_id = ${input.authorSignupId}
    RETURNING id
  `) as unknown as { id: string }[];
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Rate limit
// ---------------------------------------------------------------------------

// How many messages this author has posted since `sinceMs` (epoch) — backs the
// per-author rate limit. Mirrors countContributionsByAuthorSince.
export async function countMessagesByAuthorSince(
  authorSignupId: string,
  sinceMs: number,
): Promise<number> {
  if (!hasDatabase()) return 0;
  await ensureThreadTables();
  const since = new Date(sinceMs).toISOString();
  const rows = (await getSql()`
    SELECT count(*)::int AS c FROM response_messages
    WHERE author_signup_id = ${authorSignupId} AND created_at >= ${since}
  `) as unknown as { c: number }[];
  return rows[0]?.c ?? 0;
}
