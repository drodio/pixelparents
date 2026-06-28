# Connection Introduction Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On connection approval, stop revealing raw email/LinkedIn and instead email a double-opt-in intro to both people (reply-all to connect) with their profile links + a clickable event link.

**Architecture:** A pure `buildConnectionIntroEmail` + a `sendConnectionIntroEmail` (Resend, `to: [a,b]`) in `email.ts`; a shared `introduceConnection(row, origin)` in `attendee-connections.ts` called best-effort from both approval routes; `getEventDirectory` no longer reveals contact on approval; `decideConnectionRequest` guarded to pending-only for exactly-once intros.

**Tech Stack:** Next.js App Router, Resend, Drizzle/Neon, Vitest (node).

**Spec:** `docs/superpowers/specs/2026-06-09-connection-intro-email-design.md`
**Branch:** `connection-intro-email` (created; spec committed).

> **PRD reminder:** `.husky/pre-commit` requires a `PRD/connection-intro-email.md` entry staged with each commit. Use `git -c core.hooksPath=.husky commit`; never `--no-verify`.

---

### Task 1: Intro email builder + sender (TDD)

**Files:** Modify `src/lib/email.ts`; Create `tests/lib/connection-intro-email.test.ts`; `PRD/connection-intro-email.md`

- [ ] **Step 1: Failing test** — create `tests/lib/connection-intro-email.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildConnectionIntroEmail } from "@/lib/email";

const base = {
  nameA: "Ada Lovelace",
  nameB: "Alan Turing",
  eventTitle: "Founder Dinner",
  eventUrl: "https://festival.so/events/founder-dinner",
  dateStr: "June 3, 2026",
  profileUrlA: "https://festival.so/profile/founder/ada-lovelace",
  profileUrlB: "https://festival.so/profile/founder/alan-turing",
};

describe("buildConnectionIntroEmail", () => {
  it("puts both names, the event, and the date in the subject", () => {
    const { subject } = buildConnectionIntroEmail(base);
    expect(subject).toBe("Festival: Connecting Ada Lovelace ←→ Alan Turing from Founder Dinner on June 3, 2026");
  });

  it("links the event name and lists both profile links + the sign-off", () => {
    const { html } = buildConnectionIntroEmail(base);
    expect(html).toContain('<a href="https://festival.so/events/founder-dinner">Founder Dinner</a>');
    expect(html).toContain('<a href="https://festival.so/profile/founder/ada-lovelace">Ada Lovelace</a>');
    expect(html).toContain('<a href="https://festival.so/profile/founder/alan-turing">Alan Turing</a>');
    expect(html).toContain("Hope it&#39;s a valuable connection!");
    expect(html).toContain("#Velocity,<br>DROdio");
  });

  it("escapes HTML in names", () => {
    const { html } = buildConnectionIntroEmail({ ...base, nameA: "A <b>& co" });
    expect(html).toContain("A &lt;b&gt;&amp; co");
    expect(html).not.toContain("<b>&");
  });
});
```

> Note: the body text "Hope it's a valuable connection!" is authored with an HTML-escaped apostrophe (`&#39;`) in the template, hence the assertion.

- [ ] **Step 2: Run, expect FAIL** — `pnpm exec vitest run tests/lib/connection-intro-email.test.ts` → `buildConnectionIntroEmail` not exported.

- [ ] **Step 3: Implement in `src/lib/email.ts`.** Add these two exports (after `sendConnectionRequestEmail`). They use the existing module-private `escapeHtml`, `FROM`, and `client()`:

```ts
// Build the double-opt-in introduction email sent to BOTH people when a
// connection request is approved. Pure (no send) so it's unit-testable. Names
// are user-supplied → escaped. eventUrl/profileUrls are app-built → trusted.
export function buildConnectionIntroEmail(opts: {
  nameA: string;
  nameB: string;
  eventTitle: string;
  eventUrl: string;
  dateStr: string;
  profileUrlA: string;
  profileUrlB: string;
}): { subject: string; html: string } {
  const a = escapeHtml(opts.nameA);
  const b = escapeHtml(opts.nameB);
  const title = escapeHtml(opts.eventTitle);
  const date = escapeHtml(opts.dateStr);
  const subject = `Festival: Connecting ${opts.nameA} ←→ ${opts.nameB} from ${opts.eventTitle} on ${opts.dateStr}`;
  const html = `
      <p>${a} &amp; ${b}, you both wanted to connect from <a href="${opts.eventUrl}">${title}</a> on ${date}. Here are your profiles:</p>
      <ul>
        <li><a href="${opts.profileUrlA}">${a}</a></li>
        <li><a href="${opts.profileUrlB}">${b}</a></li>
      </ul>
      <p>Hope it&#39;s a valuable connection!</p>
      <p>#Velocity,<br>DROdio</p>
    `;
  return { subject, html };
}

// Send the intro to both people at once (to: [a, b]) so a reply-all connects
// them. Throws on Resend error (callers wrap best-effort).
export async function sendConnectionIntroEmail(opts: {
  toEmails: string[];
  nameA: string;
  nameB: string;
  eventTitle: string;
  eventUrl: string;
  dateStr: string;
  profileUrlA: string;
  profileUrlB: string;
}): Promise<{ id: string }> {
  const { subject, html } = buildConnectionIntroEmail(opts);
  const { data, error } = await client().emails.send({
    from: FROM,
    to: opts.toEmails,
    subject,
    html,
  });
  if (error) throw new Error(`resend: ${error.message}`);
  return { id: data?.id ?? "" };
}
```

- [ ] **Step 4: Also update the request-creation email copy.** In `sendConnectionRequestEmail` (same file), change the line:
`<p style="color:#666;font-size:13px;">If you approve, ${fromName} will see your email and LinkedIn.</p>`
to:
`<p style="color:#666;font-size:13px;">If you approve, we&#39;ll email an intro to you both.</p>`

- [ ] **Step 5: Run, expect PASS** — `pnpm exec vitest run tests/lib/connection-intro-email.test.ts` → 3 pass.

- [ ] **Step 6: Commit**
```bash
git add src/lib/email.ts tests/lib/connection-intro-email.test.ts PRD/connection-intro-email.md
git -c core.hooksPath=.husky commit -m "feat(email): connection introduction email builder + sender"
```

---

### Task 2: `introduceConnection` helper + reveal change + idempotency guard (TDD)

**Files:** Modify `src/lib/attendee-connections.ts`; Create `tests/app/connection-intro.test.ts`; `PRD/connection-intro-email.md`

- [ ] **Step 1: Failing test** — create `tests/app/connection-intro.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/db";
import { events, eventAttendees, evaluations } from "@/db/schema";
import { IS_PROD_DB } from "../setup";

const sendMock = vi.fn(async () => ({ id: "test" }));
vi.mock("@/lib/email", () => ({ sendConnectionIntroEmail: (...a: unknown[]) => sendMock(...a) }));

const rnd = () => Math.random().toString(36).slice(2, 8);

async function seedPerson(name: string, email: string | null, eventId: string) {
  const [ev] = await db.insert(evaluations).values({
    linkedinUrl: "https://linkedin.com/in/ci-" + rnd(),
    fullName: name, slug: name.toLowerCase().replace(/\s+/g, "-") + "-" + rnd(),
    slugKind: "founder", score: 50, founderScore: 50, investorScore: 0,
    signalQuality: "high", source: "url",
  }).returning();
  await db.insert(eventAttendees).values({
    eventId, evaluationId: ev.id, lumaGuestApiId: "gst-" + rnd(),
    name, email, approvalStatus: "approved", source: "luma",
  });
  return ev;
}

describe.skipIf(IS_PROD_DB)("introduceConnection", () => {
  beforeEach(() => sendMock.mockClear());

  it("sends one intro to both resolved emails", async () => {
    const { introduceConnection } = await import("@/lib/attendee-connections");
    const [event] = await db.insert(events).values({
      slug: "ci-" + rnd(), title: "CI Dinner", startsAt: new Date("2026-06-03"),
      status: "open", criteria: {}, source: "luma",
    }).returning();
    const a = await seedPerson("Ada CI", `a-${rnd()}@x.com`, event.id);
    const b = await seedPerson("Alan CI", `b-${rnd()}@x.com`, event.id);

    await introduceConnection({ fromEvaluationId: a.id, toEvaluationId: b.id, eventId: event.id }, "https://festival.so");

    expect(sendMock).toHaveBeenCalledTimes(1);
    const arg = sendMock.mock.calls[0][0] as { toEmails: string[] };
    expect(arg.toEmails.length).toBe(2);
  });

  it("skips the send when one person has no email", async () => {
    const { introduceConnection } = await import("@/lib/attendee-connections");
    const [event] = await db.insert(events).values({
      slug: "ci-" + rnd(), title: "CI Dinner", startsAt: new Date("2026-06-03"),
      status: "open", criteria: {}, source: "luma",
    }).returning();
    const a = await seedPerson("Ada CI", `a-${rnd()}@x.com`, event.id);
    const b = await seedPerson("Noemail CI", null, event.id);

    await introduceConnection({ fromEvaluationId: a.id, toEvaluationId: b.id, eventId: event.id }, "https://festival.so");
    expect(sendMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm exec vitest run tests/app/connection-intro.test.ts` → `introduceConnection` not exported.

- [ ] **Step 3: Add `events` to the schema import** at the top of `src/lib/attendee-connections.ts` (the import already pulls `evaluations, eventAttendees, connectionRequests, …` from `@/db/schema` — add `events`). Add an import: `import { sendConnectionIntroEmail } from "@/lib/email";`

- [ ] **Step 4: Implement `introduceConnection`** — add to `src/lib/attendee-connections.ts` (e.g. after `decideConnectionRequestByToken`):

```ts
// Email a double-opt-in introduction to BOTH people in an approved connection.
// Best-effort: callers wrap in try/catch so a mail failure never blocks the
// approval. Skips silently (logs) if either person has no resolvable email.
export async function introduceConnection(
  row: { fromEvaluationId: string; toEvaluationId: string; eventId: string },
  origin: string,
): Promise<void> {
  const [ev] = await db
    .select({ title: events.title, slug: events.slug, startsAt: events.startsAt })
    .from(events)
    .where(eq(events.id, row.eventId))
    .limit(1);
  if (!ev) return;

  const people = await db
    .select({
      evaluationId: evaluations.id,
      fullName: evaluations.fullName,
      slug: evaluations.slug,
      slugKind: evaluations.slugKind,
      foundEmail: evaluations.foundEmail,
      attendeeEmail: eventAttendees.email,
    })
    .from(evaluations)
    .leftJoin(
      eventAttendees,
      and(eq(eventAttendees.evaluationId, evaluations.id), eq(eventAttendees.eventId, row.eventId)),
    )
    .where(inArray(evaluations.id, [row.fromEvaluationId, row.toEvaluationId]));

  const from = people.find((p) => p.evaluationId === row.fromEvaluationId);
  const to = people.find((p) => p.evaluationId === row.toEvaluationId);
  if (!from || !to) return;

  const emailFrom = (from.attendeeEmail ?? from.foundEmail)?.trim().toLowerCase();
  const emailTo = (to.attendeeEmail ?? to.foundEmail)?.trim().toLowerCase();
  if (!emailFrom || !emailTo) {
    console.warn("[introduceConnection] missing email; skipping intro for event", row.eventId);
    return;
  }
  const toEmails = [...new Set([emailFrom, emailTo])];

  const profilePath = (p: { evaluationId: string; slug: string | null; slugKind: string | null }) =>
    p.slug && p.slugKind ? `/profile/${p.slugKind}/${p.slug}` : `/profile?e=${p.evaluationId}`;

  const dateStr = ev.startsAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  });

  await sendConnectionIntroEmail({
    toEmails,
    nameA: from.fullName ?? "A fellow attendee",
    nameB: to.fullName ?? "A fellow attendee",
    eventTitle: ev.title,
    eventUrl: `${origin}/events/${ev.slug}`,
    dateStr,
    profileUrlA: `${origin}${profilePath(from)}`,
    profileUrlB: `${origin}${profilePath(to)}`,
  });
}
```

- [ ] **Step 5: Remove the approval reveal** in `getEventDirectory`. Change:
`const reveal = mode === "open_to_all" || connectionStatus === "approved";`
to:
`const reveal = mode === "open_to_all";`

- [ ] **Step 6: Guard `decideConnectionRequest` to pending-only** (idempotency). In `decideConnectionRequest`, change the update `where` from:
`.where(eq(connectionRequests.id, requestId))`
to:
`.where(and(eq(connectionRequests.id, requestId), eq(connectionRequests.status, "pending")))`
(`and` is already imported.) The select + ownership check above it stays; an already-decided row now updates 0 rows and returns null.

- [ ] **Step 7: Run, expect PASS** — `pnpm exec vitest run tests/app/connection-intro.test.ts` → 2 pass. Then `pnpm exec tsc --noEmit` clean.

- [ ] **Step 8: Commit**
```bash
git add src/lib/attendee-connections.ts tests/app/connection-intro.test.ts PRD/connection-intro-email.md
git -c core.hooksPath=.husky commit -m "feat(connections): introduceConnection helper; drop approval contact reveal; idempotent decide"
```

---

### Task 3: Hook both approval routes

**Files:** Modify `src/app/api/connections/respond/route.ts`, `src/app/api/connections/decide/route.ts`; `PRD/connection-intro-email.md`

- [ ] **Step 1: respond route** — after the `row` is obtained and confirmed, send the intro best-effort. Replace the tail of `POST` so it reads:

```ts
  const row = await decideConnectionRequestByToken(token, decision);
  if (!row) {
    return NextResponse.json({ error: "This request was already handled or the link is invalid." }, { status: 404 });
  }
  if (row.status === "approved") {
    try {
      await introduceConnection(row, new URL(req.url).origin);
    } catch (err) {
      console.error("[connections/respond] intro email failed:", err);
    }
  }
  return NextResponse.json({ ok: true, status: row.status });
```
Add `introduceConnection` to the import: `import { decideConnectionRequestByToken, introduceConnection } from "@/lib/attendee-connections";`

- [ ] **Step 2: decide route** — same hook:

```ts
  const row = await decideConnectionRequest(requestId, viewerEvalId, decision);
  if (!row) return NextResponse.json({ error: "not found or not yours" }, { status: 404 });
  if (row.status === "approved") {
    try {
      await introduceConnection(row, new URL(req.url).origin);
    } catch (err) {
      console.error("[connections/decide] intro email failed:", err);
    }
  }
  return NextResponse.json({ ok: true, status: row.status });
```
Add to the import: `import { decideConnectionRequest, introduceConnection } from "@/lib/attendee-connections";`

- [ ] **Step 3: Build** — `pnpm build` → compiles, no type errors.

- [ ] **Step 4: Commit**
```bash
git add src/app/api/connections/respond/route.ts src/app/api/connections/decide/route.ts PRD/connection-intro-email.md
git -c core.hooksPath=.husky commit -m "feat(connections): send intro email on approval from both routes"
```

---

### Task 4: Success-copy update

**Files:** Modify `src/components/events/ConnectionRespond.tsx`; `PRD/connection-intro-email.md`

- [ ] **Step 1:** In `ConnectionRespond.tsx`, the `state === "done"` branch, change the approved string:
`"Approved — your email and LinkedIn will be shared with them."`
to:
`"Approved — we've emailed an intro to you both."`
(Leave the denied string as-is.)

- [ ] **Step 2: Build** — `pnpm build` → compiles.

- [ ] **Step 3: Commit**
```bash
git add src/components/events/ConnectionRespond.tsx PRD/connection-intro-email.md
git -c core.hooksPath=.husky commit -m "copy(connections): approval now says we emailed an intro"
```

---

### Task 5: Final verify + PR

- [ ] **Step 1:** `pnpm exec tsc --noEmit && pnpm exec vitest run tests/lib/connection-intro-email.test.ts tests/app/connection-intro.test.ts && pnpm build` — all green.
- [ ] **Step 2:** Push + PR:
```bash
git push -u origin connection-intro-email
gh pr create --base main --head connection-intro-email \
  --title "feat: connection introduction email (double opt-in)" \
  --body "See docs/superpowers/specs/2026-06-09-connection-intro-email-design.md. On approval we now email a single intro to both people (reply-all to connect) with profile links + event link, instead of revealing raw email/LinkedIn. No schema change."
```

---

## Self-Review notes (checked)
- **Spec coverage:** email content/subject/sign-off (T1), recipient resolution + skip-if-missing + reveal removal + idempotency guard (T2), both-route hook best-effort (T3), copy (T1 request email + T4 success). All mapped.
- **Type consistency:** `introduceConnection(row, origin)` signature consistent across T2/T3; `sendConnectionIntroEmail`/`buildConnectionIntroEmail` opt shapes match between T1 def and T2 caller; `toEmails` array used in T1 sender + asserted in T2 test.
- **No DOM/node issues:** all tests node-safe (pure builder + DB-backed helper with mocked email). No migration.
