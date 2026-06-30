import { describe, it, expect } from "vitest";
import { tagListView, DEFAULT_TAG_MAX } from "@/lib/tag-list";

const TAGS = ["a", "b", "c", "d", "e", "f", "g", "h"]; // 8 tags

describe("tagListView", () => {
  it("shows everything and reports no overflow when under the limit", () => {
    const view = tagListView(["a", "b", "c"], 6, false);
    expect(view.shown).toEqual(["a", "b", "c"]);
    expect(view.hiddenCount).toBe(0);
    expect(view.hasOverflow).toBe(false);
  });

  it("shows exactly `max` when equal to the limit (no overflow)", () => {
    const six = TAGS.slice(0, 6);
    const view = tagListView(six, 6, false);
    expect(view.shown).toEqual(six);
    expect(view.hasOverflow).toBe(false);
    expect(view.hiddenCount).toBe(0);
  });

  it("collapses to the first `max` and counts the rest as hidden", () => {
    const view = tagListView(TAGS, 6, false);
    expect(view.shown).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(view.hiddenCount).toBe(2); // "+2 more"
    expect(view.hasOverflow).toBe(true);
  });

  it("reveals every tag when expanded (hiddenCount resets to 0)", () => {
    const view = tagListView(TAGS, 6, true);
    expect(view.shown).toEqual(TAGS);
    expect(view.hiddenCount).toBe(0);
    expect(view.hasOverflow).toBe(true); // button still rendered (to collapse)
  });

  it("honors a custom max", () => {
    const view = tagListView(TAGS, 3, false);
    expect(view.shown).toEqual(["a", "b", "c"]);
    expect(view.hiddenCount).toBe(5);
  });

  it("defaults max to DEFAULT_TAG_MAX", () => {
    const view = tagListView(TAGS);
    expect(view.shown).toHaveLength(DEFAULT_TAG_MAX);
    expect(view.hiddenCount).toBe(TAGS.length - DEFAULT_TAG_MAX);
  });

  it("falls back to the default for a non-finite or negative max", () => {
    expect(tagListView(TAGS, Number.POSITIVE_INFINITY, false).shown).toEqual(TAGS);
    // Infinity => no overflow, everything shown.
    expect(tagListView(TAGS, Number.NaN, false).shown).toHaveLength(DEFAULT_TAG_MAX);
    expect(tagListView(TAGS, -3, false).shown).toHaveLength(DEFAULT_TAG_MAX);
  });

  it("handles an empty list", () => {
    const view = tagListView([], 6, false);
    expect(view.shown).toEqual([]);
    expect(view.hasOverflow).toBe(false);
    expect(view.hiddenCount).toBe(0);
  });

  it("does not mutate the input array", () => {
    const input = [...TAGS];
    tagListView(input, 3, false);
    tagListView(input, 3, true);
    expect(input).toEqual(TAGS);
  });
});
