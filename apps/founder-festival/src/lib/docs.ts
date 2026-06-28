import { and, asc, desc, eq, sql } from "drizzle-orm";
import { Marked, type Tokens } from "marked";
import { diffWords } from "diff";
import { db } from "@/db";
import { docPages, docPageSuggestions } from "@/db/schema";
import { slugifyHeading, sectionParam } from "@/lib/section-anchors";

// All reads/writes for the /docs section + the markdown renderer. Content is
// super-admin-authored (seed files + super-admin-published suggestions), so it's
// trusted; we render it to HTML with marked and the page injects it directly.

export type DocPage = {
  id: string;
  slug: string;
  title: string;
  emoji: string;
  navOrder: number;
  bodyMd: string;
  updatedAt: string; // ISO
  updatedBy: string;
};

export type DocSuggestion = {
  id: string;
  slug: string;
  proposedMd: string;
  rationale: string;
  sourceCommit: string;
  status: string;
  createdAt: string; // ISO
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Feather "link" icon (matches the react-icons set used in the docs nav).
const LINK_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';

// Per-render slug counts so repeated headings get unique ids (e.g. two "Notes"
// → "notes", "notes-2"). Set at the start of each renderMarkdown call; parsing
// is synchronous (async:false), so a module-level value is safe.
let slugCounts: Map<string, number> | null = null;
function uniqueHeadingId(label: string): string {
  const base = slugifyHeading(label) || "section";
  const counts = (slugCounts ??= new Map());
  const n = (counts.get(base) ?? 0) + 1;
  counts.set(base, n);
  return n === 1 ? base : `${base}-${n}`;
}

// Dedicated Marked instance: every section heading (h2+) gets an id + a hover
// "copy link to this section" anchor pointing at ?section=<label>. The h1 page
// title is left plain (no self-anchor). Client behavior (copy + scroll) lives in
// DocPageView. Content is super-admin-authored and trusted, so direct injection.
const docsMarked = new Marked({ gfm: true, async: false });
docsMarked.use({
  renderer: {
    heading(token: Tokens.Heading): string {
      const inner = this.parser.parseInline(token.tokens);
      const depth = token.depth;
      if (depth === 1) return `<h1>${inner}</h1>\n`;
      const label = token.text.trim();
      const attr = escapeHtml(label);
      return (
        `<h${depth} id="${uniqueHeadingId(label)}" data-section="${attr}" class="section-h">${inner}` +
        `<a class="section-anchor" href="?section=${sectionParam(label)}" data-section="${attr}"` +
        ` aria-label="Copy link to “${attr}”">${LINK_ICON}</a></h${depth}>\n`
      );
    },
  },
});

// GFM markdown → HTML. Synchronous (no plugins that defer). Trusted content.
export function renderMarkdown(md: string): string {
  slugCounts = new Map();
  try {
    return docsMarked.parse(md ?? "") as string;
  } finally {
    slugCounts = null;
  }
}

// Word-level diff of two markdown bodies → HTML. Removed runs get a red
// background (struck through); added runs a green background, placed right after
// the text they replace. Unchanged text renders plain. Render inside a
// white-space: pre-wrap container so newlines in the source show as line breaks.
export function renderDiffHtml(oldMd: string, newMd: string): string {
  const parts = diffWords(oldMd ?? "", newMd ?? "");
  return parts
    .map((p) => {
      const safe = escapeHtml(p.value);
      if (p.added) return `<span class="diff-add">${safe}</span>`;
      if (p.removed) return `<span class="diff-del">${safe}</span>`;
      return safe;
    })
    .join("");
}

function toDocPage(r: typeof docPages.$inferSelect): DocPage {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    emoji: r.emoji,
    navOrder: r.navOrder,
    bodyMd: r.bodyMd,
    updatedAt: r.updatedAt.toISOString(),
    updatedBy: r.updatedBy,
  };
}

export async function getDocPage(slug: string): Promise<DocPage | null> {
  const [row] = await db.select().from(docPages).where(eq(docPages.slug, slug)).limit(1);
  return row ? toDocPage(row) : null;
}

export async function listDocPages(): Promise<DocPage[]> {
  const rows = await db.select().from(docPages).orderBy(asc(docPages.navOrder));
  return rows.map(toDocPage);
}

// Upsert a page from its seed file ONLY IF it's absent or still seed-owned — a
// human (or published-suggestion) edit is never clobbered. Returns true if it
// wrote, false if it left an existing human edit alone.
export async function seedDocPage(args: {
  slug: string;
  title: string;
  emoji: string;
  navOrder: number;
  bodyMd: string;
}): Promise<boolean> {
  const existing = await getDocPage(args.slug);
  if (existing && existing.updatedBy !== "seed") return false; // human/suggestion edit — leave it
  await db
    .insert(docPages)
    .values({
      slug: args.slug,
      title: args.title,
      emoji: args.emoji,
      navOrder: args.navOrder,
      bodyMd: args.bodyMd,
      updatedBy: "seed",
    })
    .onConflictDoUpdate({
      target: docPages.slug,
      set: {
        title: args.title,
        emoji: args.emoji,
        navOrder: args.navOrder,
        bodyMd: args.bodyMd,
        updatedAt: sql`now()`,
        updatedBy: "seed",
      },
    });
  return true;
}

export async function updateDocPage(slug: string, bodyMd: string, updatedBy: string): Promise<boolean> {
  const rows = await db
    .update(docPages)
    .set({ bodyMd, updatedAt: sql`now()`, updatedBy })
    .where(eq(docPages.slug, slug))
    .returning({ id: docPages.id });
  return rows.length > 0;
}

// ── Suggestions ──────────────────────────────────────────────────────────────
function toSuggestion(r: typeof docPageSuggestions.$inferSelect): DocSuggestion {
  return {
    id: r.id,
    slug: r.slug,
    proposedMd: r.proposedMd,
    rationale: r.rationale,
    sourceCommit: r.sourceCommit,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function pendingSuggestionCount(slug: string): Promise<number> {
  const rows = await db
    .select({ id: docPageSuggestions.id })
    .from(docPageSuggestions)
    .where(and(eq(docPageSuggestions.slug, slug), eq(docPageSuggestions.status, "pending")));
  return rows.length;
}

export async function listPendingSuggestions(slug: string): Promise<DocSuggestion[]> {
  const rows = await db
    .select()
    .from(docPageSuggestions)
    .where(and(eq(docPageSuggestions.slug, slug), eq(docPageSuggestions.status, "pending")))
    .orderBy(desc(docPageSuggestions.createdAt)); // most recent first
  return rows.map(toSuggestion);
}

// Insert a pending suggestion; no-op if one already exists for (slug, commit).
export async function upsertSuggestion(args: {
  slug: string;
  proposedMd: string;
  rationale: string;
  sourceCommit: string;
}): Promise<void> {
  await db
    .insert(docPageSuggestions)
    .values({
      slug: args.slug,
      proposedMd: args.proposedMd,
      rationale: args.rationale,
      sourceCommit: args.sourceCommit,
      status: "pending",
    })
    .onConflictDoNothing({ target: [docPageSuggestions.slug, docPageSuggestions.sourceCommit] });
}

// Publish: copy proposed_md into the live page, mark the suggestion published.
// Returns false if the suggestion is missing or not pending.
export async function publishSuggestion(id: string): Promise<boolean> {
  const [s] = await db.select().from(docPageSuggestions).where(eq(docPageSuggestions.id, id)).limit(1);
  if (!s || s.status !== "pending") return false;
  await updateDocPage(s.slug, s.proposedMd, "suggestion");
  await db
    .update(docPageSuggestions)
    .set({ status: "published", resolvedAt: sql`now()` })
    .where(eq(docPageSuggestions.id, id));
  return true;
}

export async function discardSuggestion(id: string): Promise<boolean> {
  const rows = await db
    .update(docPageSuggestions)
    .set({ status: "discarded", resolvedAt: sql`now()` })
    .where(and(eq(docPageSuggestions.id, id), eq(docPageSuggestions.status, "pending")))
    .returning({ id: docPageSuggestions.id });
  return rows.length > 0;
}
