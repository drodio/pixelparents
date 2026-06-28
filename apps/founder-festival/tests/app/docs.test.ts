import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { docPages, docPageSuggestions } from "@/db/schema";
import {
  renderMarkdown,
  renderDiffHtml,
  seedDocPage,
  getDocPage,
  updateDocPage,
  upsertSuggestion,
  listPendingSuggestions,
  pendingSuggestionCount,
  publishSuggestion,
  discardSuggestion,
} from "@/lib/docs";
import { IS_PROD_DB } from "../setup";

const rnd = () => Math.random().toString(36).slice(2, 8);

describe("renderMarkdown (pure)", () => {
  it("renders headings, lists, and links to HTML", () => {
    const html = renderMarkdown("# Hi\n\n- a\n- b\n\n[x](/docs/profiles)");
    expect(html).toContain("<h1");
    expect(html).toContain("<li>a</li>");
    expect(html).toContain('href="/docs/profiles"');
  });

  it("gives section headings (h2+) an id, data-section, and a copy-link anchor", () => {
    const html = renderMarkdown("## Connecting with attendees\n\nbody");
    expect(html).toContain('id="connecting-with-attendees"');
    expect(html).toContain('data-section="Connecting with attendees"');
    expect(html).toContain('class="section-anchor"');
    // spaces encoded as "+" so the link reads ?section=Connecting+with+attendees
    expect(html).toContain("?section=Connecting+with+attendees");
  });

  it("leaves the h1 page title plain (no self-anchor)", () => {
    const html = renderMarkdown("# Events");
    expect(html).toContain("<h1>Events</h1>");
    expect(html).not.toContain("section-anchor");
  });

  it("de-duplicates ids when two headings slugify the same", () => {
    const html = renderMarkdown("## Notes\n\na\n\n## Notes\n\nb");
    expect(html).toContain('id="notes"');
    expect(html).toContain('id="notes-2"');
  });
});

describe("renderDiffHtml (pure)", () => {
  it("marks removed text red and added text green, escaping HTML", () => {
    const html = renderDiffHtml("the quick brown fox", "the slow brown fox");
    expect(html).toContain('<span class="diff-del">quick</span>');
    expect(html).toContain('<span class="diff-add">slow</span>');
    expect(html).toContain("brown fox"); // unchanged stays plain
  });
  it("escapes angle brackets in the diff", () => {
    const html = renderDiffHtml("a", "a <script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe.skipIf(IS_PROD_DB)("docs lib (db)", () => {
  it("seeds, no-clobbers a human edit, and publishes/discards suggestions", { timeout: 30000 }, async () => {
    const slug = `t-${rnd()}`;
    // seed
    expect(await seedDocPage({ slug, title: "T", emoji: "🧪", navOrder: 9, bodyMd: "# seed v1" })).toBe(true);
    expect((await getDocPage(slug))!.bodyMd).toBe("# seed v1");

    // re-seed (still seed-owned) overwrites
    expect(await seedDocPage({ slug, title: "T", emoji: "🧪", navOrder: 9, bodyMd: "# seed v2" })).toBe(true);
    expect((await getDocPage(slug))!.bodyMd).toBe("# seed v2");

    // a human edit, then re-seed must NOT clobber it
    await updateDocPage(slug, "# human edit", "user_123");
    expect(await seedDocPage({ slug, title: "T", emoji: "🧪", navOrder: 9, bodyMd: "# seed v3" })).toBe(false);
    const afterReseed = await getDocPage(slug);
    expect(afterReseed!.bodyMd).toBe("# human edit");
    expect(afterReseed!.updatedBy).toBe("user_123");

    // suggestion publish copies proposed_md into the live body
    await upsertSuggestion({ slug, proposedMd: "# proposed", rationale: "why", sourceCommit: `c-${rnd()}` });
    // duplicate (same slug+commit) is a no-op
    const firstCommit = (await listPendingSuggestions(slug))[0]!;
    await upsertSuggestion({ slug, proposedMd: "# dupe", rationale: "x", sourceCommit: firstCommit.sourceCommit });
    expect(await pendingSuggestionCount(slug)).toBe(1);

    expect(await publishSuggestion(firstCommit.id)).toBe(true);
    expect((await getDocPage(slug))!.bodyMd).toBe("# proposed");
    expect((await getDocPage(slug))!.updatedBy).toBe("suggestion");
    expect(await pendingSuggestionCount(slug)).toBe(0);
    // re-publishing a non-pending suggestion fails
    expect(await publishSuggestion(firstCommit.id)).toBe(false);

    // discard flips a pending suggestion to discarded (and only then)
    await upsertSuggestion({ slug, proposedMd: "# p2", rationale: "y", sourceCommit: `c-${rnd()}` });
    const second = (await listPendingSuggestions(slug))[0]!;
    expect(await discardSuggestion(second.id)).toBe(true);
    expect(await discardSuggestion(second.id)).toBe(false);
    expect(await pendingSuggestionCount(slug)).toBe(0);

    // cleanup
    await db.delete(docPageSuggestions).where(eq(docPageSuggestions.slug, slug));
    await db.delete(docPages).where(eq(docPages.slug, slug));
  });
});
