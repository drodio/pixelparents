# Member Endorsements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a claimed member endorse anyone (claimed or not) on their profile with a free-text @mention-able testimonial, a 3-way visibility, and a gold "Profile points" allocation drawn from the endorser's Festival score.

**Architecture:** New `endorsements` table (explicit 3-way visibility + points + points-visibility). A reusable `VisibilitySlider` (Public | Members Only | Private) extracted from the existing recommendations `PrivacySlider` and reused for both event answers and endorsements. A `MemberEndorsements` client section rendered above Credibility on the profile, gated to claimed viewers. A `/api/endorsements` route enforcing "endorser must be claimed" + budget. The endorser's own profile lists "X endorsed Y with N points" (visibility-aware) with the endorsee name scroll-linking to that endorsement.

**Tech Stack:** Next.js 16 (App Router), Drizzle + Neon HTTP, Clerk auth, Tailwind, existing `MentionInput` (events/chat) for @mentions, vitest.

---

## Visibility model (the tricky part — read first)

Three levels, ordered most→least visible: **public > members_only > private**.
- **public** — anyone (logged out included) sees it.
- **members_only** — only claimed members (viewer has a high-confidence claim) see it.
- **private** — only the endorser (author) + admins see it.

**Points visibility is constrained by endorsement visibility** — points can never be MORE visible than the endorsement:
- endorsement public → points may be public | members_only | private
- endorsement members_only → points may be members_only | private
- endorsement private → points may be private

`pointsVisibility` is clamped server-side and the UI disables disallowed options.

**Helper text (reused/adapted from the recommendations slider):**
- public: "Anyone can see this"
- members_only: "Only Festival members can see this"
- private: "Only you can see this"

---

## File Structure

- Create `src/lib/endorsement-constants.ts` — DB-free: `Visibility` type, `VISIBILITY_OPTIONS`, `allowedPointsVisibilities(endorsementVis)`, `canViewAtVisibility(vis, viewerIsMember, viewerIsAuthor)`, `ENDORSE_PLACEHOLDER(firstName)`. Client-safe.
- Create `src/lib/endorsements.ts` — server: `getViewerPointsBudget`, `createOrUpdateEndorsement`, `listEndorsementsForProfile`, `listEndorsementsByMember`, visibility-filtered.
- Modify `src/db/schema.ts` — add `endorsements` table.
- Create `drizzle/NNNN_endorsements.sql` + `scripts/apply-endorsements-tables.ts` — migration (dev applied now; prod later).
- Create `src/components/VisibilitySlider.tsx` — reusable 3-way slider.
- Modify `src/components/Recommendations.tsx` — replace inline `PrivacySlider` with `VisibilitySlider` (3-way).
- Modify `src/app/api/recommendations/visibility/route.ts` — accept `members_only`.
- Create `src/components/MemberEndorsements.tsx` — section: existing endorsements + the compose form.
- Create `src/app/api/endorsements/route.ts` — POST create/update.
- Modify `src/app/(authed)/profile/page.tsx` — hide EventsCTA for claimed non-owners; render `MemberEndorsements` above Credibility; pass viewer budget; render "endorsed by me" list.
- Tests: `tests/lib/endorsement-constants.test.ts`, `tests/app/endorsements-api.test.ts`.

---

## Task 1: Endorsement constants + visibility logic (TDD)

**Files:**
- Create: `src/lib/endorsement-constants.ts`
- Test: `tests/lib/endorsement-constants.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { allowedPointsVisibilities, canViewAtVisibility, ENDORSE_PLACEHOLDER } from "@/lib/endorsement-constants";

describe("endorsement visibility", () => {
  it("constrains points visibility to ≤ endorsement visibility", () => {
    expect(allowedPointsVisibilities("public")).toEqual(["public", "members_only", "private"]);
    expect(allowedPointsVisibilities("members_only")).toEqual(["members_only", "private"]);
    expect(allowedPointsVisibilities("private")).toEqual(["private"]);
  });
  it("gates who can view a given visibility", () => {
    expect(canViewAtVisibility("public", { isMember: false, isAuthor: false })).toBe(true);
    expect(canViewAtVisibility("members_only", { isMember: false, isAuthor: false })).toBe(false);
    expect(canViewAtVisibility("members_only", { isMember: true, isAuthor: false })).toBe(true);
    expect(canViewAtVisibility("private", { isMember: true, isAuthor: false })).toBe(false);
    expect(canViewAtVisibility("private", { isMember: false, isAuthor: true })).toBe(true);
  });
  it("builds the placeholder with the first name", () => {
    expect(ENDORSE_PLACEHOLDER("Jonah")).toContain("Write an endorsement for Jonah");
  });
});
```
- [ ] **Step 2:** Run `npx vitest run tests/lib/endorsement-constants.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement**
```ts
export type Visibility = "public" | "members_only" | "private";
export const VISIBILITY_OPTIONS: { value: Visibility; label: string; hint: string }[] = [
  { value: "public", label: "Public", hint: "Anyone can see this" },
  { value: "members_only", label: "Members Only", hint: "Only Festival members can see this" },
  { value: "private", label: "Private", hint: "Only you can see this" },
];
const ORDER: Visibility[] = ["public", "members_only", "private"];
export function allowedPointsVisibilities(endorsementVis: Visibility): Visibility[] {
  return ORDER.slice(ORDER.indexOf(endorsementVis));
}
export function clampPointsVisibility(pointsVis: Visibility, endorsementVis: Visibility): Visibility {
  const allowed = allowedPointsVisibilities(endorsementVis);
  return allowed.includes(pointsVis) ? pointsVis : endorsementVis;
}
export function canViewAtVisibility(
  vis: Visibility,
  ctx: { isMember: boolean; isAuthor: boolean },
): boolean {
  if (ctx.isAuthor) return true;
  if (vis === "public") return true;
  if (vis === "members_only") return ctx.isMember;
  return false; // private
}
export function isVisibility(v: unknown): v is Visibility {
  return v === "public" || v === "members_only" || v === "private";
}
export function ENDORSE_PLACEHOLDER(firstName: string): string {
  return `Write an endorsement for ${firstName}. You can @mention their badges and other member names in your text, and make it as long or short as you'd like.`;
}
```
- [ ] **Step 4:** Run test → PASS.
- [ ] **Step 5:** Commit `feat(endorse): visibility + budget constants`.

## Task 2: `endorsements` schema + migration

**Files:** Modify `src/db/schema.ts`; Create `scripts/apply-endorsements-tables.ts`; generate `drizzle/NNNN_*.sql`.

- [ ] Add table:
```ts
export const endorsements = pgTable("endorsements", {
  id: uuid("id").defaultRandom().primaryKey(),
  // who is being endorsed
  evaluationId: uuid("evaluation_id").notNull().references(() => evaluations.id, { onDelete: "cascade" }),
  // the endorser (must be a claimed member at write time)
  fromEvaluationId: uuid("from_evaluation_id").notNull().references(() => evaluations.id, { onDelete: "cascade" }),
  fromClerkUserId: text("from_clerk_user_id").notNull(),
  body: text("body").notNull(),                          // serialized text w/ @[Name](evalId) markers
  visibility: text("visibility").notNull().default("public"),       // public | members_only | private
  points: integer("points").notNull().default(0),
  pointsVisibility: text("points_visibility").notNull().default("public"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  toIdx: index("endorsements_evaluation_id_idx").on(t.evaluationId),
  fromIdx: index("endorsements_from_evaluation_id_idx").on(t.fromEvaluationId),
  uniquePair: uniqueIndex("endorsements_from_to_unique").on(t.fromEvaluationId, t.evaluationId),
}));
```
- [ ] `pnpm db:generate`, then write `scripts/apply-endorsements-tables.ts` mirroring `scripts/apply-family-tables.ts` (dev|prod guard, `CREATE TABLE IF NOT EXISTS endorsements (...)` + indexes).
- [ ] Apply to DEV: `npx tsx scripts/apply-endorsements-tables.ts dev`. Verify table exists.
- [ ] Commit `feat(endorse): endorsements table + dev migration`.

## Task 3: Server data layer `src/lib/endorsements.ts`

**Files:** Create `src/lib/endorsements.ts`.

- [ ] `getViewerPointsBudget(fromEvaluationId)`: viewer's combined `evaluations.score` minus `sum(points)` of their existing endorsements → `{ total, used, available }`.
- [ ] `createOrUpdateEndorsement({ fromEvaluationId, fromClerkUserId, toEvaluationId, body, visibility, points, pointsVisibility })`: clamp `pointsVisibility` via `clampPointsVisibility`; clamp `points` to `[0, available + thisRowsCurrentPoints]`; upsert on `(fromEvaluationId, evaluationId)`.
- [ ] `listEndorsementsForProfile(toEvaluationId, viewerCtx)`: join endorser eval for name+score+href; filter rows by `canViewAtVisibility(row.visibility, ctx)`; null the `points` when `!canViewAtVisibility(row.pointsVisibility, ctx)`.
- [ ] `listEndorsementsByMember(fromEvaluationId, viewerCtx)`: rows authored by this member, visibility-filtered, with endorsee name+href, points nulled per pointsVisibility — powers the "DROdio endorsed Jonah with 47 points" list.
- [ ] Deploy-safe: wrap reads in try/catch returning `[]` when the table is missing (prod before migration), mirroring `loadFamilyForAccount`.
- [ ] Commit `feat(endorse): server data layer`.

## Task 4: Reusable `VisibilitySlider` (3-way) + wire into recommendations

**Files:** Create `src/components/VisibilitySlider.tsx`; Modify `src/components/Recommendations.tsx`; Modify `src/app/api/recommendations/visibility/route.ts`.

- [ ] `VisibilitySlider` renders the three `VISIBILITY_OPTIONS` as a radiogroup styled exactly like the current `PrivacySlider` (border, uppercase, gold-on-selected), with the hover hint from each option's `hint`, plus an optional `allowed?: Visibility[]` prop that disables options not in the list (used to constrain points visibility). Props: `{ value, onChange, allowed?, disabled?, ariaLabel? }`.
- [ ] In `Recommendations.tsx`, replace the inline `PrivacySlider` with `VisibilitySlider`; widen the local visibility state type to `Visibility`; map an absent/`public` row to "public". (The recommendations sparse table still stores only non-public; `members_only` now also persists — see route change.)
- [ ] In the recommendations visibility route, accept `members_only`: store a row for both `private` and `members_only` (sparse table now holds any non-public value), delete only on `public`. Update the validation + the doc comment.
- [ ] Manual review on localhost (the test is visual — see Verification).
- [ ] Commit `feat(visibility): 3-way Public | Members Only | Private slider`.

## Task 5: `/api/endorsements` route (TDD on the gate + budget)

**Files:** Create `src/app/api/endorsements/route.ts`; Test `tests/app/endorsements-api.test.ts`.

- [ ] Test (mock db like `tests/lib/welcome-email-sweep.test.ts`): 401 when unauthenticated; 403 when the endorser has NOT claimed (no high-confidence users row → no `fromEvaluationId`); points clamped to budget; `pointsVisibility` clamped to endorsement visibility.
- [ ] Implement POST: resolve the caller's own `fromEvaluationId` via their high-confidence `users` row (reuse `getCurrentViewerContext` / a query); 403 if none (must be claimed — Requirement 7). Validate `toEvaluationId` exists. `createOrUpdateEndorsement(...)`. Return the saved row.
- [ ] Run test → PASS. Commit `feat(endorse): POST /api/endorsements with claim gate + budget`.

## Task 6: `MemberEndorsements` section + compose form

**Files:** Create `src/components/MemberEndorsements.tsx`.

- [ ] Section header "Member Endorsements". Lists existing visible endorsements: endorser name (link to their profile) + their Festival score, the rendered body (deserialize @mentions to links via existing mention-anchor helper), and the points line when visible ("Endorsed with N points").
- [ ] Compose form (only when `viewerCanEndorse` = viewer claimed AND not their own profile): heading `Endorse {firstName}`; `MentionInput` (from `src/components/events/chat/MentionInput.tsx`) with `ENDORSE_PLACEHOLDER(firstName)`; below it a `VisibilitySlider` for the endorsement; below that the gold points input — label "You have {available} Profile points you can apply to this endorsement. How many would you like to use?", `<input type="number">` styled gold (`border-[#dfa43a] text-[#dfa43a]`), `min=0 max={available}`; a second `VisibilitySlider` for points with `allowed={allowedPointsVisibilities(endorsementVis)}` (auto-clamps when endorsement visibility tightens); Save button → POST `/api/endorsements` → `router.refresh()`.
- [ ] Commit `feat(endorse): Member Endorsements section + compose form`.

## Task 7: Profile page wiring

**Files:** Modify `src/app/(authed)/profile/page.tsx`.

- [ ] **Hide EventsCTA for claimed non-owners (Req 1):** wrap the EventsCTA render in `{(!viewerHasClaim || isOwner) && (<EventsCTA .../>)}` — a claimed member viewing someone else's profile (viewerHasClaim true, isOwner false) no longer sees it; unclaimed visitors and the owner still do.
- [ ] **Render `MemberEndorsements` directly above `CredibilityRadarSection`** (Req 2), only when the viewer is a claimed member (`viewerHasClaim`). Pass: `toEvaluationId=row.id`, `firstName`, `viewerCanEndorse = viewerHasClaim && !isOwner`, `budget` (from `getViewerPointsBudget(viewer.ownEvaluationId)`), the visibility-filtered `endorsements`, and the viewer context. Give the section `id="member-endorsements"` and each endorsement an anchor id `endorsement-{fromEvaluationId}` for scroll-linking.
- [ ] **"Endorsed by me" list (Req 6):** when `isOwner`, render (inside the endorsements section or just above it) `listEndorsementsByMember(viewer.ownEvaluationId, ctx)` → lines "{MyName} endorsed {TheirName} with {N} points" (points shown per pointsVisibility); the endorsee name links to `/{their profile}#endorsement-{myEvalId}` so it scrolls to my endorsement on their page.
- [ ] Commit `feat(endorse): profile wiring — hide CTA, section, endorsed-by-me`.

## Verification (localhost review — the user asked for this)

- [ ] Run dev server on port 3002 (`PORT=3002 pnpm dev` if not already up).
- [ ] Screenshot, as a claimed member, **someone else's** profile: no EventsCTA; Member Endorsements section above Credibility with the Endorse form (placeholder, 3-way visibility, gold points input).
- [ ] Screenshot **own** profile: EventsCTA still present; Member Endorsements showing "I endorsed X with N points".
- [ ] Screenshot the event-answers area showing the 3-way slider.
- [ ] Provide the localhost URLs + screenshots to the user. Do NOT deploy to prod.

## Self-review notes
- Req 1 ✓ Task 7. Req 2 ✓ Task 6/7. Req 3 ✓ Task 6 (MentionInput + placeholder). Req 4 ✓ Task 4. Req 5 ✓ Tasks 1/4/6 (gold input + constrained points visibility + 3-way everywhere). Req 6 ✓ Task 7 (endorsed-by-me + scroll anchor). Req 7 ✓ Task 5 (claim gate) — endorsee may be unclaimed (no claim check on `toEvaluationId`).
