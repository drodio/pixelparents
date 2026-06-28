import { enrichWithGithub } from "./github";
import { enrichWithProductHunt } from "./producthunt";
import { enrichWithWikipedia } from "./wikipedia";
import { enrichWithYC } from "./yc";
import { enrichWithExaDomain } from "./exa-domain";
import { enrichWithHackerNews } from "./hackernews";
import { enrichWithSecEdgar } from "./sec-edgar";
import { enrichWithStackOverflow } from "./stackoverflow";
import { enrichWithNpm } from "./npm";
import { enrichWithHuggingFace } from "./huggingface";
import { enrichWithWikidata } from "./wikidata";
import { enrichWithOpenAlex } from "./openalex";
import { enrichWithNfx } from "./nfx";
import { enrichWithNeo } from "./neo";
import { enrichWithDevto } from "./devto";
import { enrichWithHnTokenmaxxing } from "./hn-tokenmaxxing";
import { enrichWithLibrariesIo } from "./librariesio";
import { enrichWithGoogleKg } from "./google-kg";
import { enrichWithYouTube } from "./youtube";
import { enrichWithBrightData } from "./brightdata";
import { enrichWithPatents } from "./patents";
import { enrichWithKaggle } from "./kaggle";
import { enrichWithCrates } from "./crates";
import { enrichWithTranco } from "./tranco";
import { BD_DATASETS } from "../bd-datasets";

// Each async BrightData dataset (Crunchbase company/person, LinkedIn company, …) is
// an enricher that EMITS the facts the bd-async sweep already fetched + corroborated
// + cached on the eval (ctx.bdAsync[key]). None fetch live (collections are too slow
// to block an eval); on a fresh eval the cache is empty so they no-op, and the
// post-scoring trigger + the bd-async-sweep cron fold them in on a later re-score.
function bdAsyncEnrich(ctx: EnrichCtx, key: string, source: EnrichmentResult["source"]): EnrichmentResult {
  const facts = ctx.bdAsync?.[key]?.data?.facts ?? [];
  return { source, facts, citations: facts.length ? [bdCitationFor(source)] : [] };
}
function bdCitationFor(source: EnrichmentResult["source"]): string {
  if (source === "linkedin-company") return "https://www.linkedin.com";
  if (source === "twitter") return "https://x.com";
  return "https://www.crunchbase.com";
}
import { extractFullName, extractKnownUrls } from "./extract";
import { addExaUsage, emptyExaUsage, type ExaUsage } from "../exa-cost";
import type { EnricherContext, EnrichmentResult } from "./types";

export type { EnrichmentResult } from "./types";

// Per-enricher deadline. Enrichers run in parallel via Promise.allSettled, which
// waits for the SLOWEST member — so without a cap, one hung external API stalls
// the whole eval to the route's 300s maxDuration (billing Exa+Claude for nothing).
// 15s is generous enough never to cut a legitimately-slow source (Exa/SEC under
// load respond well under that) while bounding a true hang. Tune via env;
// per-source budgets are the Phase-1 follow-up (see the audit report).
const ENRICHER_TIMEOUT_MS = Number(process.env.ENRICHER_TIMEOUT_MS) || 15_000;

// Cap a single enricher: resolve to an empty result on deadline or rejection so
// the orchestrator (which keeps only results with facts) simply skips it and the
// eval proceeds with whatever finished in time. The underlying fetch may keep
// running in the background, but the eval no longer BLOCKS on it.
export function withEnricherTimeout(
  source: EnrichmentResult["source"],
  p: Promise<EnrichmentResult>,
  ms: number = ENRICHER_TIMEOUT_MS,
): Promise<EnrichmentResult> {
  const empty: EnrichmentResult = { source, facts: [], citations: [] };
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(empty), ms);
    p.then(
      (r) => { clearTimeout(timer); resolve(r); },
      () => { clearTimeout(timer); resolve(empty); },
    );
  });
}

export type RunEnrichmentsArgs = {
  linkedinUrl: string;
  linkedinHandle: string;
  linkedinPageText: string;
  searchHighlights: Array<{ url: string; title?: string; highlights: string[] }>;
  // Async BrightData facts cached on the eval by the sweep, keyed by dataset.
  bdAsync?: Record<string, { data?: { facts: string[]; raw: unknown } } | undefined> | null;
  // The legal/canonical name already on the eval row (prior LLM extraction). Threaded
  // to identity-critical enrichers (patents) so a vanity LinkedIn handle can't break them.
  knownFullName?: string | null;
};

// The pre-resolved account URLs every enricher may need, computed ONCE per eval
// (extractKnownUrls) and threaded through the context so each `run(ctx)` has a
// uniform signature.
export type KnownUrls = ReturnType<typeof extractKnownUrls>;
export type EnrichCtx = EnricherContext & { knownUrls: KnownUrls };

// A single Tier-1 data source. To add/remove a source you add/remove ONE entry
// in ENRICHERS below — no edits to the orchestration, the run loop, or a parallel
// positional array. `timeoutMs` overrides the default per-source deadline (e.g. a
// genuinely slower source can be given more headroom without raising it for all).
export interface Enricher {
  source: EnrichmentResult["source"];
  run: (ctx: EnrichCtx) => Promise<EnrichmentResult>;
  timeoutMs?: number;
}

// THE REGISTRY. Each entry adapts an enricher to the uniform run(ctx) signature,
// pulling any pre-resolved URLs it needs from ctx.knownUrls. Order here is the
// order results are gathered (cosmetic; aggregation is order-independent).
export const ENRICHERS: Enricher[] = [
  { source: "github", run: (c) => enrichWithGithub(c, c.knownUrls.github) },
  { source: "producthunt", run: (c) => enrichWithProductHunt(c, c.knownUrls.producthunt) },
  { source: "wikipedia", run: (c) => enrichWithWikipedia(c, c.knownUrls.wikipedia) },
  { source: "yc", run: (c) => enrichWithYC(c, c.knownUrls.yc) },
  { source: "exa-domain", run: (c) => enrichWithExaDomain(c) },
  { source: "hackernews", run: (c) => enrichWithHackerNews(c, c.knownUrls.hackernews) },
  { source: "sec-edgar", run: (c) => enrichWithSecEdgar(c) },
  { source: "stackoverflow", run: (c) => enrichWithStackOverflow(c, c.knownUrls.stackoverflow) },
  { source: "npm", run: (c) => enrichWithNpm(c, c.knownUrls.npm) },
  { source: "huggingface", run: (c) => enrichWithHuggingFace(c, c.knownUrls.huggingface) },
  { source: "kaggle", run: (c) => enrichWithKaggle(c, c.knownUrls.kaggle) },
  { source: "crates", run: (c) => enrichWithCrates(c, c.knownUrls.github) },
  { source: "tranco", run: (c) => enrichWithTranco(c) },
  { source: "wikidata", run: (c) => enrichWithWikidata(c, c.knownUrls.wikidata) },
  { source: "openalex", run: (c) => enrichWithOpenAlex(c) },
  { source: "nfx", run: (c) => enrichWithNfx(c) },
  { source: "neo", run: (c) => enrichWithNeo(c) },
  { source: "devto", run: (c) => enrichWithDevto(c) },
  { source: "hn-tokenmaxxing", run: (c) => enrichWithHnTokenmaxxing(c, c.knownUrls.hackernews) },
  { source: "librariesio", run: (c) => enrichWithLibrariesIo(c, c.knownUrls.github) },
  { source: "google-kg", run: (c) => enrichWithGoogleKg(c) },
  { source: "youtube", run: (c) => enrichWithYouTube(c) },
  // USPTO patents (synchronous, ~1s): granted/filed patents naming the subject,
  // assignee-company corroborated. Technical/domain depth.
  { source: "patents", run: (c) => enrichWithPatents(c) },
  // BrightData LinkedIn collection is async (trigger→poll→download), so give it a
  // longer deadline than the 15s default. Still bounded so a slow scrape fails safe.
  { source: "brightdata", run: (c) => enrichWithBrightData(c), timeoutMs: 22_000 },
  // Async BrightData datasets — each emits its cached facts (instant; no live fetch).
  ...BD_DATASETS.map((ds) => ({
    source: ds.source as EnrichmentResult["source"],
    run: async (c: EnrichCtx) => bdAsyncEnrich(c, ds.key, ds.source as EnrichmentResult["source"]),
  })),
];

// Run a set of enrichers against a context, in parallel, each bounded by
// withEnricherTimeout (per-entry timeoutMs or the default). Aggregates: keep
// results that produced facts; sum Exa cost across ALL of them (a billed search
// counts even when it yielded no facts). Exported + enricher-list-injectable so
// the orchestration is testable without touching the network.
export async function runRegistry(
  enrichers: Enricher[],
  ctx: EnrichCtx,
): Promise<{ enrichments: EnrichmentResult[]; exaUsage: ExaUsage }> {
  const settled = await Promise.allSettled(
    enrichers.map((e) => withEnricherTimeout(e.source, e.run(ctx), e.timeoutMs)),
  );
  const enrichments: EnrichmentResult[] = [];
  let exaUsage = emptyExaUsage();
  for (const s of settled) {
    if (s.status !== "fulfilled") continue;
    if (s.value.exaUsage) exaUsage = addExaUsage(exaUsage, s.value.exaUsage);
    if (s.value.facts.length > 0) enrichments.push(s.value);
  }
  return { enrichments, exaUsage };
}

// Runs every Tier 1 enricher in the registry. Returns the results that produced
// facts plus the extracted fullName the enrichers used and total Exa cost.
export async function runEnrichments(args: RunEnrichmentsArgs): Promise<{
  fullName: string | null;
  enrichments: EnrichmentResult[];
  exaUsage: ExaUsage;
}> {
  const baseCtx = { ...args, fullName: null };
  const fullName = extractFullName(baseCtx);
  const knownUrls = extractKnownUrls(baseCtx);
  const ctx: EnrichCtx = { ...baseCtx, fullName, knownUrls };
  const { enrichments, exaUsage } = await runRegistry(ENRICHERS, ctx);
  return { fullName, enrichments, exaUsage };
}

export function renderEnrichmentsForPrompt(enrichments: EnrichmentResult[]): string {
  if (enrichments.length === 0) return "";
  const lines: string[] = ["", "TIER 1 ENRICHMENT SOURCES (verified third-party data):"];
  for (const e of enrichments) {
    lines.push("");
    lines.push(`[${e.source}]`);
    for (const f of e.facts) lines.push(`  ${f}`);
  }
  return lines.join("\n");
}
