"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconX } from "@/components/icons";
import { ASK_BODY_MAX, ASK_TAGS_MAX, ASK_TITLE_MAX } from "@/lib/ask-validate";
import { ASK_KINDS, ASK_URGENCIES, type AskKind, type AskUrgency } from "@/lib/db/asks";
import { createAskAction, updateAskAction } from "../actions";

const controlCls =
  "w-full rounded-md border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-amber-400/50";

const KIND_LABEL: Record<AskKind, string> = {
  ask: "Ask — I need help",
  offer: "Offer — I can help",
};

const URGENCY_LABEL: Record<AskUrgency, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
};

// Shared create/edit form for an Exchange post. When `initial` is provided it
// edits that post (via updateAskAction); otherwise it creates a new one. Kind,
// title, body, expertise tags, urgency, and an optional "valid until" date.
export function PostForm({
  suggestedTags,
  initial,
}: {
  suggestedTags: string[];
  initial?: {
    id: string;
    kind: AskKind;
    title: string;
    body: string;
    tags: string[];
    urgency: AskUrgency;
    validUntil: string | null; // YYYY-MM-DD for the date input
  };
}) {
  const router = useRouter();
  const editing = Boolean(initial);
  const [kind, setKind] = useState<AskKind>(initial?.kind ?? "ask");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [urgency, setUrgency] = useState<AskUrgency>(initial?.urgency ?? "normal");
  const [validUntil, setValidUntil] = useState(initial?.validUntil ?? "");
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
      const payload = {
        kind,
        title,
        body,
        tags,
        urgency,
        validUntil: validUntil || null,
      };
      const res = editing
        ? await updateAskAction({ id: initial!.id, ...payload })
        : await createAskAction(payload);
      if (res.ok) {
        router.push(res.id ? `/exchange/${res.id}` : "/exchange");
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
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white/80">What kind of post?</span>
        <div className="inline-flex w-fit overflow-hidden rounded-full border border-white/15">
          {ASK_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                kind === k ? "bg-amber-400 text-black" : "text-white/65 hover:bg-white/10"
              }`}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white/80">Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={ASK_TITLE_MAX}
          placeholder={kind === "offer" ? "What can you help with?" : "What do you need help with?"}
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
          placeholder="Give the community enough context."
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

      <div className="flex flex-wrap gap-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-white/80">Urgency</span>
          <select
            value={urgency}
            onChange={(e) => setUrgency(e.target.value as AskUrgency)}
            className={`${controlCls} w-40`}
          >
            {ASK_URGENCIES.map((u) => (
              <option key={u} value={u}>
                {URGENCY_LABEL[u]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-white/80">
            Valid until <span className="font-normal text-white/45">(optional)</span>
          </span>
          <input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className={`${controlCls} w-48`}
          />
        </label>
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-50"
        >
          {pending ? "Saving…" : editing ? "Save changes" : "Post"}
        </button>
      </div>
    </form>
  );
}
