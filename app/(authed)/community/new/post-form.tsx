"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconX } from "@/components/icons";
import { ASK_BODY_MAX, ASK_TAGS_MAX, ASK_TITLE_MAX } from "@/lib/ask-validate";
import { ASK_KINDS, ASK_URGENCIES, type AskKind, type AskUrgency } from "@/lib/db/asks";
import { MentionInput } from "../mention-input";
import { createAskAction, updateAskAction } from "../actions";
import {
  type ConnectTarget,
  connectInitialTitle,
  connectComposeBody,
  toggleTopic,
} from "./connect-compose";

export type { ConnectTarget };

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

// Shared create/edit form for an Community post. When `initial` is provided it
// edits that post (via updateAskAction); otherwise it creates a new one. Kind,
// title, body, expertise tags, urgency, and an optional "valid until" date.
export function PostForm({
  suggestedTags,
  initial,
  connect,
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
  // When present, the form opens as a GUIDED "connect with this person" composer:
  // pre-scoped to ask about connecting with the target (auto @-mention + their
  // topics as click-to-select chips). See ./connect-compose.
  connect?: ConnectTarget | null;
}) {
  const router = useRouter();
  const editing = Boolean(initial);
  // Connection posts are always an Ask ("I'd love to connect / need an intro").
  const [kind, setKind] = useState<AskKind>(initial?.kind ?? "ask");
  const [title, setTitle] = useState(
    initial?.title ?? (connect ? connectInitialTitle(connect) : ""),
  );
  // Connection composer starts with the target @-mentioned and no topics picked;
  // the body stays auto-managed by the topic chips until the user edits it by hand.
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [bodyTouched, setBodyTouched] = useState(false);
  const [body, setBody] = useState(
    initial?.body ?? (connect ? connectComposeBody(connect, []) : ""),
  );
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  // Set when a topic chip couldn't be selected because the expertise-tag cap was
  // hit — surfaces a small hint so the tap isn't a silent no-op.
  const [tagCapHit, setTagCapHit] = useState(false);
  const [urgency, setUrgency] = useState<AskUrgency>(initial?.urgency ?? "normal");
  const [validUntil, setValidUntil] = useState(initial?.validUntil ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Tap a topic chip: toggle it in the selection, add/remove it as an expertise
  // tag, and (while the body is still auto-managed) regenerate the pre-filled
  // message so it reads naturally with the current picks. Once the user types in
  // the body themselves we stop overwriting it.
  const onToggleTopic = (topic: string) => {
    if (!connect) return;
    const key = topic.toLowerCase();
    const isSelected = selectedTopics.some((t) => t.toLowerCase() === key);
    // Adding a NEW topic when the tag cap is already full would select the chip
    // and reshape the message but silently drop the tag — an inconsistent partial
    // action. Instead, block the selection and surface the cap hint. Removing an
    // already-selected topic (and any toggle when there's room) proceeds normally.
    if (!isSelected && tags.length >= ASK_TAGS_MAX) {
      setTagCapHit(true);
      return;
    }
    setTagCapHit(false);
    const next = toggleTopic(connect.topics, selectedTopics, topic);
    setSelectedTopics(next);
    setTags((prev) => {
      const has = prev.some((t) => t.toLowerCase() === key);
      if (has) return prev.filter((t) => t.toLowerCase() !== key);
      if (prev.length >= ASK_TAGS_MAX) return prev;
      return [...prev, topic];
    });
    if (!bodyTouched) setBody(connectComposeBody(connect, next));
  };

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
      try {
        const res = editing
          ? await updateAskAction({ id: initial!.id, ...payload })
          : await createAskAction(payload);
        if (res.ok) {
          router.push(res.id ? `/community/${res.id}` : "/community");
          router.refresh();
        } else {
          setError(res.error);
        }
      } catch {
        // A THROWN action means a transport failure (predictable errors return a
        // definite {ok:false}). Take the user to the board and refresh so they
        // can SEE whether it posted — that beats a "maybe" message.
        router.push("/community");
        router.refresh();
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
        {/* Full-width segmented control on phones (each option takes half) so the
            two labels never overflow the viewport; shrinks to fit its content at
            sm+. */}
        <div className="flex w-full overflow-hidden rounded-full border border-white/15 sm:w-fit">
          {ASK_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`flex-1 whitespace-nowrap px-3 py-2 text-xs font-medium transition-colors sm:flex-none sm:px-4 sm:text-sm ${
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

      {/* Guided connection composer: the target's OWN topics as click-to-select
          chips. Tapping one shapes the pre-filled message + adds it as a tag —
          the user picks context with taps instead of typing. */}
      {connect && connect.topics.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-white/80">
            What would you like to connect about?
          </span>
          <p className="text-xs text-white/45">
            Tap the topics that fit — they&apos;ll shape your message to {connect.name}.
          </p>
          <div className="flex flex-wrap gap-2">
            {connect.topics.map((topic) => {
              const on = selectedTopics.some((t) => t.toLowerCase() === topic.toLowerCase());
              return (
                <button
                  key={topic}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onToggleTopic(topic)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    on
                      ? "border-amber-400 bg-amber-400 font-medium text-black"
                      : "border-white/15 bg-white/[0.04] text-white/75 hover:bg-white/10"
                  }`}
                >
                  {topic}
                </button>
              );
            })}
          </div>
          {tagCapHit && (
            <p className="text-xs text-amber-200/80">
              You can tag up to {ASK_TAGS_MAX} topics — remove one to add another.
            </p>
          )}
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white/80">
          {connect ? "Your message" : "Details"}
        </span>
        {connect && (
          <p className="text-xs text-white/45">
            {connect.name} is mentioned here, so they&apos;ll be notified. Edit freely.
          </p>
        )}
        {/* MentionInput initializes its editable text from `value` ONCE (it owns
            its caret state after that). While the connection body is still auto-
            managed by the topic chips, we remount it on each pick via a changing
            key so the regenerated message shows; once the user edits by hand the
            key freezes and their text is preserved. */}
        <MentionInput
          key={connect && !bodyTouched ? `auto-${selectedTopics.join("|")}` : "manual"}
          value={body}
          onChange={(v) => {
            if (connect && !bodyTouched) setBodyTouched(true);
            setBody(v);
          }}
          maxLength={ASK_BODY_MAX}
          rows={5}
          placeholder="Give the community enough context."
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
            className={`${controlCls} w-full min-w-[10rem] flex-1 sm:w-48 sm:flex-none`}
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

      <div className="flex flex-col gap-5 sm:flex-row sm:flex-wrap">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-white/80">Urgency</span>
          <select
            value={urgency}
            onChange={(e) => setUrgency(e.target.value as AskUrgency)}
            className={`${controlCls} w-full sm:w-40`}
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
            className={`${controlCls} w-full sm:w-48`}
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
          {pending
            ? "Saving…"
            : editing
              ? "Save changes"
              : connect
                ? `Send to ${connect.name}`
                : "Post"}
        </button>
      </div>
    </form>
  );
}
