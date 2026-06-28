import { describe, it, expect } from "vitest";
import { mentionAnchorSpec, type MentionAttrs } from "@/lib/mention-anchor";

describe("mentionAnchorSpec", () => {
  it("builds an <a class=mention data-mention-id href> spec with the label as text", () => {
    const attrs: MentionAttrs = { id: "eval-1", label: "Morgan Reyes", href: "/profile/founder/morgan-reyes" };
    expect(mentionAnchorSpec(attrs)).toEqual([
      "a",
      { class: "mention", "data-mention-id": "eval-1", href: "/profile/founder/morgan-reyes" },
      "Morgan Reyes",
    ]);
  });

  it("omits null id/href and falls back to empty label text", () => {
    expect(mentionAnchorSpec({ id: null, label: null, href: null })).toEqual(["a", { class: "mention" }, ""]);
  });
});
