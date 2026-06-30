import { beforeEach, describe, expect, it, vi } from "vitest";
import { aiRankMatches, _clearMatchCache, type AiAsk, type AiCandidate } from "@/lib/match-ai";
import type { AskMatch } from "@/lib/ask-matching";

// A deterministic match (as rankCandidates would emit) — only the fields the
// re-ranker reads matter.
function match(signupId: string, overrides: Partial<AskMatch> = {}): AskMatch {
  return {
    signupId,
    token: null,
    name: `Member ${signupId}`,
    score: 1,
    overlapTags: ["ai"],
    ...overrides,
  };
}

function candidate(signupId: string, overrides: Partial<AiCandidate> = {}): AiCandidate {
  return {
    signupId,
    displayName: `Member ${signupId}`,
    expertiseSignals: ["ai"],
    bio: null,
    enrichmentExpertise: [],
    canHelpWith: [],
    ...overrides,
  };
}

const ask: AiAsk = {
  id: "ask-1",
  title: "Need help fundraising for an EdTech startup",
  body: "Looking to raise a seed round for a classroom tool.",
  tags: ["fundraising", "edtech"],
  kind: "ask",
};

beforeEach(() => {
  _clearMatchCache();
  // No real key in the test env — but force the explicit-model path anyway.
  delete process.env.VERCEL_AI_GATEWAY;
  delete process.env.AI_GATEWAY_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
});

describe("aiRankMatches", () => {
  it("re-ranks by the model's order and attaches the per-match rationale", async () => {
    const deterministic = [match("a"), match("b"), match("c")];
    const candidates = [candidate("a"), candidate("b"), candidate("c")];
    // Model promotes c then a, drops b in its emitted order.
    const model = async () =>
      JSON.stringify({
        ranked: [
          { signupId: "c", rationale: "strong on EdTech + fundraising" },
          { signupId: "a", rationale: "raised a seed round" },
        ],
      });

    const out = await aiRankMatches(ask, deterministic, candidates, model);

    // c, a first (model order) with rationales; b appended (model dropped it).
    expect(out.map((m) => m.signupId)).toEqual(["c", "a", "b"]);
    expect(out[0].rationale).toBe("strong on EdTech + fundraising");
    expect(out[1].rationale).toBe("raised a seed round");
    expect(out[2].rationale).toBeUndefined(); // dropped → appended w/o rationale
  });

  it("ignores invented and duplicate ids from the model", async () => {
    const deterministic = [match("a"), match("b")];
    const candidates = [candidate("a"), candidate("b")];
    const model = async () =>
      JSON.stringify({
        ranked: [
          { signupId: "ghost", rationale: "not a real candidate" },
          { signupId: "a", rationale: "real one" },
          { signupId: "a", rationale: "dupe" },
        ],
      });

    const out = await aiRankMatches(ask, deterministic, candidates, model);

    expect(out.map((m) => m.signupId)).toEqual(["a", "b"]);
    expect(out[0].rationale).toBe("real one");
  });

  it("falls back to deterministic order when the model emits invalid JSON", async () => {
    const deterministic = [match("a"), match("b")];
    const candidates = [candidate("a"), candidate("b")];
    const model = async () => "not json at all";

    const out = await aiRankMatches(ask, deterministic, candidates, model);

    expect(out).toEqual(deterministic);
    expect(out.every((m) => m.rationale === undefined)).toBe(true);
  });

  it("falls back to deterministic order when the model output fails schema validation", async () => {
    const deterministic = [match("a"), match("b")];
    const candidates = [candidate("a"), candidate("b")];
    const model = async () => JSON.stringify({ ranked: "wrong-shape" });

    const out = await aiRankMatches(ask, deterministic, candidates, model);

    expect(out).toEqual(deterministic);
  });

  it("falls back to deterministic order when the model call throws", async () => {
    const deterministic = [match("a"), match("b")];
    const candidates = [candidate("a"), candidate("b")];
    const model = async () => {
      throw new Error("network down");
    };

    const out = await aiRankMatches(ask, deterministic, candidates, model);

    expect(out).toEqual(deterministic);
  });

  it("falls back to deterministic order when the model returns zero usable matches", async () => {
    const deterministic = [match("a"), match("b")];
    const candidates = [candidate("a"), candidate("b")];
    const model = async () => JSON.stringify({ ranked: [{ signupId: "ghost", rationale: "x" }] });

    const out = await aiRankMatches(ask, deterministic, candidates, model);

    expect(out).toEqual(deterministic); // only invented id → nothing usable
  });

  it("short-circuits (no model call) for a single or empty candidate set", async () => {
    const model = vi.fn(async () => JSON.stringify({ ranked: [] }));

    expect(await aiRankMatches(ask, [], [], model)).toEqual([]);
    const one = [match("a")];
    expect(await aiRankMatches(ask, one, [candidate("a")], model)).toEqual(one);
    expect(model).not.toHaveBeenCalled();
  });

  it("does not call the model when no key is set (default model path)", async () => {
    // Using the DEFAULT callModel with no key set → returns deterministic
    // without hitting the network.
    const deterministic = [match("a"), match("b")];
    const candidates = [candidate("a"), candidate("b")];

    const out = await aiRankMatches(ask, deterministic, candidates);

    expect(out).toEqual(deterministic);
  });

  it("caches the result per (ask, candidate set) so re-renders don't re-pay", async () => {
    const deterministic = [match("a"), match("b")];
    const candidates = [candidate("a"), candidate("b")];
    const model = vi.fn(async () =>
      JSON.stringify({ ranked: [{ signupId: "b", rationale: "best fit" }] }),
    );

    const first = await aiRankMatches(ask, deterministic, candidates, model);
    const second = await aiRankMatches(ask, deterministic, candidates, model);

    expect(model).toHaveBeenCalledTimes(1); // second served from cache
    expect(first).toEqual(second);
    expect(second[0].signupId).toBe("b");
  });

  it("re-runs (cache miss) when the candidate roster changes", async () => {
    const model = vi.fn(async () =>
      JSON.stringify({ ranked: [{ signupId: "a", rationale: "fit" }] }),
    );

    await aiRankMatches(ask, [match("a"), match("b")], [candidate("a"), candidate("b")], model);
    // A new candidate c joins → different fingerprint → new call.
    await aiRankMatches(
      ask,
      [match("a"), match("b"), match("c")],
      [candidate("a"), candidate("b"), candidate("c")],
      model,
    );

    expect(model).toHaveBeenCalledTimes(2);
  });
});
