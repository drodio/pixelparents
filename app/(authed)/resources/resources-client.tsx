"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TagList } from "@/components/tag-list";
import { IconX, IconPlus, IconTrash, IconArrowRight } from "@/components/icons";
import {
  RESOURCE_TITLE_MAX,
  RESOURCE_NOTE_MAX,
  RESOURCE_TAGS_MAX,
  filterByTag,
} from "@/lib/resources-label";
import { createResourceAction, deleteResourceAction } from "./actions";

export type ResourceCard = {
  id: string;
  title: string;
  url: string;
  note: string | null;
  tags: string[];
  createdAt: string; // ISO
  authorName: string;
  isStudent: boolean;
  isMine: boolean;
};

const controlCls =
  "w-full rounded-md border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-amber-400/50";

// Derive the display host for a link (drops "www."). Defensive: a malformed URL
// shouldn't crash the list (the server already validated http(s), but be safe).
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function relativeDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// The full Resources surface: a "share a resource" form, a tag-filter chip strip,
// and the newest-first browsable list. Tag filtering is client-side over the
// already-loaded list (the library is small); each card shows the author's
// coarsened name + an at-a-glance tag set via the shared <TagList>.
export function ResourcesClient({
  resources,
  tagCounts,
}: {
  resources: ResourceCard[];
  tagCounts: Array<{ tag: string; count: number }>;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const filtered = useMemo(
    () => filterByTag(resources, activeTag),
    [resources, activeTag],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-white/50">
          {resources.length} {resources.length === 1 ? "resource" : "resources"} shared by the
          community
        </p>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-black transition hover:bg-amber-300"
        >
          {showForm ? <IconX className="h-4 w-4" /> : <IconPlus className="h-4 w-4" />}
          {showForm ? "Close" : "Share a resource"}
        </button>
      </div>

      {showForm && (
        <ShareForm
          onDone={() => {
            setShowForm(false);
            router.refresh();
          }}
        />
      )}

      {/* Tag filter chip strip — reuses the shared <TagList> "+N more" collapse. */}
      {tagCounts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-white/40">Filter by topic:</span>
          <button
            type="button"
            onClick={() => setActiveTag(null)}
            aria-pressed={activeTag === null}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              activeTag === null
                ? "border-amber-400/60 bg-amber-400/15 text-amber-200"
                : "border-white/15 bg-white/[0.04] text-white/60 hover:bg-white/10 hover:text-white/80"
            }`}
          >
            All
          </button>
          <TagList
            tags={tagCounts.map((t) => t.tag)}
            max={8}
            renderTag={(tag) => {
              const count = tagCounts.find((t) => t.tag === tag)?.count ?? 0;
              const active = activeTag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setActiveTag(active ? null : tag)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "border-amber-400/60 bg-amber-400/15 text-amber-200"
                      : "border-white/15 bg-white/[0.04] text-white/70 hover:bg-white/10 hover:text-white/90"
                  }`}
                >
                  {tag}
                  <span className="text-white/35">{count}</span>
                </button>
              );
            }}
          />
        </div>
      )}

      {/* The browsable list, newest-first (already ordered by the server). */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
          {resources.length === 0 ? (
            <>
              <p className="text-white/60">No resources shared yet.</p>
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-amber-300 hover:text-amber-200"
              >
                Be the first to share <IconArrowRight className="h-4 w-4" />
              </button>
            </>
          ) : (
            <p className="text-white/60">
              No resources tagged{" "}
              <span className="text-amber-200">{activeTag}</span> yet.
            </p>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((r) => (
            <ResourceListItem key={r.id} resource={r} onDeleted={() => router.refresh()} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ResourceListItem({
  resource,
  onDeleted,
}: {
  resource: ResourceCard;
  onDeleted: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const remove = () => {
    if (!confirm("Remove this resource from the library?")) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteResourceAction({ id: resource.id });
      if (res.ok) onDeleted();
      else setError(res.error);
    });
  };

  return (
    <li className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-white/20">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-base font-semibold text-white hover:text-amber-200"
          >
            {resource.title}
          </a>
          <p className="mt-0.5 truncate text-xs text-white/40">{hostOf(resource.url)}</p>
        </div>
        {resource.isMine && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            aria-label="Remove this resource"
            title="Remove this resource"
            className="shrink-0 rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-red-300 disabled:opacity-50"
          >
            <IconTrash className="h-4 w-4" />
          </button>
        )}
      </div>

      {resource.note && (
        <p className="mt-2 whitespace-pre-line text-sm text-white/65">{resource.note}</p>
      )}

      {resource.tags.length > 0 && (
        <div className="mt-3">
          <TagList tags={resource.tags} max={RESOURCE_TAGS_MAX} />
        </div>
      )}

      <p className="mt-3 text-xs text-white/40">
        Shared by <span className="text-white/60">{resource.authorName}</span>
        {resource.isStudent && <span className="text-white/40"> (student)</span>}
        {" · "}
        {relativeDate(resource.createdAt)}
      </p>

      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
    </li>
  );
}

// The "share a resource" form: title, URL, short note. Tags are auto-generated
// server-side on submit (no tag input here — the library auto-labels). The author
// may optionally add hint tags, but to keep the form simple we don't expose that
// in v1; the AI/heuristic labeler handles it.
function ShareForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await createResourceAction({ title, url, note, tags: [] });
      if (res.ok) {
        setTitle("");
        setUrl("");
        setNote("");
        onDone();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5"
    >
      <div>
        <h2 className="text-lg font-semibold">Share a resource</h2>
        <p className="mt-1 text-sm text-white/50">
          Add a link the community should learn from — we&apos;ll auto-label it with topic tags.
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white/80">Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={RESOURCE_TITLE_MAX}
          placeholder="e.g. Khan Academy — AP Calculus BC"
          className={controlCls}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white/80">Link</span>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          inputMode="url"
          placeholder="https://…"
          className={controlCls}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white/80">
          Why it&apos;s worth it <span className="font-normal text-white/45">(optional)</span>
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={RESOURCE_NOTE_MAX}
          rows={3}
          placeholder="A sentence or two on what students/parents will get out of it."
          className={controlCls}
        />
      </label>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-50"
        >
          {pending ? "Sharing…" : "Share resource"}
        </button>
        <span className="text-xs text-white/40">Topic tags are added automatically.</span>
      </div>
    </form>
  );
}
