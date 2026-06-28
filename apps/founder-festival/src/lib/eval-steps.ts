// Shared step list rendered by EvalProgress in both the splash flow
// (SplashForm) and the Re-Score flow (ReScoreButton). Keep these in one
// place so the two surfaces never drift.
export const EVAL_STEPS = [
  "Looking you up on LinkedIn",
  "Enriching your profile with Bright Data",
  "Pulling your company's funding, web traffic & app downloads from Crunchbase",
  "Sizing up your company on LinkedIn (headcount, followers, funding)",
  "Cross-referencing Crunchbase for your board seats & investor activity",
  "Checking your reach on X / Twitter",
  "Searching the USPTO for patents you've invented",
  "Running a deep web search across your career",
  "Scanning press, podcasts, and case studies",
  "Checking Google's Knowledge Graph for a knowledge panel",
  "Searching YouTube for your talks, interviews, and media reach",
  "Searching for prestige signals (Thiel Fellow, Rhodes, Forbes, Fortune, WSJ…)",
  "Checking Product Hunt for your launches",
  "Cross-referencing GitHub for your open-source work",
  "Checking Libraries.io for your SourceRank and OSS reputation",
  "Scanning npm for packages you maintain",
  "Scanning crates.io for Rust packages you maintain",
  "Checking Hugging Face for AI models you've published",
  "Checking Kaggle for datasets and notebooks you've published",
  "Checking Stack Overflow for your reputation",
  "Checking your Hacker News karma and top posts",
  "Reading the technical articles you've published on dev.to",
  "Checking your rank on the HN Tokenmaxxing leaderboard",
  "Looking for Y Combinator companies you founded",
  "Pulling your investor profile from NFX Signal",
  "Cross-referencing Neo for your investor focus and check size",
  "Verifying capital raised via SEC EDGAR filings",
  "Checking Wikipedia for notability",
  "Cross-referencing Wikidata for structured career facts",
  "Checking research papers you've authored and their citations",
  "Evaluating your past startup performance",
  "Evaluating your investments and outcomes",
  "Checking your rank on the Majestic Million",
  "Cross-checking your domain's rank on the Tranco list",
  "Synthesizing your founder + investor profile",
  // NOTE: "Computing your score" intentionally lives at the TOP of EvalProgress
  // as a left-to-right progress bar (not a step here), so there's always
  // movement while the score is computed. See EvalProgress.tsx.
];

// A single breakdown row as returned by /api/eval and /api/rescore. `sources`
// (citation URLs) is what we use to nest the finding under the research step
// that produced it (see mapFindingToStep).
type TallyRow = { points: number; reason: string; sources?: string[] | null };

// Find the first EVAL_STEPS index whose label contains `needle` (case-insensitive).
// Matching by substring (not index) keeps the mapping stable if step copy is
// reworded. -1 if not found.
function stepIndexOf(needle: string): number {
  const n = needle.toLowerCase();
  return EVAL_STEPS.findIndex((s) => s.toLowerCase().includes(n));
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

// Source host → the EVAL_STEPS label substring it belongs under. Order matters:
// news.ycombinator.com must be checked before the broader ycombinator.com.
const HOST_TO_STEP: Array<[RegExp, string]> = [
  // Crunchbase company + person findings nest under the Crunchbase step.
  [/(^|\.)crunchbase\.com$/, "Crunchbase"],
  // USPTO patent findings nest under the patents step.
  [/(^|\.)uspto\.gov$/, "patents you've invented"],
  // X/Twitter findings nest under the Twitter step.
  [/(^|\.)x\.com$/, "X / Twitter"],
  [/(^|\.)twitter\.com$/, "X / Twitter"],
  // LinkedIn-sourced findings (follower reach, experience) nest under the
  // "Looking you up on LinkedIn" step so they show as gold bullets there.
  [/(^|\.)linkedin\.com$/, "Looking you up on LinkedIn"],
  [/(^|\.)github\.com$/, "GitHub"],
  [/(^|\.)news\.ycombinator\.com$/, "Hacker News"],
  [/(^|\.)ycombinator\.com$/, "Y Combinator"],
  [/(^|\.)npmjs\.com$/, "npm"],
  [/(^|\.)huggingface\.co$/, "Hugging Face"],
  [/(^|\.)kaggle\.com$/, "Kaggle"],
  [/(^|\.)crates\.io$/, "crates.io"],
  [/(^|\.)tranco-list\.eu$/, "Tranco"],
  [/(^|\.)stackoverflow\.com$/, "Stack Overflow"],
  [/(^|\.)producthunt\.com$/, "Product Hunt"],
  [/(^|\.)dev\.to$/, "dev.to"],
  [/(^|\.)sec\.gov$/, "SEC EDGAR"],
  [/(^|\.)wikipedia\.org$/, "Wikipedia"],
  [/(^|\.)wikidata\.org$/, "Wikidata"],
  [/(^|\.)nfx\.com$/, "NFX"],
  [/(^|\.)neo\.com$/, "Neo"],
  [/(^|\.)tkmx\.odio\.dev$/, "Tokenmaxxing"],
  [/(^|\.)libraries\.io$/, "Libraries.io"],
  [/(^|\.)google\.com$/, "Knowledge Graph"],
  [/(^|\.)youtube\.com$/, "YouTube"],
  // Prestige / recognition outlets + awarding bodies. Findings sourced here nest
  // under the "Searching for prestige signals…" step (matched by the "prestige"
  // substring). A tier-1 outlet is itself the recognition, so bucketing its
  // findings as prestige is correct even when the fact is incidental.
  [/(^|\.)forbes\.com$/, "prestige"],
  [/(^|\.)wsj\.com$/, "prestige"],
  [/(^|\.)fortune\.com$/, "prestige"],
  [/(^|\.)time\.com$/, "prestige"],
  [/(^|\.)nytimes\.com$/, "prestige"],
  [/(^|\.)economist\.com$/, "prestige"],
  [/(^|\.)bloomberg\.com$/, "prestige"],
  [/(^|\.)thielfellowship\.org$/, "prestige"],
  [/(^|\.)macfound\.org$/, "prestige"],
];

// Account-match platform (from buildFoundIdentities' `platform`) → step substring.
const PLATFORM_TO_STEP: Record<string, string> = {
  github: "GitHub",
  "hacker news": "Hacker News",
  npm: "npm",
  "hugging face": "Hugging Face",
  kaggle: "Kaggle",
  "stack overflow": "Stack Overflow",
  "nfx signal": "NFX",
  nfx: "NFX",
  neo: "Neo",
  "dev.to": "dev.to",
};

// Maps a finding to the EVAL_STEPS index it should nest under (approach A):
// account matches by platform; score findings by their source host; sourced-but-
// unrecognized → the deep-web-search step; sourceless → the rubric's "Evaluating
// your …" step. Always returns a valid index.
export function mapFindingToStep(opts: {
  sources?: string[] | null;
  platform?: string | null;
  rubric: "founder" | "investor";
}): number {
  const { sources, platform, rubric } = opts;

  if (platform) {
    const sub = PLATFORM_TO_STEP[platform.trim().toLowerCase()];
    if (sub) {
      const i = stepIndexOf(sub);
      if (i >= 0) return i;
    }
  }

  const hosts = (sources ?? []).map(hostOf).filter((h): h is string => !!h);
  for (const [re, sub] of HOST_TO_STEP) {
    if (hosts.some((h) => re.test(h))) {
      const i = stepIndexOf(sub);
      if (i >= 0) return i;
    }
  }
  if (hosts.length > 0) {
    const i = stepIndexOf("deep web search");
    if (i >= 0) return i;
  }
  const i = stepIndexOf(rubric === "investor" ? "investments and outcomes" : "past startup performance");
  return i >= 0 ? i : EVAL_STEPS.length - 1;
}

// "Found you on GitHub: DROdio" lines — shown first in the finale to confirm
// we matched the subject's accounts. points:0 so they don't move the scoreboard.
export function buildFoundIdentities(
  found: Array<{ platform: string; handle: string }> | undefined | null,
): TallyItem[] {
  return (found ?? [])
    .filter((f) => f && f.platform && f.handle)
    .map((f) => ({
      text: `Found you on ${f.platform}: ${f.handle}`,
      points: 0,
      rubric: "founder" as const,
      stepIndex: mapFindingToStep({ platform: f.platform, rubric: "founder" }),
    }));
}

// One animated tally line plus the structured data the live scoreboard needs.
// `points` is NOT shown in `text` — it only drives the running total at the
// bottom (per DROdio: don't surface per-row "+N" in the row updates). `stepIndex`
// is the EVAL_STEPS row this finding nests under in the waterfall.
export type TallyItem = {
  text: string;
  points: number;
  rubric: "founder" | "investor";
  stepIndex: number;
};

// Turns the actual scoring breakdown into engaging, data-driven tally items that
// EvalProgress plays AFTER the score comes back — so instead of sitting on
// "Computing your score", the user watches the real findings fold in (e.g.
// "Folding in active on Hacker News with 12,400 karma") while the
// founder/investor/total scoreboard ticks up to the final score. EVERY nonzero
// row is shown individually (no bundling) so nothing is hidden behind a "plus N
// more" line. Returns [] when there's nothing to tally (low-signal).
export function buildScoreTally(
  founder: TallyRow[] | undefined | null,
  investor: TallyRow[] | undefined | null,
): TallyItem[] {
  const verbs = ["Folding in", "Adding", "Counting", "Factoring in", "Banking"];
  const tag = (rows: TallyRow[] | undefined | null, rubric: "founder" | "investor") =>
    (rows ?? [])
      .filter((r) => r && typeof r.points === "number" && r.points !== 0 && !!r.reason)
      .map((r) => ({ ...r, rubric }));

  // Biggest contributors first — most satisfying to watch.
  const all = [...tag(founder, "founder"), ...tag(investor, "investor")].sort(
    (a, b) => Math.abs(b.points) - Math.abs(a.points),
  );

  return all.map((r, i) => {
    // Reasons are full sentences ("...with 12,400 karma."). Trim the trailing
    // period and cap length so the line stays tidy.
    let reason = r.reason.replace(/\s*\.$/, "").trim();
    if (reason.length > 80) reason = reason.slice(0, 79).trimEnd() + "…";
    const verb = r.points >= 0 ? verbs[i % verbs.length]! : "Adjusting for";
    return {
      text: `${verb} ${reason}`,
      points: r.points,
      rubric: r.rubric,
      stepIndex: mapFindingToStep({ sources: r.sources, rubric: r.rubric }),
    };
  });
}
