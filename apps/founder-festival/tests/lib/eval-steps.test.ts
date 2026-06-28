import { describe, it, expect } from "vitest";
import { buildScoreTally, buildFoundIdentities, mapFindingToStep, EVAL_STEPS } from "@/lib/eval-steps";

const stepIdx = (needle: string) => EVAL_STEPS.findIndex((s) => s.toLowerCase().includes(needle.toLowerCase()));

describe("EVAL_STEPS waterfall", () => {
  // The live scoring waterfall (EvalProgress) plays these steps as the profile
  // scores. Every enricher that contributes signal should be visible here so a
  // user can see we checked it "as it happens". These assert the newest sources
  // (Neo, HN Tokenmaxxing, dev.to) made it into the list — they were missing
  // initially even though their enrichers run on every eval.
  it("surfaces Neo as an investor source", () => {
    expect(EVAL_STEPS.some((s) => /\bNeo\b/.test(s))).toBe(true);
  });
  it("surfaces the HN Tokenmaxxing leaderboard", () => {
    expect(EVAL_STEPS.some((s) => /Tokenmaxxing/i.test(s))).toBe(true);
  });
  it("surfaces dev.to technical writing", () => {
    expect(EVAL_STEPS.some((s) => /dev\.to/i.test(s))).toBe(true);
  });
  it("keeps the established sources (no accidental drops)", () => {
    for (const needle of ["GitHub", "NFX", "SEC EDGAR", "Hacker News", "Majestic Million"]) {
      expect(EVAL_STEPS.some((s) => s.includes(needle))).toBe(true);
    }
  });
});

describe("buildFoundIdentities", () => {
  it("formats 'Found you on <platform>: <handle>' with zero points", () => {
    const out = buildFoundIdentities([
      { platform: "GitHub", handle: "DROdio" },
      { platform: "Hacker News", handle: "drodio" },
    ]);
    expect(out).toEqual([
      { text: "Found you on GitHub: DROdio", points: 0, rubric: "founder", stepIndex: stepIdx("GitHub") },
      { text: "Found you on Hacker News: drodio", points: 0, rubric: "founder", stepIndex: stepIdx("Hacker News") },
    ]);
  });

  it("returns [] for empty/nullish and drops incomplete entries", () => {
    expect(buildFoundIdentities([])).toEqual([]);
    expect(buildFoundIdentities(undefined)).toEqual([]);
    expect(buildFoundIdentities([{ platform: "GitHub", handle: "" }])).toEqual([]);
  });
});

describe("buildScoreTally", () => {
  it("returns [] when there's nothing to tally (low-signal)", () => {
    expect(buildScoreTally([], [])).toEqual([]);
    expect(buildScoreTally(undefined, null)).toEqual([]);
  });

  it("orders biggest first, tags rubric, preserves totals, hides per-row points", () => {
    const founder = [
      { points: 15, reason: "Active on Hacker News with 12,400 karma." },
      { points: 200, reason: "Raised $201.6M per Stripe's SEC Form D filing." },
    ];
    const investor = [{ points: 30, reason: "Partner at Sequoia." }];
    const out = buildScoreTally(founder, investor);

    expect(out).toHaveLength(3);
    // Biggest contributor first ($201.6M raise, +200).
    expect(out[0]).toMatchObject({ points: 200, rubric: "founder" });
    expect(out[0]!.text).toContain("Raised $201.6M per Stripe's SEC Form D filing");
    expect(out[0]!.text).toMatch(/^(Folding in|Adding|Counting|Factoring in|Banking) /);
    expect(out[1]).toMatchObject({ points: 30, rubric: "investor" });
    expect(out[2]).toMatchObject({ points: 15, rubric: "founder" });

    // The row text must NOT surface the per-row points ("+5" etc).
    for (const item of out) {
      expect(item.text).not.toMatch(/[+−-]\d/);
      expect(item.text).not.toContain("(");
    }

    // Per-rubric sums must equal the real founder/investor scores (so the
    // scoreboard ticks up to the right totals).
    const f = out.filter((x) => x.rubric === "founder").reduce((s, x) => s + x.points, 0);
    const i = out.filter((x) => x.rubric === "investor").reduce((s, x) => s + x.points, 0);
    expect(f).toBe(215);
    expect(i).toBe(30);
  });

  it("lists EVERY nonzero row individually (no bundling), drops zeros", () => {
    const founder = Array.from({ length: 10 }, (_, i) => ({ points: i + 1, reason: `Founder thing ${i}` }));
    founder.push({ points: 0, reason: "ignored zero" });
    const out = buildScoreTally(founder, []);

    // All 10 nonzero rows shown individually — no "plus N more" summary.
    expect(out).toHaveLength(10);
    expect(out.some((x) => /plus \d+ more/i.test(x.text))).toBe(false);
    expect(out.some((x) => x.text.includes("ignored zero"))).toBe(false);
    // Founder total preserved: 1 + 2 + ... + 10 = 55.
    expect(out.reduce((s, x) => s + x.points, 0)).toBe(55);
  });

  it("handles negative points with a downward verb, no points in text", () => {
    const out = buildScoreTally([{ points: -5, reason: "Penalty thing" }], []);
    expect(out[0]).toMatchObject({ text: "Adjusting for Penalty thing", points: -5, rubric: "founder" });
  });

  it("nests findings under the step matching their source host", () => {
    const out = buildScoreTally(
      [
        { points: 10, reason: "5k GitHub followers", sources: ["https://github.com/drodio"] },
        { points: 8, reason: "Active on HN", sources: ["https://news.ycombinator.com/user?id=drodio"] },
        { points: 200, reason: "Raised $83M", sources: ["https://www.sec.gov/cgi-bin/browse-edgar?x"] },
      ],
      [],
    );
    const byReason = (r: string) => out.find((x) => x.text.includes(r))!;
    expect(byReason("GitHub followers").stepIndex).toBe(stepIdx("GitHub"));
    expect(byReason("Active on HN").stepIndex).toBe(stepIdx("Hacker News"));
    expect(byReason("Raised $83M").stepIndex).toBe(stepIdx("SEC EDGAR"));
  });
});

describe("mapFindingToStep", () => {
  it("maps account-match platforms to their step", () => {
    expect(mapFindingToStep({ platform: "GitHub", rubric: "founder" })).toBe(stepIdx("GitHub"));
    expect(mapFindingToStep({ platform: "NFX Signal", rubric: "investor" })).toBe(stepIdx("NFX"));
    expect(mapFindingToStep({ platform: "Hugging Face", rubric: "founder" })).toBe(stepIdx("Hugging Face"));
  });

  it("maps known source hosts to their step (yc news vs yc company)", () => {
    expect(mapFindingToStep({ sources: ["https://npmjs.com/~drodio"], rubric: "founder" })).toBe(stepIdx("npm"));
    expect(mapFindingToStep({ sources: ["https://news.ycombinator.com/x"], rubric: "founder" })).toBe(stepIdx("Hacker News"));
    expect(mapFindingToStep({ sources: ["https://www.ycombinator.com/companies/x"], rubric: "founder" })).toBe(stepIdx("Y Combinator"));
    expect(mapFindingToStep({ sources: ["https://tkmx.odio.dev/u/DROdio"], rubric: "founder" })).toBe(stepIdx("Tokenmaxxing"));
    expect(mapFindingToStep({ sources: ["https://libraries.io/github/jane/acme"], rubric: "founder" })).toBe(stepIdx("Libraries.io"));
    expect(mapFindingToStep({ sources: ["https://www.google.com/search?q=Jensen+Huang"], rubric: "founder" })).toBe(stepIdx("Knowledge Graph"));
    expect(mapFindingToStep({ sources: ["https://www.youtube.com/watch?v=abc"], rubric: "founder" })).toBe(stepIdx("YouTube"));
  });

  it("maps prestige outlets + awarding bodies to the prestige step", () => {
    expect(mapFindingToStep({ sources: ["https://fortune.com/article"], rubric: "founder" })).toBe(stepIdx("prestige"));
    expect(mapFindingToStep({ sources: ["https://www.wsj.com/articles/x"], rubric: "founder" })).toBe(stepIdx("prestige"));
    expect(mapFindingToStep({ sources: ["https://thielfellowship.org/fellows/x"], rubric: "founder" })).toBe(stepIdx("prestige"));
  });

  it("falls back to deep-web-search for unrecognized sources", () => {
    expect(mapFindingToStep({ sources: ["https://some-random-blog.example/post"], rubric: "founder" })).toBe(
      stepIdx("deep web search"),
    );
  });

  it("falls back by rubric when there are no sources", () => {
    expect(mapFindingToStep({ sources: [], rubric: "founder" })).toBe(stepIdx("past startup performance"));
    expect(mapFindingToStep({ rubric: "investor" })).toBe(stepIdx("investments and outcomes"));
  });
});
