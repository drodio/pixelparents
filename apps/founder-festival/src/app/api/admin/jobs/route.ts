import { NextResponse } from "next/server";
import { db } from "@/db";
import { scoringJobs, scoringJobItems, evaluations } from "@/db/schema";
import { isScoringModel, estimateJobCents } from "@/lib/admin";
import { requireGrant, getViewerCostMultiplier } from "@/lib/grants";
import { applyCostMultiplier } from "@/lib/cost-multiplier";
import { holdCreditsForJob } from "@/lib/job-credit-hold";
import { parsePasteInput, type ParsedLine } from "@/lib/parse-paste-input";
import {
  parseSelectedSources,
  selectStaleProfiles,
  selectTopProfiles,
  TOP_PROFILES_MAX,
} from "@/lib/profiles-scored";
import { canonicalizeLinkedinUrl } from "@/lib/canonicalize";
import { applyRowEnrichment } from "@/lib/row-enrichment";
import type { CsvRow } from "@/lib/csv-to-lines";
import { currentUser } from "@clerk/nextjs/server";
import { inArray, sql } from "drizzle-orm";

export const maxDuration = 30;

type Body = {
  title?: string;
  model?: string;
  input?: string;
  // Structured CSV rows (preserve email + location, which the flat textarea
  // can't). Merged with parsed `input` lines.
  rows?: CsvRow[];
  // "Re-Score Existing" mode: build the job from a query instead of paste.
  // Operator picks ONE criterion: a date cutoff (`notScoredSince`) OR a
  // top-N-by-score slice (`topN`). `sources` filters both.
  staleFilter?: { notScoredSince?: string; topN?: number; sources?: unknown };
  // When true with staleFilter, return the match count + est cost without
  // creating a job (powers the form's live preview).
  dryRun?: boolean;
};

// A parsed/validated item ready for the job, carrying enrichment + (when it
// matches an existing profile) that profile's evaluation id.
type ValidItem = Exclude<ParsedLine, { kind: "invalid" }>;

// Convert a structured CSV row into a ParsedLine (url or nameCompany) with
// enrichment fields. Returns null for unusable rows (no url and no name).
function csvRowToParsed(row: CsvRow): ParsedLine | null {
  const enrich = {
    ...(row.email ? { email: row.email } : {}),
    ...(row.phone ? { phone: row.phone } : {}),
    ...(row.jobTitle ? { jobTitle: row.jobTitle } : {}),
    ...(row.city ? { city: row.city } : {}),
    ...(row.region ? { region: row.region } : {}),
    ...(row.country ? { country: row.country } : {}),
    ...(row.locationRaw ? { locationRaw: row.locationRaw } : {}),
  };
  if (row.linkedinUrl) {
    const canonical = canonicalizeLinkedinUrl(row.linkedinUrl);
    if (canonical) return { kind: "url", raw: row.linkedinUrl, linkedinUrl: canonical, ...enrich };
  }
  const name = (row.name ?? "").trim();
  if (name.length >= 2) {
    return { kind: "nameCompany", raw: row.company ? `${name}, ${row.company}` : name, name, company: row.company ?? null, ...enrich };
  }
  return null;
}

// Fallback title when the operator didn't provide one. Picks the most
// natural label given the input shape:
//   - if a single company dominates (≥70% of items) → "N <Company> founders"
//   - else if there are multiple distinct companies → "N YC founders"
//     (heuristic: mixed-company pastes almost always come from YC search)
//   - else (URL-only paste, no companies known) → "N founders · <date>"
function autoTitle(
  items: Array<{ kind: "url" | "nameCompany"; company?: string | null }>,
): string {
  const companies = items
    .map((i) => (i.kind === "nameCompany" ? i.company?.trim() : ""))
    .filter((c): c is string => !!c);
  const count = items.length;
  const suffix = count === 1 ? "founder" : "founders";
  if (companies.length === 0) {
    const ts = new Date().toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/Los_Angeles",
    });
    return `${count} ${suffix} · ${ts}`;
  }
  const counts = new Map<string, number>();
  for (const c of companies) counts.set(c, (counts.get(c) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [topCompany, topCount] = sorted[0];
  if (sorted.length === 1 || topCount / companies.length >= 0.7) {
    return `${count} ${topCompany} ${suffix}`;
  }
  return `${count} YC ${suffix}`;
}

export async function POST(req: Request) {
  try {
    await requireGrant("run_scoring_jobs");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const model = (body.model ?? "sonnet").toLowerCase();
  if (!isScoringModel(model)) {
    return NextResponse.json({ error: "invalid model" }, { status: 400 });
  }

  // "Re-Score Existing" mode: build the job from a query instead of paste.
  // Exactly one criterion: `notScoredSince` (date cutoff) OR `topN` (top N by
  // combined score). Sources filter both. Anything else → 400.
  if (body.staleFilter) {
    const sources = parseSelectedSources(body.staleFilter.sources);
    const hasCutoff = typeof body.staleFilter.notScoredSince === "string"
      && body.staleFilter.notScoredSince.length > 0;
    const hasTopN = typeof body.staleFilter.topN === "number";
    if (hasCutoff && hasTopN) {
      return NextResponse.json(
        { error: "specify either notScoredSince or topN, not both" },
        { status: 400 },
      );
    }
    if (!hasCutoff && !hasTopN) {
      return NextResponse.json(
        { error: "specify notScoredSince or topN" },
        { status: 400 },
      );
    }

    let profiles: Array<{ id: string; linkedinUrl: string }>;
    // Used to derive the job title for both modes.
    let criterionLabel: string;

    if (hasTopN) {
      const topN = body.staleFilter.topN!;
      if (!Number.isFinite(topN) || topN <= 0 || topN > TOP_PROFILES_MAX) {
        return NextResponse.json(
          { error: `topN must be between 1 and ${TOP_PROFILES_MAX}` },
          { status: 400 },
        );
      }
      profiles = await selectTopProfiles({ topN: Math.trunc(topN), sources });
      criterionLabel = `top ${Math.trunc(topN)} by score`;
    } else {
      const cutoff = new Date(body.staleFilter.notScoredSince!);
      if (Number.isNaN(cutoff.getTime())) {
        return NextResponse.json({ error: "invalid notScoredSince" }, { status: 400 });
      }
      profiles = await selectStaleProfiles({ notScoredSince: cutoff, sources });
      const cutoffLabel = cutoff.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "America/Los_Angeles",
      });
      criterionLabel = `before ${cutoffLabel}`;
    }

    if (body.dryRun) {
      // The preview is display-only → multiply by the viewer's cost multiplier
      // so it matches every other cost they see (the job we'd create stores the
      // real estimate below).
      const realEstimate = await estimateJobCents(profiles.length, model);
      return NextResponse.json({
        dryRun: true,
        count: profiles.length,
        estimatedCents: applyCostMultiplier(realEstimate, await getViewerCostMultiplier()),
      });
    }
    if (profiles.length === 0) {
      return NextResponse.json({ error: "no profiles match the filter" }, { status: 400 });
    }

    const u = await currentUser().catch(() => null);
    const estimate = await estimateJobCents(profiles.length, model);
    const hold = await holdCreditsForJob(u?.id ?? null, estimate);
    if (hold.kind === "insufficient") {
      return NextResponse.json(
        { error: "insufficient_credits", balanceCents: hold.balanceCents, neededCents: hold.neededCents, topupUrl: "/admin/credits" },
        { status: 402 },
      );
    }
    const [job] = await db
      .insert(scoringJobs)
      .values({
        title:
          body.title?.trim() ||
          `${profiles.length} ${sources.join("/")} profiles · ${criterionLabel}`,
        model,
        status: "queued",
        totalItems: profiles.length,
        estimatedCents: estimate,
        createdByEmail: u?.emailAddresses?.[0]?.emailAddress?.toLowerCase() ?? null,
        createdByClerkUserId: u?.id ?? null,
        creditHoldCents: hold.creditHoldCents,
      })
      .returning();

    await db.insert(scoringJobItems).values(
      profiles.map((p) => ({
        jobId: job!.id,
        inputRaw: p.linkedinUrl,
        linkedinUrl: p.linkedinUrl,
        // evaluationId set → the worker reEvaluates (re-scores in place) rather
        // than runEval (which would just hit the URL cache and not re-score).
        evaluationId: p.id,
        status: "resolved" as const,
      })),
    );

    return NextResponse.json({
      jobId: job!.id,
      totalItems: profiles.length,
      estimatedCents: job!.estimatedCents,
    });
  }

  // Merge pasted text lines with structured CSV rows (CSV preserves email +
  // location, which the flat textarea can't).
  const pasteLines = parsePasteInput(body.input ?? "");
  const csvLines = (body.rows ?? [])
    .map(csvRowToParsed)
    .filter((l): l is ParsedLine => l !== null);
  const lines = [...pasteLines, ...csvLines];
  const validItems = lines.filter((l) => l.kind !== "invalid") as ValidItem[];
  if (validItems.length === 0) {
    return NextResponse.json(
      { error: "no valid lines in input", parsed: lines },
      { status: 400 },
    );
  }

  // Match items against existing profiles to ENRICH (not skip) them. URL items
  // match on linkedin_url; name items on lower(full_name). Matches are enriched
  // in place (no LLM re-score); only unmatched ("fresh") items are scored.
  const urlsInPaste = validItems
    .filter((l): l is ValidItem & { kind: "url" } => l.kind === "url")
    .map((l) => l.linkedinUrl);
  const namesInPaste = validItems
    .filter((l): l is ValidItem & { kind: "nameCompany" } => l.kind === "nameCompany")
    .map((l) => l.name.toLowerCase().trim());

  const urlToId = new Map<string, string>();
  if (urlsInPaste.length) {
    for (const r of await db
      .select({ id: evaluations.id, url: evaluations.linkedinUrl })
      .from(evaluations)
      .where(inArray(evaluations.linkedinUrl, urlsInPaste))) {
      urlToId.set(r.url, r.id);
    }
  }
  const nameToId = new Map<string, string>();
  if (namesInPaste.length) {
    for (const r of await db
      .select({ id: evaluations.id, name: evaluations.fullName })
      .from(evaluations)
      .where(inArray(sql`lower(${evaluations.fullName})`, namesInPaste))) {
      const key = r.name?.toLowerCase().trim();
      if (key && !nameToId.has(key)) nameToId.set(key, r.id);
    }
  }

  type Partitioned = ValidItem & { matchEvalId?: string };
  const matches: Partitioned[] = [];
  const fresh: Partitioned[] = [];
  for (const l of validItems) {
    const evalId =
      l.kind === "url" ? urlToId.get(l.linkedinUrl) : nameToId.get(l.name.toLowerCase().trim());
    if (evalId) matches.push({ ...l, matchEvalId: evalId });
    else fresh.push(l);
  }

  const enrichFields = (l: ValidItem) => ({
    inputEmail: l.email ?? null,
    inputPhone: l.phone ?? null,
    inputJobTitle: l.jobTitle ?? null,
    inputCity: l.city ?? null,
    inputRegion: l.region ?? null,
    inputCountry: l.country ?? null,
    inputLocationRaw: l.locationRaw ?? null,
  });

  // Tolerate stale Clerk session (deleted user 404).
  const user = await currentUser().catch(() => null);
  const createdByEmail = user?.emailAddresses?.[0]?.emailAddress?.toLowerCase() ?? null;

  // Only the fresh (to-be-scored) items cost credits; enriching existing matches
  // is free.
  const estimate = fresh.length ? await estimateJobCents(fresh.length, model) : 0;
  let creditHoldCents: number | null = null;
  if (fresh.length) {
    const hold = await holdCreditsForJob(user?.id ?? null, estimate);
    if (hold.kind === "insufficient") {
      return NextResponse.json(
        { error: "insufficient_credits", balanceCents: hold.balanceCents, neededCents: hold.neededCents, topupUrl: "/admin/credits" },
        { status: 402 },
      );
    }
    creditHoldCents = hold.creditHoldCents;
  }

  const allItems = [...matches, ...fresh];
  // All-enriched jobs have no scoring work, so the cron never touches them →
  // mark completed at submit. Mixed jobs stay queued; the cron completes them.
  const allEnriched = fresh.length === 0;

  const [job] = await db
    .insert(scoringJobs)
    .values({
      title: body.title?.trim() || autoTitle(allItems as Array<{ kind: "url" | "nameCompany"; company?: string | null }>),
      model,
      status: allEnriched ? "completed" : "queued",
      totalItems: allItems.length,
      completedItems: matches.length, // enriched matches are done at submit
      estimatedCents: estimate,
      createdByEmail,
      createdByClerkUserId: user?.id ?? null,
      creditHoldCents,
      ...(allEnriched ? { completedAt: new Date() } : {}),
    })
    .returning();

  // Score snapshot for matched (existing) evals so the item row is truthful.
  const matchIds = matches.map((m) => m.matchEvalId!).filter(Boolean);
  const snap = new Map<string, { f: number; i: number; c: number; cost: number | null }>();
  if (matchIds.length) {
    for (const r of await db
      .select({
        id: evaluations.id,
        f: evaluations.founderScore,
        i: evaluations.investorScore,
        c: evaluations.score,
        cost: evaluations.costTotalCents,
      })
      .from(evaluations)
      .where(inArray(evaluations.id, matchIds))) {
      snap.set(r.id, { f: r.f, i: r.i, c: r.c, cost: r.cost });
    }
  }

  await db.insert(scoringJobItems).values([
    ...fresh.map((l) => ({
      jobId: job!.id,
      inputRaw: l.raw,
      inputName: l.kind === "nameCompany" ? l.name : null,
      inputCompany: l.kind === "nameCompany" ? l.company : null,
      linkedinUrl: l.kind === "url" ? l.linkedinUrl : null,
      status: l.kind === "url" ? ("resolved" as const) : ("pending" as const),
      ...enrichFields(l),
    })),
    ...matches.map((l) => {
      const s = snap.get(l.matchEvalId!);
      return {
        jobId: job!.id,
        inputRaw: l.raw,
        inputName: l.kind === "nameCompany" ? l.name : null,
        inputCompany: l.kind === "nameCompany" ? l.company : null,
        linkedinUrl: l.kind === "url" ? l.linkedinUrl : null,
        evaluationId: l.matchEvalId,
        status: "enriched" as const,
        completedAt: new Date(),
        founderScore: s?.f ?? null,
        investorScore: s?.i ?? null,
        combinedScore: s?.c ?? null,
        costCents: s?.cost ?? null,
        ...enrichFields(l),
      };
    }),
  ]);

  // Enrich existing matches in place, synchronously (pure DB writes, no LLM).
  for (const m of matches) {
    await applyRowEnrichment(
      m.matchEvalId!,
      { email: m.email, phone: m.phone, jobTitle: m.jobTitle, city: m.city, region: m.region, country: m.country, locationRaw: m.locationRaw },
      user?.id ?? null,
    );
  }

  return NextResponse.json({
    jobId: job!.id,
    totalItems: allItems.length,
    enrichedExisting: matches.length,
    scored: fresh.length,
    estimatedCents: job!.estimatedCents,
    skipped: lines.filter((l) => l.kind === "invalid"),
  });
}
