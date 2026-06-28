import { db } from "@/db";
import { endorsements, endorsementContributions, evaluations, users } from "@/db/schema";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { profileUrlFor } from "./profile-slug";
import {
  canViewAtVisibility,
  clampPointsVisibility,
  isVisibility,
  type Visibility,
} from "./endorsement-constants";

export type EndorsementViewerCtx = {
  ownEvaluationId: string | null;
  isMember: boolean;
};

export type PointsBudget = { total: number; used: number; available: number };

// A co-sign (points another member added to an endorsement), visible to the viewer.
export type Contribution = {
  id: string;
  fromEvaluationId: string;
  fromName: string | null;
  fromHref: string;
  points: number;
  visibility: Visibility;
};

export type EndorsementView = {
  id: string;
  fromEvaluationId: string;
  fromName: string | null;
  fromHref: string;
  toEvaluationId: string;
  toName: string | null;
  toHref: string;
  body: string;
  visibility: Visibility;
  // The author's chosen points visibility (so the author can pre-fill an edit).
  pointsVisibility: Visibility;
  // The author's own points, null when the viewer can't see them (pointsVisibility).
  authorPoints: number | null;
  // Author points + ALL co-signs — the always-shown aggregate "total score".
  totalPoints: number;
  // Co-signs the viewer is allowed to see.
  contributions: Contribution[];
  createdAtIso: string;
};

// Total Profile points a member has committed: their authored endorsement points
// PLUS their co-sign contributions.
async function totalAllocated(fromEvaluationId: string): Promise<number> {
  const [a] = await db
    .select({ n: sql<number>`COALESCE(SUM(${endorsements.points}), 0)::int` })
    .from(endorsements)
    .where(eq(endorsements.fromEvaluationId, fromEvaluationId));
  const [c] = await db
    .select({ n: sql<number>`COALESCE(SUM(${endorsementContributions.points}), 0)::int` })
    .from(endorsementContributions)
    .where(eq(endorsementContributions.fromEvaluationId, fromEvaluationId));
  return Number(a?.n ?? 0) + Number(c?.n ?? 0);
}

export async function getViewerPointsBudget(fromEvaluationId: string): Promise<PointsBudget> {
  try {
    const [ev] = await db
      .select({ score: evaluations.score })
      .from(evaluations)
      .where(eq(evaluations.id, fromEvaluationId))
      .limit(1);
    const total = ev?.score ?? 0;
    const used = await totalAllocated(fromEvaluationId);
    return { total, used, available: Math.max(0, total - used) };
  } catch {
    return { total: 0, used: 0, available: 0 };
  }
}

export async function createOrUpdateEndorsement(input: {
  fromEvaluationId: string;
  fromClerkUserId: string;
  toEvaluationId: string;
  body: string;
  visibility: Visibility;
  points: number;
  pointsVisibility: Visibility;
}): Promise<{ id: string; points: number }> {
  const visibility: Visibility = isVisibility(input.visibility) ? input.visibility : "public";
  const pointsVisibility = clampPointsVisibility(
    isVisibility(input.pointsVisibility) ? input.pointsVisibility : "public",
    visibility,
  );
  const [existing] = await db
    .select({ points: endorsements.points })
    .from(endorsements)
    .where(and(eq(endorsements.fromEvaluationId, input.fromEvaluationId), eq(endorsements.evaluationId, input.toEvaluationId)))
    .limit(1);
  const budget = await getViewerPointsBudget(input.fromEvaluationId);
  const maxForThis = budget.available + (existing?.points ?? 0);
  const points = Math.max(0, Math.min(Math.trunc(input.points || 0), maxForThis));
  const [row] = await db
    .insert(endorsements)
    .values({
      evaluationId: input.toEvaluationId,
      fromEvaluationId: input.fromEvaluationId,
      fromClerkUserId: input.fromClerkUserId,
      body: input.body,
      visibility,
      points,
      pointsVisibility,
    })
    .onConflictDoUpdate({
      target: [endorsements.fromEvaluationId, endorsements.evaluationId],
      set: { body: input.body, visibility, points, pointsVisibility, updatedAt: sql`NOW()` },
    })
    .returning({ id: endorsements.id, points: endorsements.points });
  return { id: row!.id, points: row!.points };
}

// The endorsement's author (so the contribute route can reject self-contribution).
export async function getEndorsementAuthor(
  endorsementId: string,
): Promise<{ fromEvaluationId: string } | null> {
  const [row] = await db
    .select({ fromEvaluationId: endorsements.fromEvaluationId })
    .from(endorsements)
    .where(eq(endorsements.id, endorsementId))
    .limit(1);
  return row ?? null;
}

// Add (or update) a member's co-sign of an endorsement — clamped to budget.
export async function addContribution(input: {
  endorsementId: string;
  fromEvaluationId: string;
  fromClerkUserId: string;
  points: number;
  visibility: Visibility;
}): Promise<{ points: number }> {
  const visibility: Visibility = isVisibility(input.visibility) ? input.visibility : "public";
  const [existing] = await db
    .select({ points: endorsementContributions.points })
    .from(endorsementContributions)
    .where(and(eq(endorsementContributions.endorsementId, input.endorsementId), eq(endorsementContributions.fromEvaluationId, input.fromEvaluationId)))
    .limit(1);
  const budget = await getViewerPointsBudget(input.fromEvaluationId);
  const maxForThis = budget.available + (existing?.points ?? 0);
  const points = Math.max(0, Math.min(Math.trunc(input.points || 0), maxForThis));
  await db
    .insert(endorsementContributions)
    .values({
      endorsementId: input.endorsementId,
      fromEvaluationId: input.fromEvaluationId,
      fromClerkUserId: input.fromClerkUserId,
      points,
      visibility,
    })
    .onConflictDoUpdate({
      target: [endorsementContributions.endorsementId, endorsementContributions.fromEvaluationId],
      set: { points, visibility, updatedAt: sql`NOW()` },
    });
  return { points };
}

const endorser = alias(evaluations, "endorser");
const endorsee = alias(evaluations, "endorsee");

async function nicknamesFor(evalIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (evalIds.length === 0) return out;
  const rows = await db
    .select({ evaluationId: users.evaluationId, nickname: users.nickname })
    .from(users)
    .where(and(inArray(users.evaluationId, evalIds), isNotNull(users.nickname)));
  for (const r of rows) {
    const nick = r.nickname?.trim();
    if (r.evaluationId && nick && !out.has(r.evaluationId)) out.set(r.evaluationId, nick);
  }
  return out;
}

function baseSelect() {
  return db
    .select({
      id: endorsements.id,
      fromEvaluationId: endorsements.fromEvaluationId,
      toEvaluationId: endorsements.evaluationId,
      body: endorsements.body,
      visibility: endorsements.visibility,
      points: endorsements.points,
      pointsVisibility: endorsements.pointsVisibility,
      createdAt: endorsements.createdAt,
      fromName: endorser.fullName,
      fromSlug: endorser.slug,
      fromSlugKind: endorser.slugKind,
      toName: endorsee.fullName,
      toSlug: endorsee.slug,
      toSlugKind: endorsee.slugKind,
    })
    .from(endorsements)
    .innerJoin(endorser, eq(endorser.id, endorsements.fromEvaluationId))
    .innerJoin(endorsee, eq(endorsee.id, endorsements.evaluationId));
}

type RawRow = Awaited<ReturnType<ReturnType<typeof baseSelect>["where"]>>[number];

// All co-signs for a set of endorsements, with contributor identity.
type RawContribution = {
  id: string;
  endorsementId: string;
  fromEvaluationId: string;
  points: number;
  visibility: string;
  fromName: string | null;
  fromSlug: string | null;
  fromSlugKind: string | null;
};
async function contributionsFor(endorsementIds: string[]): Promise<RawContribution[]> {
  if (endorsementIds.length === 0) return [];
  const contributor = alias(evaluations, "contributor");
  return db
    .select({
      id: endorsementContributions.id,
      endorsementId: endorsementContributions.endorsementId,
      fromEvaluationId: endorsementContributions.fromEvaluationId,
      points: endorsementContributions.points,
      visibility: endorsementContributions.visibility,
      fromName: contributor.fullName,
      fromSlug: contributor.slug,
      fromSlugKind: contributor.slugKind,
    })
    .from(endorsementContributions)
    .innerJoin(contributor, eq(contributor.id, endorsementContributions.fromEvaluationId))
    .where(inArray(endorsementContributions.endorsementId, endorsementIds))
    .orderBy(desc(endorsementContributions.points));
}

function hrefFor(evalId: string, slug: string | null, slugKind: string | null): string {
  return profileUrlFor({ evalId, clerkUsername: null, slug, slugKind });
}

async function buildViews(rows: RawRow[], ctx: EndorsementViewerCtx): Promise<EndorsementView[]> {
  if (rows.length === 0) return [];
  const contribs = await contributionsFor(rows.map((r) => r.id));
  const contribByEndorsement = new Map<string, RawContribution[]>();
  for (const c of contribs) {
    const arr = contribByEndorsement.get(c.endorsementId) ?? [];
    arr.push(c);
    contribByEndorsement.set(c.endorsementId, arr);
  }
  // Nicknames for every author + contributor in one batch.
  const evalIds = new Set<string>();
  for (const r of rows) evalIds.add(r.fromEvaluationId);
  for (const c of contribs) evalIds.add(c.fromEvaluationId);
  const nicknames = await nicknamesFor([...evalIds]);

  const views = rows.map((r) => {
    const isAuthor = !!ctx.ownEvaluationId && ctx.ownEvaluationId === r.fromEvaluationId;
    const vis: Visibility = isVisibility(r.visibility) ? r.visibility : "public";
    const pVis: Visibility = isVisibility(r.pointsVisibility) ? r.pointsVisibility : "public";
    const showAuthorPoints = canViewAtVisibility(pVis, { isMember: ctx.isMember, isAuthor });
    const rawContribs = contribByEndorsement.get(r.id) ?? [];
    const totalPoints = r.points + rawContribs.reduce((s, c) => s + c.points, 0);
    const visibleContribs: Contribution[] = rawContribs
      .filter((c) => {
        const cVis: Visibility = isVisibility(c.visibility) ? c.visibility : "public";
        const cIsAuthor = !!ctx.ownEvaluationId && ctx.ownEvaluationId === c.fromEvaluationId;
        return canViewAtVisibility(cVis, { isMember: ctx.isMember, isAuthor: cIsAuthor });
      })
      .map((c) => ({
        id: c.id,
        fromEvaluationId: c.fromEvaluationId,
        fromName: nicknames.get(c.fromEvaluationId) ?? c.fromName,
        fromHref: hrefFor(c.fromEvaluationId, c.fromSlug, c.fromSlugKind),
        points: c.points,
        visibility: (isVisibility(c.visibility) ? c.visibility : "public") as Visibility,
      }));
    return {
      id: r.id,
      fromEvaluationId: r.fromEvaluationId,
      fromName: nicknames.get(r.fromEvaluationId) ?? r.fromName,
      fromHref: hrefFor(r.fromEvaluationId, r.fromSlug, r.fromSlugKind),
      toEvaluationId: r.toEvaluationId,
      toName: r.toName,
      toHref: hrefFor(r.toEvaluationId, r.toSlug, r.toSlugKind),
      body: r.body,
      visibility: vis,
      pointsVisibility: pVis,
      authorPoints: showAuthorPoints ? r.points : null,
      totalPoints,
      contributions: visibleContribs,
      createdAtIso: r.createdAt.toISOString(),
    };
  });
  // Order by the aggregate total, descending.
  views.sort((a, b) => b.totalPoints - a.totalPoints);
  return views;
}

function visibleTo(v: EndorsementView, ctx: EndorsementViewerCtx): boolean {
  return canViewAtVisibility(v.visibility, {
    isMember: ctx.isMember,
    isAuthor: ctx.ownEvaluationId === v.fromEvaluationId,
  });
}

export async function listEndorsementsForProfile(
  toEvaluationId: string,
  ctx: EndorsementViewerCtx,
): Promise<EndorsementView[]> {
  try {
    const rows = await baseSelect().where(eq(endorsements.evaluationId, toEvaluationId));
    const views = await buildViews(rows, ctx);
    return views.filter((v) => visibleTo(v, ctx));
  } catch {
    return [];
  }
}

export async function listEndorsementsByMember(
  fromEvaluationId: string,
  ctx: EndorsementViewerCtx,
): Promise<EndorsementView[]> {
  try {
    const rows = await baseSelect().where(eq(endorsements.fromEvaluationId, fromEvaluationId));
    const views = await buildViews(rows, ctx);
    return views.filter((v) => visibleTo(v, ctx));
  } catch {
    return [];
  }
}
