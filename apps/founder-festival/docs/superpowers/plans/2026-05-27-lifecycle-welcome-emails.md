# Lifecycle Welcome Emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email people once (from DROdio, cc founder@festival.so) when they claim a profile and when they first sign up for the Developer API, with full/short variants and a flag-gated backfill.

**Architecture:** A generalized `sent_emails(clerk_user_id, kind)` table provides once-per-person-per-kind dedup + retry. One cron route (`/api/cron/lifecycle-emails`, every 2 min) runs two flag-gated passes that select un-emailed recipients, resolve their email/name from Clerk, pick the variant, send via Resend, and record on success. Pure email templates + helpers are unit-tested; the DB/Clerk sweep is thin glue verified by smoke test.

**Tech Stack:** Next.js 16 App Router (route handlers), Drizzle + Neon (HTTP), Clerk backend SDK, Resend, Vitest.

See spec: `docs/superpowers/specs/2026-05-27-lifecycle-welcome-emails-design.md`.

---

## File Structure

- **Create** `src/lib/cron-auth.ts` — shared `isAuthorizedCron(req)` (extracted from scoring-tick).
- **Modify** `src/app/api/cron/scoring-tick/route.ts` — import `isAuthorizedCron` from the new module (delete the local copy).
- **Modify** `src/db/schema.ts` — add the `sentEmails` table.
- **Create** `drizzle/0019_*.sql` — generated migration for `sent_emails`.
- **Create** `src/lib/welcome-emails.ts` — link/sender constants, `escapeHtml`, `firstNameFor`, the four pure render fns, and thin send wrappers.
- **Modify** `src/lib/email.ts` — add a generic `sendRawEmail({from,to,cc,subject,html})`.
- **Create** `src/lib/welcome-email-sweep.ts` — `welcomeEmailEnabled`, recipient selection, variant resolution, Clerk resolve, send + record, backlog counts; the two passes.
- **Create** `src/app/api/cron/lifecycle-emails/route.ts` — cron-authed GET running both passes.
- **Modify** `vercel.json` — add the cron entry.
- **Create** `tests/lib/welcome-emails.test.ts`, `tests/lib/cron-auth.test.ts`.

---

## Task 1: `sent_emails` table + migration

**Files:**
- Modify: `src/db/schema.ts` (add table near the other Clerk-user-keyed tables, e.g. after `apiKeys`)
- Create: `drizzle/0019_*.sql` (generated)

- [ ] **Step 1: Add the table to the schema**

In `src/db/schema.ts`, add:

```ts
// One row per (Clerk user, lifecycle-email kind) — written only after a
// successful send (or a deliberate skip). The unique index makes the cron sweep
// idempotent: a failed send leaves no row and is retried next run.
export const sentEmails = pgTable(
  "sent_emails",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    // 'claim_welcome' | 'dev_api_welcome'
    kind: text("kind").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userKindUnique: uniqueIndex("sent_emails_user_kind_unique").on(t.clerkUserId, t.kind),
  }),
);
```

(`pgTable`, `uuid`, `text`, `timestamp`, `uniqueIndex` are already imported in this file.)

- [ ] **Step 2: Generate the migration**

Run: `pnpm drizzle-kit generate`
Expected: `drizzle/0019_<name>.sql` created containing `CREATE TABLE "sent_emails"` + the unique index.

- [ ] **Step 3: Apply to DEV**

Run: `DOTENV_CONFIG_PATH=.env.local npx tsx --require dotenv/config scripts/apply-sql.ts drizzle/0019_*.sql`
Expected: `applied drizzle/0019_...sql`

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat(db): sent_emails table for lifecycle email dedup"
```

---

## Task 2: Extract shared cron auth + test

**Files:**
- Create: `src/lib/cron-auth.ts`
- Test: `tests/lib/cron-auth.test.ts`
- Modify: `src/app/api/cron/scoring-tick/route.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/cron-auth.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { isAuthorizedCron } from "@/lib/cron-auth";

function req(headers: Record<string, string>) {
  return new Request("http://x/api/cron/x", { headers });
}

beforeEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.VERCEL_ENV;
});

describe("isAuthorizedCron", () => {
  it("accepts the bearer secret", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(isAuthorizedCron(req({ authorization: "Bearer s3cret" }))).toBe(true);
    expect(isAuthorizedCron(req({ authorization: "Bearer wrong" }))).toBe(false);
  });

  it("rejects when no secret is configured", () => {
    expect(isAuthorizedCron(req({}))).toBe(false);
  });

  it("allows localhost ONLY off-production", () => {
    process.env.VERCEL_ENV = "production";
    expect(isAuthorizedCron(req({ host: "localhost:3000" }))).toBe(false);
    process.env.VERCEL_ENV = "development";
    expect(isAuthorizedCron(req({ host: "localhost:3000" }))).toBe(true);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm vitest run tests/lib/cron-auth.test.ts`
Expected: FAIL — cannot resolve `@/lib/cron-auth`.

- [ ] **Step 3: Create the module (port the existing logic verbatim)**

Create `src/lib/cron-auth.ts`:

```ts
// Verify a request came from Vercel Cron (or a holder of CRON_SECRET). Vercel
// sets `Authorization: Bearer <CRON_SECRET>` automatically. SECURITY: the Host
// header is client-controllable, so the localhost convenience bypass (for the
// admin UI's local auto-driver, where there's no scheduled trigger and no real
// spend) is restricted to non-production. In production the secret is required.
export function isAuthorizedCron(req: Request): boolean {
  if (process.env.VERCEL_ENV !== "production") {
    const host = req.headers.get("host") ?? "";
    if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) return true;
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}
```

- [ ] **Step 4: Run it — verify it passes**

Run: `pnpm vitest run tests/lib/cron-auth.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Refactor scoring-tick to use it**

In `src/app/api/cron/scoring-tick/route.ts`: delete the local `function isAuthorizedCron(...) {...}` definition (and its doc comment) and add the import near the top:

```ts
import { isAuthorizedCron } from "@/lib/cron-auth";
```

(Leave the `if (!isAuthorizedCron(req))` call site unchanged.)

- [ ] **Step 6: Verify nothing broke**

Run: `pnpm tsc --noEmit && pnpm eslint src/app/api/cron/scoring-tick/route.ts src/lib/cron-auth.ts`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/lib/cron-auth.ts tests/lib/cron-auth.test.ts src/app/api/cron/scoring-tick/route.ts
git commit -m "refactor: extract isAuthorizedCron into src/lib/cron-auth.ts (+test)"
```

---

## Task 3: Email helpers — `escapeHtml` + `firstNameFor`

**Files:**
- Create: `src/lib/welcome-emails.ts`
- Test: `tests/lib/welcome-emails.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/welcome-emails.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { escapeHtml, firstNameFor } from "@/lib/welcome-emails";

describe("escapeHtml", () => {
  it("neutralizes angle brackets, ampersands, and quotes", () => {
    expect(escapeHtml(`<b>"a"&'b'`)).toBe("&lt;b&gt;&quot;a&quot;&amp;&#39;b&#39;");
  });
});

describe("firstNameFor", () => {
  it("prefers the Clerk first name", () => {
    expect(firstNameFor("Dana", "Profile Person")).toBe("Dana");
  });
  it("falls back to the first token of the fallback name", () => {
    expect(firstNameFor(null, "Ada Lovelace")).toBe("Ada");
    expect(firstNameFor("   ", "Ada Lovelace")).toBe("Ada");
  });
  it("falls back to 'there' when nothing usable", () => {
    expect(firstNameFor(null)).toBe("there");
    expect(firstNameFor("", "")).toBe("there");
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm vitest run tests/lib/welcome-emails.test.ts`
Expected: FAIL — cannot resolve `@/lib/welcome-emails`.

- [ ] **Step 3: Create the module with constants + helpers**

Create `src/lib/welcome-emails.ts`:

```ts
// Lifecycle welcome-email templates (claim + dev-API). Pure renderers return
// { subject, html } and are fully unit-tested; thin send wrappers go through the
// shared Resend client in ./email. First names are Clerk-controlled → escaped.

export const FROM_DRODIO = "DROdio <drodio@festival.so>";
export const WELCOME_CC = "founder@festival.so";

const MY_PROFILE_URL = "https://festival.so/profile/founder/daniel-r-odio";
const CHIEF_URL = "https://chief.bot";
const DEVELOPERS_URL = "https://festival.so/developers";

const MY_PROFILE_LINK = `<a href="${MY_PROFILE_URL}">my profile</a>`;
const CHIEF_LINK = `<a href="${CHIEF_URL}">Chief</a>`;
const FESTIVAL_API_LINK = `<a href="${DEVELOPERS_URL}">Festival API</a>`;

// Shared paragraphs (no user data → safe to keep as literals).
const INTRO_HTML = `<p>Festival it's a side project I created as a founder myself. (Here's ${MY_PROFILE_LINK}). My day job is CEO of ${CHIEF_LINK}.</p>`;
const FESTIVAL_FEEDBACK_HTML = `<p>I'd love to get your feedback on Festival. What did you like; learn; long-for? What's the next feature I should build into it?</p>`;
const SIGNOFF_HTML = `<p>DROdio</p>`;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Clerk first name wins; else the first whitespace token of a fallback (e.g. the
// claimed profile's full name); else "there".
export function firstNameFor(
  clerkFirstName: string | null | undefined,
  fallbackName?: string | null,
): string {
  const c = clerkFirstName?.trim();
  if (c) return c;
  const f = fallbackName?.trim().split(/\s+/)[0];
  if (f) return f;
  return "there";
}
```

- [ ] **Step 4: Run it — verify it passes**

Run: `pnpm vitest run tests/lib/welcome-emails.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/welcome-emails.ts tests/lib/welcome-emails.test.ts
git commit -m "feat(email): welcome-email constants + escapeHtml/firstNameFor helpers"
```

---

## Task 4: `renderClaimWelcomeEmail` (full + short)

**Files:**
- Modify: `src/lib/welcome-emails.ts`
- Test: `tests/lib/welcome-emails.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `tests/lib/welcome-emails.test.ts`:

```ts
import { renderClaimWelcomeEmail } from "@/lib/welcome-emails";

describe("renderClaimWelcomeEmail", () => {
  const base = { firstName: "Ada", profileUrl: "https://festival.so/profile/p/ada" };

  it("full: name subject, profile + my-profile + Chief + Festival API links, escapes name", () => {
    const { subject, html } = renderClaimWelcomeEmail({ ...base, firstName: "A<b>", short: false });
    expect(subject).toBe("A<b> - Welcome to Founder Festival + what to build? (and FYI on API)");
    expect(html).toContain('href="https://festival.so/profile/p/ada"');
    expect(html).toContain('href="https://festival.so/profile/founder/daniel-r-odio"');
    expect(html).toContain('href="https://chief.bot"');
    expect(html).toContain('href="https://festival.so/developers"');
    expect(html).toContain("A&lt;b&gt;,"); // escaped in the body
  });

  it("short: '+ profile!' subject, has *also*, keeps intro, DROPS the Festival API paragraph", () => {
    const { subject, html } = renderClaimWelcomeEmail({ ...base, short: true });
    expect(subject).toBe("+ profile! what to build next?");
    expect(html).toContain("<em>also</em>");
    expect(html).toContain('href="https://festival.so/profile/founder/daniel-r-odio"'); // intro kept
    expect(html).not.toContain("https://festival.so/developers"); // API pitch dropped
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm vitest run tests/lib/welcome-emails.test.ts`
Expected: FAIL — `renderClaimWelcomeEmail` is not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/welcome-emails.ts`:

```ts
export function renderClaimWelcomeEmail(opts: {
  firstName: string;
  profileUrl: string;
  short: boolean;
}): { subject: string; html: string } {
  const name = escapeHtml(opts.firstName);
  const url = escapeHtml(opts.profileUrl);
  if (opts.short) {
    return {
      subject: "+ profile! what to build next?",
      html: [
        `<p>${name},</p>`,
        `<p>Saw you <em>also</em> created a profile on Festival: <a href="${url}">${url}</a></p>`,
        `<p>How'd you hear about it?</p>`,
        INTRO_HTML,
        FESTIVAL_FEEDBACK_HTML,
        SIGNOFF_HTML,
      ].join("\n"),
    };
  }
  return {
    subject: `${opts.firstName} - Welcome to Founder Festival + what to build? (and FYI on API)`,
    html: [
      `<p>${name}, saw you created a profile on Festival: <a href="${url}">${url}</a></p>`,
      `<p>How'd you hear about it?</p>`,
      INTRO_HTML,
      FESTIVAL_FEEDBACK_HTML,
      `<p>LMK if you try using the ${FESTIVAL_API_LINK} to build an app that uses founder &amp; investor scoring into any agentic systems you have. I'll be happy to feature your work. (I made it hella easy to drop into Claude Code or similar.)</p>`,
      SIGNOFF_HTML,
    ].join("\n"),
  };
}
```

(Subject uses the raw `opts.firstName` — subjects are plain text, not HTML, so no escaping there.)

- [ ] **Step 4: Run it — verify it passes**

Run: `pnpm vitest run tests/lib/welcome-emails.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/welcome-emails.ts tests/lib/welcome-emails.test.ts
git commit -m "feat(email): renderClaimWelcomeEmail (full + short variants)"
```

---

## Task 5: `renderDevApiWelcomeEmail` (full + short)

**Files:**
- Modify: `src/lib/welcome-emails.ts`
- Test: `tests/lib/welcome-emails.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `tests/lib/welcome-emails.test.ts`:

```ts
import { renderDevApiWelcomeEmail } from "@/lib/welcome-emails";

describe("renderDevApiWelcomeEmail", () => {
  it("full: name subject, intro links + Festival API link", () => {
    const { subject, html } = renderDevApiWelcomeEmail({ firstName: "Ada", short: false });
    expect(subject).toBe("Ada - LMK what you do with the Festival Developer API! + ideas?");
    expect(html).toContain("BTW, how'd you hear about it?");
    expect(html).toContain('href="https://festival.so/profile/founder/daniel-r-odio"');
    expect(html).toContain('href="https://festival.so/developers"');
  });

  it("short: '+ LMK' subject, *also*, no intro/links", () => {
    const { subject, html } = renderDevApiWelcomeEmail({ firstName: "Ada", short: true });
    expect(subject).toBe("+ LMK what you do with the Festival Developer API! + ideas?");
    expect(html).toContain("<em>also</em>");
    expect(html).not.toContain("href=");
    expect(html).not.toContain("BTW, how'd you hear");
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm vitest run tests/lib/welcome-emails.test.ts`
Expected: FAIL — `renderDevApiWelcomeEmail` not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/welcome-emails.ts`:

```ts
export function renderDevApiWelcomeEmail(opts: {
  firstName: string;
  short: boolean;
}): { subject: string; html: string } {
  const name = escapeHtml(opts.firstName);
  if (opts.short) {
    return {
      subject: "+ LMK what you do with the Festival Developer API! + ideas?",
      html: [
        `<p>${name},</p>`,
        `<p>Saw you <em>also</em> signed up for the Festival developer API. I'm very interested to see what you do with it, and how I can support you!</p>`,
        `<p>I'd love to get your feedback on the API. What other endpoints would you like to see exposed?</p>`,
        SIGNOFF_HTML,
      ].join("\n"),
    };
  }
  return {
    subject: `${opts.firstName} - LMK what you do with the Festival Developer API! + ideas?`,
    html: [
      `<p>${name},</p>`,
      `<p>Saw you signed up for the Festival developer API. I'm very interested to see what you do with it, and how I can support you!</p>`,
      `<p>BTW, how'd you hear about it?</p>`,
      INTRO_HTML,
      `<p>I'd love to get your feedback on the ${FESTIVAL_API_LINK}. What other endpoints would you like to see exposed?</p>`,
      SIGNOFF_HTML,
    ].join("\n"),
  };
}
```

- [ ] **Step 4: Run it — verify it passes**

Run: `pnpm vitest run tests/lib/welcome-emails.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/welcome-emails.ts tests/lib/welcome-emails.test.ts
git commit -m "feat(email): renderDevApiWelcomeEmail (full + short variants)"
```

---

## Task 6: Generic sender + thin send wrappers

**Files:**
- Modify: `src/lib/email.ts`
- Modify: `src/lib/welcome-emails.ts`

- [ ] **Step 1: Add `sendRawEmail` to `src/lib/email.ts`**

Add (after the `client()` definition):

```ts
// Generic one-off sender — used by lifecycle welcome emails which build their
// own subject/html and need a custom from/cc. Throws on Resend error.
export async function sendRawEmail(opts: {
  from: string;
  to: string;
  cc?: string;
  subject: string;
  html: string;
}): Promise<{ id: string }> {
  const { data, error } = await client().emails.send({
    from: opts.from,
    to: opts.to,
    ...(opts.cc ? { cc: opts.cc } : {}),
    subject: opts.subject,
    html: opts.html,
  });
  if (error) throw new Error(`resend: ${error.message}`);
  return { id: data?.id ?? "" };
}
```

- [ ] **Step 2: Add send wrappers to `src/lib/welcome-emails.ts`**

Add an import at the top:

```ts
import { sendRawEmail } from "@/lib/email";
```

Append:

```ts
export async function sendClaimWelcomeEmail(opts: {
  to: string;
  firstName: string;
  profileUrl: string;
  short: boolean;
}): Promise<{ id: string }> {
  const { subject, html } = renderClaimWelcomeEmail(opts);
  return sendRawEmail({ from: FROM_DRODIO, to: opts.to, cc: WELCOME_CC, subject, html });
}

export async function sendDevApiWelcomeEmail(opts: {
  to: string;
  firstName: string;
  short: boolean;
}): Promise<{ id: string }> {
  const { subject, html } = renderDevApiWelcomeEmail(opts);
  return sendRawEmail({ from: FROM_DRODIO, to: opts.to, cc: WELCOME_CC, subject, html });
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm tsc --noEmit && pnpm eslint src/lib/email.ts src/lib/welcome-emails.ts`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/lib/email.ts src/lib/welcome-emails.ts
git commit -m "feat(email): sendRawEmail + claim/dev welcome send wrappers"
```

---

## Task 7: The sweep — selection, variant, send, record (two passes)

**Files:**
- Create: `src/lib/welcome-email-sweep.ts`

This is DB + Clerk + Resend glue (verified by smoke test in Task 9, since the
templating/variant logic it depends on is already unit-tested). Implement it
fully, then typecheck.

- [ ] **Step 1: Create the module**

Create `src/lib/welcome-email-sweep.ts`:

```ts
import { db } from "@/db";
import { users, apiKeys, evaluations, sentEmails } from "@/db/schema";
import { and, eq, isNotNull, notInArray, sql } from "drizzle-orm";
import { clerkClient } from "@clerk/nextjs/server";
import { SUPER_ADMIN_EMAILS } from "@/lib/admin";
import { canonicalProfileUrl } from "@/lib/canonical-profile-url";
import {
  firstNameFor,
  sendClaimWelcomeEmail,
  sendDevApiWelcomeEmail,
} from "@/lib/welcome-emails";

export type WelcomeKind = "claim_welcome" | "dev_api_welcome";

const CAP = 30; // max emails per pass per run — spreads backfill, respects Resend limits
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://festival.so";

// Never email these (operator + the email's own from/cc) — mark them sent so they
// drain from the backlog instead of being retried forever.
const NEVER_EMAIL = new Set(
  [...SUPER_ADMIN_EMAILS, "drodio@festival.so", "founder@festival.so"].map((e) => e.toLowerCase()),
);

export function welcomeEmailEnabled(kind: WelcomeKind): boolean {
  const raw =
    kind === "claim_welcome"
      ? process.env.CLAIM_WELCOME_EMAIL_ENABLED
      : process.env.DEV_API_WELCOME_EMAIL_ENABLED;
  const v = (raw ?? "").trim().toLowerCase();
  return v === "on" || v === "1" || v === "true";
}

async function markSent(clerkUserId: string, kind: WelcomeKind): Promise<void> {
  await db.insert(sentEmails).values({ clerkUserId, kind }).onConflictDoNothing();
}

// Clerk id → { email, firstName } for a batch (one Backend API call). Missing /
// failed ids are simply absent from the map.
async function resolveClerk(ids: string[]): Promise<Map<string, { email: string | null; firstName: string | null }>> {
  const out = new Map<string, { email: string | null; firstName: string | null }>();
  if (ids.length === 0) return out;
  const clerk = await clerkClient();
  const res = await clerk.users.getUserList({ userId: ids, limit: ids.length });
  for (const u of res.data) {
    const email =
      u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ??
      u.emailAddresses[0]?.emailAddress ??
      null;
    out.set(u.id, { email, firstName: u.firstName ?? null });
  }
  return out;
}

// Backlog size for a kind (used to report counts before enabling).
export async function countUnsentClaim(): Promise<number> {
  const sent = db.select({ id: sentEmails.clerkUserId }).from(sentEmails).where(eq(sentEmails.kind, "claim_welcome"));
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${users.clerkUserId})::int` })
    .from(users)
    .where(and(isNotNull(users.evaluationId), notInArray(users.clerkUserId, sent)));
  return Number(row?.n ?? 0);
}

export async function countUnsentDevApi(): Promise<number> {
  const sent = db.select({ id: sentEmails.clerkUserId }).from(sentEmails).where(eq(sentEmails.kind, "dev_api_welcome"));
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${apiKeys.clerkUserId})::int` })
    .from(apiKeys)
    .where(notInArray(apiKeys.clerkUserId, sent));
  return Number(row?.n ?? 0);
}

export async function runClaimWelcomePass(): Promise<{ sent: number; skipped: number }> {
  if (!welcomeEmailEnabled("claim_welcome")) return { sent: 0, skipped: 0 };
  const sent = db.select({ id: sentEmails.clerkUserId }).from(sentEmails).where(eq(sentEmails.kind, "claim_welcome"));
  const rows = await db
    .select({
      clerkUserId: users.clerkUserId,
      evaluationId: users.evaluationId,
      fullName: evaluations.fullName,
    })
    .from(users)
    .leftJoin(evaluations, eq(evaluations.id, users.evaluationId))
    .where(and(isNotNull(users.evaluationId), notInArray(users.clerkUserId, sent)))
    .orderBy(users.verifiedAt)
    .limit(CAP);
  if (rows.length === 0) return { sent: 0, skipped: 0 };

  const clerk = await resolveClerk(rows.map((r) => r.clerkUserId));
  // Variant: short if they ALSO have an API key.
  const ids = rows.map((r) => r.clerkUserId);
  const keyed = new Set(
    (await db.select({ id: apiKeys.clerkUserId }).from(apiKeys).where(sql`${apiKeys.clerkUserId} = any(${ids})`)).map((r) => r.id),
  );

  let okCount = 0;
  let skipCount = 0;
  for (const r of rows) {
    const info = clerk.get(r.clerkUserId);
    if (!info) continue; // Clerk miss this run → retry next run (no mark)
    const email = info.email?.toLowerCase() ?? null;
    if (!email || NEVER_EMAIL.has(email)) {
      await markSent(r.clerkUserId, "claim_welcome");
      skipCount++;
      continue;
    }
    const path = r.evaluationId ? await canonicalProfileUrl(r.evaluationId) : null;
    const profileUrl = `${SITE}${path ?? `/profile?e=${r.evaluationId}`}`;
    await sendClaimWelcomeEmail({
      to: info.email!,
      firstName: firstNameFor(info.firstName, r.fullName),
      profileUrl,
      short: keyed.has(r.clerkUserId),
    });
    await markSent(r.clerkUserId, "claim_welcome");
    okCount++;
  }
  return { sent: okCount, skipped: skipCount };
}

export async function runDevApiWelcomePass(): Promise<{ sent: number; skipped: number }> {
  if (!welcomeEmailEnabled("dev_api_welcome")) return { sent: 0, skipped: 0 };
  const sent = db.select({ id: sentEmails.clerkUserId }).from(sentEmails).where(eq(sentEmails.kind, "dev_api_welcome"));
  const rows = await db
    .select({ clerkUserId: apiKeys.clerkUserId })
    .from(apiKeys)
    .where(notInArray(apiKeys.clerkUserId, sent))
    .groupBy(apiKeys.clerkUserId)
    .orderBy(sql`min(${apiKeys.createdAt})`)
    .limit(CAP);
  if (rows.length === 0) return { sent: 0, skipped: 0 };

  const clerk = await resolveClerk(rows.map((r) => r.clerkUserId));
  // Variant: short if they ALSO have a claimed profile.
  const ids = rows.map((r) => r.clerkUserId);
  const claimed = new Set(
    (
      await db
        .select({ id: users.clerkUserId })
        .from(users)
        .where(and(isNotNull(users.evaluationId), sql`${users.clerkUserId} = any(${ids})`))
    ).map((r) => r.id),
  );

  let okCount = 0;
  let skipCount = 0;
  for (const r of rows) {
    const info = clerk.get(r.clerkUserId);
    if (!info) continue;
    const email = info.email?.toLowerCase() ?? null;
    if (!email || NEVER_EMAIL.has(email)) {
      await markSent(r.clerkUserId, "dev_api_welcome");
      skipCount++;
      continue;
    }
    await sendDevApiWelcomeEmail({
      to: info.email!,
      firstName: firstNameFor(info.firstName, null),
      short: claimed.has(r.clerkUserId),
    });
    await markSent(r.clerkUserId, "dev_api_welcome");
    okCount++;
  }
  return { sent: okCount, skipped: skipCount };
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm tsc --noEmit && pnpm eslint src/lib/welcome-email-sweep.ts`
Expected: no output. (If `= any(${ids})` typechecks awkwardly, the `notInArray`/`inArray` import from drizzle-orm may be used instead — but `any()` matches the existing pattern in `src/app/api/admin/jobs/route.ts`.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/welcome-email-sweep.ts
git commit -m "feat(email): lifecycle welcome-email sweep (claim + dev-API passes)"
```

---

## Task 8: Cron route + schedule

**Files:**
- Create: `src/app/api/cron/lifecycle-emails/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Create the route**

Create `src/app/api/cron/lifecycle-emails/route.ts`:

```ts
import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { runClaimWelcomePass, runDevApiWelcomePass } from "@/lib/welcome-email-sweep";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Sends lifecycle welcome emails (profile claim + dev-API signup). Each pass is
// a no-op unless its flag (CLAIM_WELCOME_EMAIL_ENABLED / DEV_API_WELCOME_EMAIL_
// ENABLED) is on. Idempotent + retrying via the sent_emails table.
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const claim = await runClaimWelcomePass();
  const dev = await runDevApiWelcomePass();
  return NextResponse.json({ claim, dev });
}
```

- [ ] **Step 2: Add the cron schedule**

In `vercel.json`, add to the `crons` array:

```json
{ "path": "/api/cron/lifecycle-emails", "schedule": "*/2 * * * *" }
```

- [ ] **Step 3: Verify build**

Run: `pnpm tsc --noEmit && pnpm eslint src/app/api/cron/lifecycle-emails/route.ts`
Expected: no output.

- [ ] **Step 4: Smoke test locally (flags off → no-op)**

Run the dev server, then:
`curl -s "http://localhost:3000/api/cron/lifecycle-emails" | cat`
Expected: `{"claim":{"sent":0,"skipped":0},"dev":{"sent":0,"skipped":0}}` (localhost bypass authorizes; both flags off → no sends).

- [ ] **Step 5: Smoke test one real send (optional, guarded)**

Temporarily in `.env.local`: set `CLAIM_WELCOME_EMAIL_ENABLED=on` and a real `RESEND_API_KEY`. Ensure exactly one un-emailed test claim exists. Re-run the curl; expect `claim.sent` ≥ 1 and an email in the inbox. Then revert `.env.local`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cron/lifecycle-emails/route.ts vercel.json
git commit -m "feat(cron): /api/cron/lifecycle-emails — welcome-email sweep every 2m"
```

---

## Task 9: Full verification + PRD update

- [ ] **Step 1: Run the full unit suite**

Run: `pnpm vitest run tests/lib/welcome-emails.test.ts tests/lib/cron-auth.test.ts`
Expected: all PASS.

- [ ] **Step 2: tsc + lint clean across touched files**

Run: `pnpm tsc --noEmit && pnpm eslint src/lib/welcome-emails.ts src/lib/welcome-email-sweep.ts src/lib/cron-auth.ts src/lib/email.ts "src/app/api/cron/lifecycle-emails/route.ts" src/app/api/cron/scoring-tick/route.ts src/db/schema.ts`
Expected: no output.

- [ ] **Step 3: Update the PRD log**

Prepend a progress entry to `PRD/lifecycle-welcome-emails.md` (per CLAUDE.md) summarizing the implementation, then `git add` it with the final commit.

- [ ] **Step 4: Push + open PR (held for prod migration + flag rollout)**

```bash
git push -u origin lifecycle-welcome-emails
gh pr create --base main --title "Lifecycle welcome emails (claim + dev-API)" --body "...see spec; ships with both flags OFF; needs sent_emails migration on prod..."
```

---

## Rollout (post-merge, operator-gated)

1. Apply the `sent_emails` migration (0019) to prod (manual, per `prod-database-identity`).
2. Merge — cron deploys but **both flags off** (no sends).
3. Report backlog counts: call `countUnsentClaim()` / `countUnsentDevApi()` (or a one-off script) against prod.
4. Operator sets `CLAIM_WELCOME_EMAIL_ENABLED=on` and/or `DEV_API_WELCOME_EMAIL_ENABLED=on` in Vercel when ready; the cron drains each backlog (≤30 / 2 min) and handles new events going forward.

---

## Self-review notes

- **Spec coverage:** triggers (Task 7 selection), variant selection (Task 7 `keyed`/`claimed` sets), `sent_emails` (Task 1), cron + flags (Tasks 7/8), four templates (Tasks 4/5), from/cc (Task 6 wrappers), edge cases — super-admin/no-email skip-and-mark + Clerk-miss retry (Task 7), backfill counts + rollout (Task 9 + Rollout). All covered.
- **Names consistent:** `runClaimWelcomePass` / `runDevApiWelcomePass`, `welcomeEmailEnabled`, `sendClaimWelcomeEmail` / `sendDevApiWelcomeEmail`, `renderClaimWelcomeEmail` / `renderDevApiWelcomeEmail`, `firstNameFor`, `escapeHtml`, `FROM_DRODIO` / `WELCOME_CC`, `sentEmails`, `isAuthorizedCron` — used consistently across tasks.
- **No placeholders:** every code step has complete code; the only manual/optional step is the guarded live-send smoke (Task 8 Step 5).
```
