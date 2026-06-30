import { describe, it, expect } from "vitest";
import {
  validateResourceTitle,
  validateResourceUrl,
  validateResourceNote,
  normalizeResourceTags,
  heuristicTags,
  autoLabelResource,
  filterByTag,
  RESOURCE_TITLE_MAX,
  RESOURCE_NOTE_MAX,
  RESOURCE_TAGS_MAX,
  RESOURCE_TAGS_MIN,
} from "@/lib/resources-label";

// ---------------------------------------------------------------------------
// Validators — the gate the submit server action relies on. Pure, DB-free.
// ---------------------------------------------------------------------------

describe("validateResourceTitle", () => {
  it("rejects empty / whitespace-only", () => {
    expect(validateResourceTitle("   ").ok).toBe(false);
    expect(validateResourceTitle("").ok).toBe(false);
    expect(validateResourceTitle(undefined).ok).toBe(false);
  });
  it("collapses internal whitespace and trims", () => {
    const r = validateResourceTitle("  Khan   Academy\tCalculus ");
    expect(r.ok && r.value).toBe("Khan Academy Calculus");
  });
  it("rejects over the length cap", () => {
    expect(validateResourceTitle("x".repeat(RESOURCE_TITLE_MAX + 1)).ok).toBe(false);
    expect(validateResourceTitle("x".repeat(RESOURCE_TITLE_MAX)).ok).toBe(true);
  });
});

describe("validateResourceUrl", () => {
  it("accepts http(s) URLs and returns a canonical href", () => {
    const r = validateResourceUrl("https://khanacademy.org/math");
    expect(r.ok).toBe(true);
    expect(r.ok && r.value).toBe("https://khanacademy.org/math");
  });
  it("upgrades a scheme-less host to https://", () => {
    const r = validateResourceUrl("khanacademy.org/math");
    expect(r.ok && r.value).toBe("https://khanacademy.org/math");
  });
  it("rejects empty", () => {
    expect(validateResourceUrl("").ok).toBe(false);
    expect(validateResourceUrl("   ").ok).toBe(false);
  });
  it("rejects non-http(s) schemes (XSS / exfil vectors)", () => {
    expect(validateResourceUrl("javascript:alert(1)").ok).toBe(false);
    expect(validateResourceUrl("data:text/html,<script>").ok).toBe(false);
    expect(validateResourceUrl("mailto:a@b.com").ok).toBe(false);
    expect(validateResourceUrl("file:///etc/passwd").ok).toBe(false);
  });
  it("rejects hosts without a dot / garbage", () => {
    expect(validateResourceUrl("not a url").ok).toBe(false);
    expect(validateResourceUrl("https://localhost").ok).toBe(false);
  });
});

describe("validateResourceNote", () => {
  it("treats empty as valid (note is optional)", () => {
    const r = validateResourceNote("");
    expect(r.ok && r.value).toBe("");
  });
  it("preserves paragraph breaks but strips control chars", () => {
    const r = validateResourceNote("line one\n\nline two");
    expect(r.ok && r.value).toBe("line one\n\nline two");
  });
  it("rejects over the cap", () => {
    expect(validateResourceNote("x".repeat(RESOURCE_NOTE_MAX + 1)).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tag normalization — the shaping the data layer stores.
// ---------------------------------------------------------------------------

describe("normalizeResourceTags", () => {
  it("lowercases, trims, dedupes case-insensitively", () => {
    expect(normalizeResourceTags(["Math", "math", " MATH ", "Science"])).toEqual([
      "math",
      "science",
    ]);
  });
  it("drops empties and non-strings", () => {
    expect(normalizeResourceTags(["ok", "", "   ", 42, null, undefined])).toEqual(["ok"]);
  });
  it("caps at RESOURCE_TAGS_MAX", () => {
    const many = ["a", "b", "c", "d", "e", "f", "g"];
    expect(normalizeResourceTags(many)).toHaveLength(RESOURCE_TAGS_MAX);
  });
  it("caps per-tag length", () => {
    const [tag] = normalizeResourceTags(["x".repeat(80)]);
    expect(tag.length).toBeLessThanOrEqual(40);
  });
  it("returns [] for non-array input", () => {
    expect(normalizeResourceTags("nope")).toEqual([]);
    expect(normalizeResourceTags(undefined)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Heuristic fallback labeler — deterministic, no network.
// ---------------------------------------------------------------------------

describe("heuristicTags", () => {
  it("derives subject tags from the title", () => {
    const tags = heuristicTags({ title: "AP Calculus practice problems" });
    expect(tags).toContain("math");
  });
  it("matches multiple topics", () => {
    const tags = heuristicTags({
      title: "Python coding course for college admissions essays",
    });
    expect(tags).toContain("coding");
    expect(tags).toContain("college-prep");
    expect(tags).toContain("writing");
  });
  it("never returns empty — falls back to 'resource'", () => {
    expect(heuristicTags({ title: "zzzz qqqq" })).toEqual(["resource"]);
  });
  it("caps at RESOURCE_TAGS_MAX", () => {
    const tags = heuristicTags({
      title: "math science history writing college coding ai art career",
    });
    expect(tags.length).toBeLessThanOrEqual(RESOURCE_TAGS_MAX);
  });
});

// ---------------------------------------------------------------------------
// autoLabelResource — the function the submit action calls. MUST never throw
// and MUST always return tags, so a missing/failed AI key never blocks a share.
// ---------------------------------------------------------------------------

describe("autoLabelResource (fallback behavior — no model key)", () => {
  const NO_KEY = ((): void => {
    delete process.env.VERCEL_AI_GATEWAY;
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  })();

  it("falls back to heuristic tags when no model key is set (does NOT call the model)", async () => {
    let called = false;
    const model = async () => {
      called = true;
      return "[]";
    };
    const tags = await autoLabelResource({ title: "AP Calculus review" }, model);
    expect(called).toBe(false); // no key → never reaches the model
    expect(tags).toContain("math");
    expect(NO_KEY).toBeUndefined();
  });
});

describe("autoLabelResource (with a model key, mocked model)", () => {
  const withKey = (fn: () => Promise<void>) => async () => {
    process.env.VERCEL_AI_GATEWAY = "test-key";
    try {
      await fn();
    } finally {
      delete process.env.VERCEL_AI_GATEWAY;
    }
  };

  it(
    "uses the model's tags when valid",
    withKey(async () => {
      const model = async () => '["math", "video", "course"]';
      const tags = await autoLabelResource({ title: "Calc lectures" }, model);
      expect(tags).toEqual(["math", "video", "course"]);
    }),
  );

  it(
    "tolerates prose / fences around the JSON array",
    withKey(async () => {
      const model = async () => 'Here are tags:\n```json\n["coding", "ai"]\n```';
      const tags = await autoLabelResource({ title: "ML tutorial" }, model);
      expect(tags).toEqual(["coding", "ai"]);
    }),
  );

  it(
    "falls back to heuristic tags when the model returns junk",
    withKey(async () => {
      const model = async () => "not json at all";
      const tags = await autoLabelResource({ title: "Algebra basics" }, model);
      expect(tags).toContain("math"); // heuristic kicked in
    }),
  );

  it(
    "falls back to heuristic tags when the model throws (never blocks submission)",
    withKey(async () => {
      const model = async () => {
        throw new Error("gateway down");
      };
      const tags = await autoLabelResource({ title: "History of Rome" }, model);
      expect(tags).toContain("history");
    }),
  );

  it(
    "pads a too-short model result up to the minimum from the heuristic",
    withKey(async () => {
      const model = async () => '["math"]'; // 1 tag, below the floor
      const tags = await autoLabelResource({ title: "Calculus and writing" }, model);
      expect(tags.length).toBeGreaterThanOrEqual(RESOURCE_TAGS_MIN);
      expect(tags).toContain("math");
    }),
  );

  it(
    "caps the model result at RESOURCE_TAGS_MAX",
    withKey(async () => {
      const model = async () => '["a","b","c","d","e","f","g"]';
      const tags = await autoLabelResource({ title: "x" }, model);
      expect(tags.length).toBeLessThanOrEqual(RESOURCE_TAGS_MAX);
    }),
  );
});

// ---------------------------------------------------------------------------
// Tag filter — the browse-by-topic logic shared with the client list.
// ---------------------------------------------------------------------------

describe("filterByTag", () => {
  const items = [
    { id: "1", tags: ["math", "video"] },
    { id: "2", tags: ["history"] },
    { id: "3", tags: ["math", "college-prep"] },
    { id: "4", tags: [] },
  ];

  it("returns everything when the tag is null (no filter)", () => {
    expect(filterByTag(items, null)).toHaveLength(4);
  });
  it("returns everything for an empty-string tag", () => {
    expect(filterByTag(items, "")).toHaveLength(4);
  });
  it("keeps only items carrying the tag", () => {
    expect(filterByTag(items, "math").map((i) => i.id)).toEqual(["1", "3"]);
    expect(filterByTag(items, "history").map((i) => i.id)).toEqual(["2"]);
  });
  it("returns [] when nothing matches", () => {
    expect(filterByTag(items, "nonexistent")).toEqual([]);
  });
  it("does not mutate the input", () => {
    const copy = [...items];
    filterByTag(items, "math");
    expect(items).toEqual(copy);
  });
});
