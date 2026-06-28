import { getChangelogEntries } from "@/lib/changelog";
import { buildChangelogEmail, changelogItemUrl } from "@/lib/changelog-email";

// Dev/preview-only: renders the exact email a subscriber receives for a given
// entry (defaults to the latest). Visit /changelog/email-preview?slug=<slug>.
export const dynamic = "force-dynamic";

export default async function EmailPreview({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>;
}) {
  const { slug } = await searchParams;
  const entries = await getChangelogEntries();
  const entry = (slug && entries.find((e) => e.slug === slug)) || entries[0];

  if (!entry) {
    return <main className="min-h-screen bg-[#0f0f0f] p-10 text-zinc-300">No changelog entries yet.</main>;
  }

  const { subject, html } = buildChangelogEmail(entry);

  return (
    <main className="min-h-screen bg-[#0f0f0f] p-6 text-zinc-300">
      <div className="mx-auto max-w-xl">
        <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">
          Email preview — what subscribers receive when this entry ships
        </p>
        <p className="mb-1 text-sm">
          <span className="text-zinc-500">Subject:</span> {subject}
        </p>
        <p className="mb-4 break-all text-xs text-zinc-600">
          Deep-link in the button → {changelogItemUrl(entry.slug)}
        </p>
        <iframe
          title="Changelog email preview"
          srcDoc={html}
          className="w-full rounded-xl border border-zinc-800"
          style={{ height: 680, background: "#0f0f0f" }}
        />
      </div>
    </main>
  );
}
