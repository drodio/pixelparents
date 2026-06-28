import { getExaClient } from "./exa";
import { emptyExaUsage, searchUsage, type ExaUsage } from "./exa-cost";

// Exa-grounded facts layer (roadmap source #1). Uses Exa's /answer endpoint with
// an output schema — synchronous, and crucially it returns CITATIONS. We use it
// to ground the rubric's weakest, highest-point items (capital raised, exits +
// acquisition values, investor portfolio outcomes) with third-party sources,
// instead of letting Claude infer them from search-highlight soup.
//
// The citations are the foundation for DOUBLE-VERIFICATION: a high-value claim
// that shows up here with ≥2 independent third-party sources can be marked
// "corroborated"; a claim that only appears in the subject's own LinkedIn text
// is "self-asserted" and gets down-weighted downstream (see scoring.ts).
//
// Always best-effort: returns null on any failure so the pipeline never breaks.

export type GroundedExit = {
  company: string;
  type: string; // "ipo" | "acquisition" | other
  valueUsd: number | null;
  acquirer: string | null;
};
export type GroundedInvestment = { company: string; outcome: string | null };

export type GroundedFacts = {
  totalRaisedUsd: number | null;
  exits: GroundedExit[];
  notableInvestments: GroundedInvestment[];
  // Total # of startups the subject has INVESTED in (their portfolio size), when a
  // source states or implies it (e.g. "200+ angel investments"). Drives the
  // per-investment investor points; null if unknown.
  portfolioCount: number | null;
  // Flattened third-party source URLs Exa used to answer. Powers corroboration.
  citationUrls: string[];
};

// Compact JSON schema (3 top-level props — well under any property cap).
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    totalRaisedUsd: {
      type: ["number", "null"],
      description: "Cumulative venture capital raised across companies the subject FOUNDED, in raw USD. Null if unknown.",
    },
    exits: {
      type: "array",
      description: "Companies the subject founded that exited.",
      items: {
        type: "object",
        properties: {
          company: { type: "string" },
          type: { type: "string", description: "'ipo' or 'acquisition'" },
          valueUsd: { type: ["number", "null"], description: "Deal/IPO value in raw USD if reported." },
          acquirer: { type: ["string", "null"] },
        },
        required: ["company", "type"],
      },
    },
    notableInvestments: {
      type: "array",
      description:
        "Startups the subject personally INVESTED in (as an angel, GP, or via their fund / syndicate) — INCLUDING seed/early rounds they backed or led, and board/advisor seats. List as many as the sources support. Each with its outcome.",
      items: {
        type: "object",
        properties: {
          company: { type: "string" },
          outcome: { type: ["string", "null"], description: "'ipo' | 'acquisition' | 'unicorn' | 'active' | null" },
        },
        required: ["company"],
      },
    },
    portfolioCount: {
      type: ["number", "null"],
      description:
        "Total number of companies the subject has invested in (their portfolio size), if a source states or strongly implies it (e.g. 'has backed 200+ startups', 'portfolio of 40 companies'). Null if unknown.",
    },
  },
  required: ["totalRaisedUsd", "exits", "notableInvestments"],
} as const;

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// Returns the grounded facts plus the Exa cost the /answer call incurred (so the
// pipeline rolls it into the per-eval pricing). `facts` is null on failure.
export async function groundSubjectFacts(
  fullName: string | null,
  companyHint?: string | null,
): Promise<{ facts: GroundedFacts | null; exaUsage: ExaUsage }> {
  if (!fullName) return { facts: null, exaUsage: emptyExaUsage() };
  try {
    const exa = getExaClient();
    const query =
      `Track record of ${fullName}${companyHint ? ` (associated with ${companyHint})` : ""}, as BOTH a founder AND an investor:\n` +
      `(1) FOUNDER: total venture capital raised across companies they founded; any exits (IPO or acquisition) with deal values and acquirers.\n` +
      `(2) INVESTOR: every startup they have personally INVESTED in — as an angel, a GP, or through their fund/syndicate — including seed/early rounds they backed or LED, and board/advisor seats. List as MANY portfolio companies as the sources support, with each company's outcome (IPO / acquisition / unicorn / still active). Also the TOTAL number of companies they've invested in if stated (e.g. "200+ angel investments"), and any fund/firm they run.\n` +
      `Rely on reputable third-party sources (Crunchbase, PitchBook, TechCrunch, SEC filings, major news) — do NOT rely on the subject's own LinkedIn or personal site.`;

    const res = (await exa.answer(query, {
      outputSchema: OUTPUT_SCHEMA as unknown as Record<string, unknown>,
    })) as unknown as {
      answer?: Record<string, unknown> | string;
      citations?: Array<{ url?: string }>;
      costDollars?: { total?: number };
    };
    // An /answer is an Exa-billed request; record its real cost.
    const exaUsage = searchUsage(0, res.costDollars?.total);

    const a = (typeof res.answer === "object" && res.answer ? res.answer : {}) as Record<string, unknown>;
    const exitsRaw = Array.isArray(a.exits) ? a.exits : [];
    const invRaw = Array.isArray(a.notableInvestments) ? a.notableInvestments : [];

    const exits: GroundedExit[] = exitsRaw
      .map((e) => {
        const o = (e ?? {}) as Record<string, unknown>;
        const company = str(o.company);
        if (!company) return null;
        return { company, type: str(o.type) ?? "exit", valueUsd: num(o.valueUsd), acquirer: str(o.acquirer) };
      })
      .filter((x): x is GroundedExit => !!x);

    const notableInvestments: GroundedInvestment[] = invRaw
      .map((e) => {
        const o = (e ?? {}) as Record<string, unknown>;
        const company = str(o.company);
        if (!company) return null;
        return { company, outcome: str(o.outcome) };
      })
      .filter((x): x is GroundedInvestment => !!x);

    const citationUrls = Array.from(
      new Set((res.citations ?? []).map((c) => str(c?.url)).filter((u): u is string => !!u)),
    );

    // Portfolio size: the stated count, or at least the number of investments we
    // actually enumerated (so a long notableInvestments list still drives points).
    const statedCount = num(a.portfolioCount);
    const portfolioCount =
      statedCount != null ? Math.max(statedCount, notableInvestments.length) : notableInvestments.length || null;

    return {
      facts: { totalRaisedUsd: num(a.totalRaisedUsd), exits, notableInvestments, portfolioCount, citationUrls },
      exaUsage,
    };
  } catch (err) {
    console.warn("[exa-grounding] failed", err instanceof Error ? err.message : err);
    return { facts: null, exaUsage: emptyExaUsage() };
  }
}

function formatUsd(n: number | null): string | null {
  if (n == null) return null;
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(n % 1_000_000_000 === 0 ? 0 : 1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
}

// Render grounded facts into a high-trust prompt block. The CITATIONS line is
// what lets Claude mark supported rows as "corroborated" vs "self-asserted".
export function renderGroundedFacts(g: GroundedFacts | null): string {
  if (!g) return "";
  const lines: string[] = [];
  const hasAny =
    g.totalRaisedUsd != null || g.exits.length > 0 || g.notableInvestments.length > 0 || (g.portfolioCount ?? 0) > 0;
  if (!hasAny && g.citationUrls.length === 0) return "";

  lines.push("", "GROUNDED FACTS (Exa Answer — third-party sourced, prefer over self-claims):");
  const raised = formatUsd(g.totalRaisedUsd);
  if (raised) lines.push(`  Total raised across founded companies (cited): ${raised}.`);
  for (const e of g.exits) {
    const val = formatUsd(e.valueUsd);
    lines.push(
      `  Exit: ${e.company} — ${e.type}${e.acquirer ? ` by ${e.acquirer}` : ""}${val ? ` (${val})` : ""}.`,
    );
  }
  if (g.portfolioCount != null && g.portfolioCount > 0) {
    lines.push(`  Investor portfolio: ~${g.portfolioCount.toLocaleString("en-US")} companies invested in (cited).`);
  }
  for (const inv of g.notableInvestments.slice(0, 15)) {
    lines.push(`  Investment: ${inv.company}${inv.outcome ? ` (${inv.outcome})` : ""}.`);
  }
  if (g.citationUrls.length > 0) {
    lines.push(`  Sources (independent): ${g.citationUrls.slice(0, 10).join(", ")}.`);
  }
  return lines.join("\n");
}
