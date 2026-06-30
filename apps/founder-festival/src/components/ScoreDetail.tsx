"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useMounted } from "@/lib/use-mounted";

// Presentational Score Detail modal. Takes a fully-formed data object and
// renders the overlay + panel — no fetching, no trigger. Rendered both for the
// live score (ScoreDetailButton) and for a historical run (ScoringLogModal),
// which is why it carries an optional `onBack` for the log's list ⇄ detail nav.
//
// Intentionally EXHAUSTIVE: this is the super-admin "show me everything that
// went into the score" view. It surfaces every scoring input we persist —
// identity, each enricher's raw payload, extracted metrics, investor facets,
// the rubric breakdown, recommendations, Exa grounding, MM hits, token usage +
// cost — and ends with a raw-profile catch-all so nothing is ever hidden.

export type Row = {
  points: number;
  reason: string;
  // Per-row scoring detail the rubric uses for verification weighting. Stored on
  // the breakdown items (and thus in the snapshot); optional on legacy rows.
  confidence?: number | null;
  verification?: string | null;
  sources?: string[] | null;
};
type Grounding = unknown;

export type RecommendationsData = {
  summary: string;
  items: Array<{ id: string; text: string; category: string }>;
};

// Eval-row scoring fields that don't live inside `profile`/`grounding`. Captured
// into the scoring_runs snapshot (see scoring-runs.ts) so a historical run can
// render them too. All optional — older snapshots / the /not-this-round debug
// path may omit it.
export type ScoreDetailMeta = {
  fullName?: string | null;
  pricing?: unknown;
  costLlmCents?: number | null;
  costExaCents?: number | null;
  costTotalCents?: number | null;
  investorStageFocus?: string[] | null;
  investorIndustryFocus?: string[] | null;
  investorLeadsRounds?: boolean | null;
  investorCheckSize?: unknown;
  onNeo?: boolean | null;
  neoSlug?: string | null;
  summarySource?: string | null;
  summaryStatus?: string | null;
  summaryConfidence?: number | null;
  summaryOriginalText?: string | null;
  subjectCity?: string | null;
  subjectRegion?: string | null;
  subjectCountry?: string | null;
  slug?: string | null;
  slugKind?: string | null;
};

export type ScoreDetailData = {
  evaluationId: string;
  linkedinUrl: string;
  profile: unknown;
  grounding: Grounding;
  founderBreakdown: Row[];
  investorBreakdown: Row[];
  founderScore: number;
  investorScore: number;
  combinedScore: number;
  signalQuality: string;
  companyStage: string | null;
  source: string;
  sourceCode: string | null;
  createdAt: string;
  updatedAt: string;
  recommendations: RecommendationsData | null;
  meta?: ScoreDetailMeta | null;
};

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function field(label: string, value: unknown): React.ReactNode {
  let display: string;
  if (value === null || value === undefined) display = "—";
  else if (typeof value === "boolean") display = value ? "yes" : "no";
  else if (typeof value === "number") display = value.toLocaleString();
  else if (Array.isArray(value)) display = value.length ? value.join(", ") : "—";
  else display = String(value);
  return (
    <div key={label} className="flex items-baseline gap-3 py-1">
      <span className="text-xs uppercase tracking-[0.18em] text-zinc-500 w-44 shrink-0">
        {label}
      </span>
      <span className="text-sm text-zinc-200 font-mono break-words min-w-0">{display}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-3">{title}</h3>
      {children}
    </section>
  );
}

function Json({ value }: { value: unknown }) {
  return (
    <pre className="bg-black/40 border border-zinc-800 rounded p-3 overflow-x-auto text-zinc-300 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

// Renders an object's entries: scalars (and arrays of scalars) as labeled rows,
// nested objects/arrays-of-objects as a labeled JSON block. Used for identity,
// extracted metrics, investor facets, and each enricher's raw payload so EVERY
// field shows without per-shape custom code.
function ObjectDump({ value, empty = "None." }: { value: unknown; empty?: string }) {
  const o = asObj(value);
  if (!o) return <p className="text-sm text-zinc-400 italic">{empty}</p>;
  const entries = Object.entries(o);
  if (entries.length === 0) return <p className="text-sm text-zinc-400 italic">{empty}</p>;
  return (
    <div className="flex flex-col gap-0">
      {entries.map(([k, v]) => {
        const isScalarArray = Array.isArray(v) && v.every((x) => x === null || typeof x !== "object");
        if (v === null || v === undefined || typeof v !== "object" || isScalarArray) {
          return field(k, v);
        }
        return (
          <div key={k} className="py-1">
            <span className="text-xs uppercase tracking-[0.18em] text-zinc-500">{k}</span>
            <Json value={v} />
          </div>
        );
      })}
    </div>
  );
}

function extractCitationUrls(grounding: Grounding): string[] {
  if (!grounding || typeof grounding !== "object") return [];
  const collected = new Set<string>();
  function walk(node: unknown) {
    if (!node) return;
    if (typeof node === "string" && /^https?:\/\//i.test(node)) collected.add(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (typeof node === "object") {
      const obj = node as Record<string, unknown>;
      if (typeof obj.url === "string" && /^https?:\/\//i.test(obj.url)) collected.add(obj.url);
      Object.values(obj).forEach(walk);
    }
  }
  walk(grounding);
  return [...collected];
}

function BreakdownTable({ title, rows, total }: { title: string; rows: Row[]; total: number }) {
  return (
    <Section title={`${title} · total ${total} (${rows.length} rows)`}>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-400 italic">No rows on this dimension.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r, i) => {
              const sources = Array.isArray(r.sources) ? r.sources : [];
              const tags = [
                r.verification ? String(r.verification) : null,
                typeof r.confidence === "number" ? `${r.confidence}% confidence` : null,
              ].filter(Boolean);
              return (
                <tr key={i} className="border-t border-zinc-800">
                  <td className="py-2 pr-4 font-mono text-zinc-100 align-top w-16 text-right">
                    +{r.points}
                  </td>
                  <td className="py-2 text-zinc-300">
                    <div>{r.reason}</div>
                    {tags.length > 0 && (
                      <div className="text-xs text-zinc-500 mt-1">{tags.join(" · ")}</div>
                    )}
                    {sources.length > 0 && (
                      <ul className="mt-1 flex flex-col gap-0.5">
                        {sources.map((s) => (
                          <li key={s}>
                            <a
                              href={s}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="link text-xs break-all"
                            >
                              {s}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Section>
  );
}

function buildDebugReport(data: ScoreDetailData, citationUrls: string[]): string {
  const fSum = data.founderBreakdown.reduce((a, b) => a + b.points, 0);
  const iSum = data.investorBreakdown.reduce((a, b) => a + b.points, 0);
  const lines: string[] = [];
  lines.push(`# Founder Festival score debug`);
  lines.push("");
  lines.push(`- subject: ${data.linkedinUrl}`);
  lines.push(`- evaluation id: ${data.evaluationId}`);
  lines.push(`- source: ${data.source}${data.sourceCode ? ` (code: ${data.sourceCode})` : ""}`);
  lines.push(`- created: ${data.createdAt}`);
  lines.push(`- updated: ${data.updatedAt}`);
  lines.push("");
  lines.push(`## Stored scores`);
  lines.push(`- founderScore: ${data.founderScore} (breakdown sum: ${fSum}${fSum !== data.founderScore ? " ← MISMATCH" : ""})`);
  lines.push(`- investorScore: ${data.investorScore} (breakdown sum: ${iSum}${iSum !== data.investorScore ? " ← MISMATCH" : ""})`);
  lines.push(`- combinedScore: ${data.combinedScore}${data.combinedScore !== data.founderScore + data.investorScore ? " ← MISMATCH" : ""}`);
  lines.push(`- signalQuality: ${data.signalQuality}`);
  lines.push(`- companyStage: ${data.companyStage ?? "—"}`);
  lines.push("");
  lines.push(`## Founder breakdown (${data.founderBreakdown.length} rows)`);
  if (data.founderBreakdown.length === 0) lines.push(`(empty)`);
  for (const r of data.founderBreakdown) lines.push(`- +${r.points}: ${r.reason}`);
  lines.push("");
  lines.push(`## Investor breakdown (${data.investorBreakdown.length} rows)`);
  if (data.investorBreakdown.length === 0) lines.push(`(empty)`);
  for (const r of data.investorBreakdown) lines.push(`- +${r.points}: ${r.reason}`);
  lines.push("");
  lines.push(`## Recommendations`);
  if (!data.recommendations) {
    lines.push(`(none)`);
  } else {
    lines.push(`**Summary:** ${data.recommendations.summary}`);
    for (const it of data.recommendations.items) lines.push(`- [${it.category}] ${it.text}`);
  }
  lines.push("");
  if (data.meta) {
    lines.push(`## Eval meta (facets, pricing, summary)`);
    lines.push("```json");
    lines.push(JSON.stringify(data.meta, null, 2));
    lines.push("```");
    lines.push("");
  }
  lines.push(`## Profile (stored — identity, enrichments, metrics, usage)`);
  lines.push("```json");
  lines.push(JSON.stringify(data.profile, null, 2));
  lines.push("```");
  lines.push("");
  lines.push(`## Citation URLs (${citationUrls.length})`);
  for (const u of citationUrls) lines.push(`- ${u}`);
  lines.push("");
  lines.push(`## Exa grounding (raw)`);
  lines.push("```json");
  lines.push(JSON.stringify(data.grounding, null, 2));
  lines.push("```");
  return lines.join("\n");
}

export function ScoreDetail({
  data,
  onClose,
  onBack,
}: {
  data: ScoreDetailData;
  onClose: () => void;
  // When present, the header shows a "← Scoring Log" button instead of closing
  // straight out — used by the history modal to return to the run list.
  onBack?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  // Portal to <body>: this modal is opened from the admin pill, which has
  // backdrop-blur (a backdrop-filter). That makes the pill the containing block
  // for position:fixed descendants, so an in-place "fixed inset-0" overlay would
  // be clipped to the tiny pill box instead of filling the viewport. Mounting
  // outside the pill's subtree fixes it. useMounted guards against SSR (no document).
  const mounted = useMounted();
  const { profile, grounding } = data;
  const meta = data.meta ?? null;
  const citationUrls = extractCitationUrls(grounding);

  const profileObj = asObj(profile);
  const identity = profileObj?.identity;
  const extractedMetrics = profileObj?.extractedMetrics;
  const enrichments = asArr(profileObj?.enrichments);
  const enrichmentStatuses = asArr(profileObj?.enrichmentStatuses);
  const usage = profileObj?.usage;
  const mmHits = profileObj?.mmHits;
  const groundingObj = asObj(grounding);

  // Investor facets assembled from the eval-row meta (or null when absent).
  const facets =
    meta &&
    (meta.investorStageFocus?.length ||
      meta.investorIndustryFocus?.length ||
      meta.investorLeadsRounds != null ||
      meta.investorCheckSize ||
      meta.onNeo != null ||
      meta.neoSlug)
      ? {
          stageFocus: meta.investorStageFocus ?? [],
          industryFocus: meta.investorIndustryFocus ?? [],
          leadsRounds: meta.investorLeadsRounds ?? null,
          checkSize: meta.investorCheckSize ?? null,
          onNeo: meta.onNeo ?? null,
          neoSlug: meta.neoSlug ?? null,
        }
      : null;

  async function handleCopy() {
    const text = buildDebugReport(data, citationUrls);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback for non-secure contexts
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center p-4 sm:p-8 overflow-y-auto"
      onClick={onBack ?? onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#1c1c1c] border border-zinc-800 rounded-lg max-w-3xl w-full my-8 p-6 sm:p-8 flex flex-col gap-8 text-zinc-100"
      >
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="text-zinc-400 hover:text-zinc-100 text-sm"
              >
                ← Scoring Log
              </button>
            )}
            <h2 className="font-display text-2xl font-bold">Score detail</h2>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handleCopy}
              className="rounded-md bg-[#D4A24A] hover:bg-[#E0B05A] text-black font-medium text-xs uppercase tracking-[0.15em] px-3 py-1.5 transition-colors"
              title="Copy a debug-ready report of this evaluation"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
            <button
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-200 text-sm"
            >
              Close ✕
            </button>
          </div>
        </div>

        <Section title="Scores">
          <div className="flex flex-col gap-0">
            {field("founder", data.founderScore)}
            {field("investor", data.investorScore)}
            {field("combined", data.combinedScore)}
            {field("signal quality", data.signalQuality)}
            {field("company stage", data.companyStage)}
          </div>
        </Section>

        <Section title="Identity (extracted)">
          <div className="flex flex-col gap-0">
            {field("full name", meta?.fullName ?? profileObj?.fullName)}
            {field("primary company domain", profileObj?.primaryCompanyDomain)}
            {field("public email", profileObj?.publicEmail)}
            {field("github username", profileObj?.githubUsername)}
          </div>
          <div className="mt-2">
            <ObjectDump value={identity} empty="No identity block stored." />
          </div>
        </Section>

        <BreakdownTable
          title="Founder breakdown"
          rows={data.founderBreakdown}
          total={data.founderScore}
        />

        <BreakdownTable
          title="Investor breakdown"
          rows={data.investorBreakdown}
          total={data.investorScore}
        />

        {facets && (
          <Section title="Investor facets">
            <div className="flex flex-col gap-0">
              {field("stage focus", facets.stageFocus)}
              {field("industry focus", facets.industryFocus)}
              {field("leads rounds", facets.leadsRounds)}
              {field("on Neo", facets.onNeo)}
              {field("neo slug", facets.neoSlug)}
              {facets.checkSize ? (
                <div className="py-1">
                  <span className="text-xs uppercase tracking-[0.18em] text-zinc-500">check size</span>
                  <Json value={facets.checkSize} />
                </div>
              ) : (
                field("check size", null)
              )}
            </div>
          </Section>
        )}

        <Section title="Extracted metrics">
          <ObjectDump value={extractedMetrics} empty="No extracted metrics stored." />
        </Section>

        {enrichmentStatuses.length > 0 && (
          <Section title={`Source statuses (${enrichmentStatuses.length})`}>
            <div className="flex flex-col gap-1">
              {enrichmentStatuses.map((s, i) => {
                const so = asObj(s);
                const src = typeof so?.source === "string" ? (so.source as string) : `source ${i}`;
                const status = typeof so?.status === "string" ? (so.status as string) : "ok";
                const note = typeof so?.note === "string" ? (so.note as string) : null;
                const factCount = typeof so?.factCount === "number" ? (so.factCount as number) : null;
                const color =
                  status === "ok"
                    ? "text-emerald-400"
                    : status === "error"
                      ? "text-amber-500"
                      : "text-zinc-500";
                return (
                  <div key={`${src}-${i}`} className="flex items-center gap-2 text-sm">
                    <span className="text-zinc-200 font-medium">{src}</span>
                    <span className={`${color} text-xs uppercase tracking-wide`}>{status}</span>
                    <span className="text-zinc-500 text-xs ml-auto">
                      {note ? note : factCount != null ? `${factCount} facts` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        <Section title={`Enrichment sources (${enrichments.length})`}>
          {enrichments.length === 0 ? (
            <p className="text-sm text-zinc-400 italic">No enrichments stored.</p>
          ) : (
            <div className="flex flex-col gap-5">
              {enrichments.map((e, i) => {
                const eo = asObj(e);
                const src = typeof eo?.source === "string" ? (eo.source as string) : `source ${i}`;
                const factCount = eo?.fact_count;
                const citationCount = eo?.citation_count;
                return (
                  <div key={`${src}-${i}`}>
                    <div className="text-sm font-medium text-zinc-200 mb-1">
                      {src}
                      <span className="text-zinc-500 font-normal">
                        {typeof factCount === "number" ? ` · ${factCount} facts` : ""}
                        {typeof citationCount === "number" ? ` · ${citationCount} citations` : ""}
                      </span>
                    </div>
                    <ObjectDump value={eo?.raw} empty="No raw payload." />
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section title="Recommendations">
          {!data.recommendations ? (
            <p className="text-sm text-zinc-400 italic">No recommendations stored.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-zinc-300">{data.recommendations.summary}</p>
              {data.recommendations.items?.length > 0 && (
                <ul className="flex flex-col gap-1 text-sm">
                  {data.recommendations.items.map((it) => (
                    <li key={it.id} className="text-zinc-300">
                      <span className="text-zinc-500">[{it.category}]</span> {it.text}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {meta && (
            <div className="flex flex-col gap-0 mt-3">
              {field("summary source", meta.summarySource)}
              {field("summary status", meta.summaryStatus)}
              {field("summary confidence", meta.summaryConfidence)}
              {meta.summaryOriginalText ? field("summary (original)", meta.summaryOriginalText) : null}
            </div>
          )}
        </Section>

        <Section title="Exa grounding (high-trust facts)">
          {groundingObj ? (
            <div className="flex flex-col gap-0">
              {field("total raised (USD)", groundingObj.totalRaisedUsd)}
              {asArr(groundingObj.exits).length > 0 ? (
                <div className="py-1">
                  <span className="text-xs uppercase tracking-[0.18em] text-zinc-500">exits</span>
                  <Json value={groundingObj.exits} />
                </div>
              ) : (
                field("exits", null)
              )}
              {asArr(groundingObj.notableInvestments).length > 0 ? (
                <div className="py-1">
                  <span className="text-xs uppercase tracking-[0.18em] text-zinc-500">notable investments</span>
                  <Json value={groundingObj.notableInvestments} />
                </div>
              ) : (
                field("notable investments", null)
              )}
            </div>
          ) : (
            <p className="text-sm text-zinc-400 italic">No grounding stored.</p>
          )}
        </Section>

        <Section title={`Sources Exa cited (${citationUrls.length})`}>
          {citationUrls.length === 0 ? (
            <p className="text-sm text-zinc-400 italic">
              No citation URLs found in the stored grounding blob.
            </p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {citationUrls.slice(0, 50).map((u) => (
                <li key={u}>
                  <a
                    href={u}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link break-all"
                  >
                    {u}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Majestic Million lookups (profile.mmHits)">
          {Array.isArray(mmHits) && mmHits.length > 0 ? (
            <Json value={mmHits} />
          ) : (
            <p className="text-sm text-zinc-400 italic">No MM hits stored on this evaluation.</p>
          )}
        </Section>

        <Section title="Cost & token usage">
          <div className="flex flex-col gap-0">
            {field("scoring model", asObj(usage)?.model)}
            {field("input tokens", asObj(usage)?.inputTokens)}
            {field("cached input tokens", asObj(usage)?.cachedInputTokens)}
            {field("output tokens", asObj(usage)?.outputTokens)}
            {field("LLM cost (USD)", asObj(usage)?.costUsd)}
            {field("LLM cost source", asObj(usage)?.costSource)}
            {field("generation id", asObj(usage)?.generationId)}
            {field("cost — LLM (¢)", meta?.costLlmCents)}
            {field("cost — Exa (¢)", meta?.costExaCents)}
            {field("cost — total (¢)", meta?.costTotalCents)}
          </div>
          {meta?.pricing ? (
            <div className="mt-2">
              <span className="text-xs uppercase tracking-[0.18em] text-zinc-500">pricing (raw)</span>
              <Json value={meta.pricing} />
            </div>
          ) : null}
        </Section>

        <Section title="Evaluation metadata">
          <div className="flex flex-col gap-0">
            {field("source", data.source)}
            {field("source code", data.sourceCode)}
            {field("slug", meta?.slug)}
            {field("slug kind", meta?.slugKind)}
            {field(
              "subject location",
              [meta?.subjectCity, meta?.subjectRegion, meta?.subjectCountry].filter(Boolean).join(", ") || null,
            )}
            {field("created", new Date(data.createdAt).toLocaleString())}
            {field("updated", new Date(data.updatedAt).toLocaleString())}
          </div>
        </Section>

        <Section title="Raw profile JSON (everything stored)">
          <details className="text-xs">
            <summary className="cursor-pointer text-zinc-400 hover:text-zinc-200 mb-2">Expand</summary>
            <Json value={profile} />
          </details>
        </Section>

        <Section title="Raw Exa grounding JSON">
          <details className="text-xs">
            <summary className="cursor-pointer text-zinc-400 hover:text-zinc-200 mb-2">Expand</summary>
            <Json value={grounding} />
          </details>
        </Section>
      </div>
    </div>,
    document.body,
  );
}
