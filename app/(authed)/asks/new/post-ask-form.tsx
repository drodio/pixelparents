"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconX } from "@/components/icons";
import { ASK_BODY_MAX, ASK_TAGS_MAX, ASK_TITLE_MAX } from "@/lib/ask-validate";
import { createAskAction } from "../actions";

const controlCls =
  "w-full rounded-md border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-amber-400/50";

export function PostAskForm({ suggestedTags }: { suggestedTags: string[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const addTag = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    setTags((prev) => {
      if (prev.length >= ASK_TAGS_MAX) return prev;
      if (prev.some((x) => x.toLowerCase() === t.toLowerCase())) return prev;
      return [...prev, t];
    });
    setTagInput("");
  };

  const removeTag = (t: string) =>
    setTags((prev) => prev.filter((x) => x.toLowerCase() !== t.toLowerCase()));

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await createAskAction({ title, body, tags });
      if (res.ok) {
        router.push(res.id ? `/asks/${res.id}` : "/asks");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  const remainingSuggestions = suggestedTags.filter(
    (s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()),
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex max-w-2xl flex-col gap-5"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white/80">Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={ASK_TITLE_MAX}
          placeholder="What do you need help with?"
          className={controlCls}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white/80">Details</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={ASK_BODY_MAX}
          rows={5}
          placeholder="Give the community enough context to help."
          className={controlCls}
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white/80">
          Expertise tags{" "}
          <span className="font-normal text-white/45">
            ({tags.length}/{ASK_TAGS_MAX})
          </span>
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-xs text-amber-200"
            >
              {t}
              <button
                type="button"
                onClick={() => removeTag(t)}
                aria-label={`Remove ${t}`}
                className="text-amber-200/70 hover:text-amber-100"
              >
                <IconX className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag(tagInput);
              }
            }}
            disabled={tags.length >= ASK_TAGS_MAX}
            placeholder={tags.length >= ASK_TAGS_MAX ? "Max tags added" : "Add a tag and press Enter"}
            className={`${controlCls} w-48`}
          />
        </div>
        {remainingSuggestions.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-white/40">Suggested:</span>
            {remainingSuggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => addTag(s)}
                disabled={tags.length >= ASK_TAGS_MAX}
                className="rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-xs text-white/65 transition-colors hover:bg-white/10 disabled:opacity-40"
              >
                + {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-50"
        >
          {pending ? "Posting…" : "Post ask"}
        </button>
      </div>
    </form>
  );
}
