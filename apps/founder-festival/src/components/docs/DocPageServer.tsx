import { notFound } from "next/navigation";
import { isSuperAdmin } from "@/lib/admin";
import { getDocPage, listPendingSuggestions, renderMarkdown, renderDiffHtml } from "@/lib/docs";
import { DocPageView, type SuggestionView } from "@/components/docs/DocPageView";

// Server component shared by /docs (quickstart) and /docs/[slug]: loads the page
// + (for super-admins) pending suggestions, renders markdown → HTML, and hands
// off to the client DocPageView for the inline-edit / review affordances.
export async function DocPageServer({ slug }: { slug: string }) {
  const page = await getDocPage(slug);
  if (!page) notFound();

  const canEdit = await isSuperAdmin();
  let suggestions: SuggestionView[] = [];
  if (canEdit) {
    const pending = await listPendingSuggestions(slug);
    // Diff each proposed body against the CURRENT live body so the reviewer sees
    // exactly what would change (red = removed, green = added). Newest first.
    suggestions = pending.map((s) => ({
      id: s.id,
      rationale: s.rationale,
      createdAt: s.createdAt,
      diffHtml: renderDiffHtml(page.bodyMd, s.proposedMd),
    }));
  }

  return (
    <DocPageView
      slug={slug}
      html={renderMarkdown(page.bodyMd)}
      bodyMd={page.bodyMd}
      canEdit={canEdit}
      suggestions={suggestions}
    />
  );
}
