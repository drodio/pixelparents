"use client";

import { useRef, useState } from "react";
import { renderCaption, serializeMention } from "@/lib/mentions";
import { searchMentionMembersAction } from "./actions";

// Picked mention: the member's signup id + the coarsened display name shown.
export type PickedMention = { id: string; name: string };

// A mention-aware textarea for the Community board (post bodies + responses).
// Mirrors the async member-search autocomplete from events/[id]/admin-manager.tsx
// (debounced server query of VERIFIED members) AND the marker (@[Name](id))
// serialization from components/mention-caption-input.tsx — but where the caption
// input picks from a static family-children list, this one searches all
// mentionable members live as you type after an "@". The stored value is the same
// inline-marker string (`onChange(markers)`); the server re-resolves + authorizes
// every marker, so this is just an input affordance. On-theme dark/amber.

// Stored markers -> readable display text ("@Name") + the mentions used.
function fromMarkers(markers: string): { text: string; mentions: PickedMention[] } {
  let text = "";
  const mentions: PickedMention[] = [];
  for (const s of renderCaption(markers)) {
    if (s.kind === "text") text += s.text;
    else {
      text += `@${s.name}`;
      mentions.push({ id: s.id, name: s.name });
    }
  }
  return { text, mentions };
}

// Display text -> markers, using the picked mentions. Longest names first so
// "@Sam Lee" isn't half-matched by "@Sam". A mention whose "@Name" no longer
// appears in the text simply produces no marker (it was edited away).
function toMarkers(text: string, mentions: PickedMention[]): string {
  let out = text;
  for (const m of [...mentions].sort((a, b) => b.name.length - a.name.length)) {
    out = out.split(`@${m.name}`).join(serializeMention(m.name, m.id));
  }
  return out;
}

type Suggestion = { signupId: string; name: string; isStudent: boolean };

export function MentionInput({
  value,
  onChange,
  rows = 5,
  maxLength,
  placeholder,
  className,
}: {
  value: string;
  onChange: (markers: string) => void;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initial = fromMarkers(value);
  const [text, setText] = useState(initial.text);
  const [mentions, setMentions] = useState<PickedMention[]>(initial.mentions);
  // The active "@token" being typed (null when not in a mention), its caret, and
  // the live suggestions.
  const [token, setToken] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const controlCls =
    className ??
    "w-full rounded-md border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-amber-400/50";

  function commit(nextText: string, nextMentions: PickedMention[]) {
    setText(nextText);
    setMentions(nextMentions);
    onChange(toMarkers(nextText, nextMentions));
  }

  // The "@word" immediately before the caret, or null. Allows a single space so
  // "@Jane D" can match a full name mid-type; bails on a second space.
  function activeTokenAt(val: string, caret: number): string | null {
    const upto = val.slice(0, caret);
    const m = upto.match(/(?:^|\s)@([^@\n]{0,40})$/);
    if (!m) return null;
    const t = m[1] ?? "";
    if ((t.match(/\s/g)?.length ?? 0) > 1) return null;
    return t;
  }

  function runSearch(q: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 1) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const res = await searchMentionMembersAction({ query: q });
      if (res.ok) {
        // Don't re-suggest someone already mentioned in this draft.
        const have = new Set(mentions.map((m) => m.id));
        setSuggestions(
          res.results
            .filter((r) => !have.has(r.signupId))
            .map((r) => ({ signupId: r.signupId, name: r.name, isStudent: r.isStudent })),
        );
      }
    }, 200);
  }

  function onInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    commit(next, mentions);
    const tok = activeTokenAt(next, e.target.selectionStart ?? next.length);
    setToken(tok);
    if (tok !== null) runSearch(tok);
    else setSuggestions([]);
  }

  function pick(s: Suggestion) {
    const el = ref.current;
    const caret = el?.selectionStart ?? text.length;
    // Replace the trailing "@token" with "@Name " and record the mention.
    const before = text.slice(0, caret).replace(/@([^@\n]{0,40})$/, `@${s.name} `);
    const after = text.slice(caret);
    const nextText = before + after;
    const nextMentions = mentions.some((m) => m.id === s.signupId)
      ? mentions
      : [...mentions, { id: s.signupId, name: s.name }];
    commit(nextText, nextMentions);
    setToken(null);
    setSuggestions([]);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = before.length;
      el?.setSelectionRange(pos, pos);
    });
  }

  const open = token !== null && suggestions.length > 0;

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={text}
        onChange={onInput}
        onKeyDown={(e) => {
          if (open && (e.key === "Enter" || e.key === "Tab")) {
            e.preventDefault();
            pick(suggestions[0]);
          } else if (e.key === "Escape" && token !== null) {
            setToken(null);
            setSuggestions([]);
          }
        }}
        onBlur={() => setTimeout(() => setToken(null), 150)}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        className={controlCls}
      />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full max-w-xs overflow-auto rounded-xl border border-white/10 bg-zinc-900 p-1 text-sm shadow-xl shadow-black/40">
          {suggestions.map((s) => (
            <li key={s.signupId}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-white/80 transition hover:bg-white/5"
              >
                <span className="grid h-6 w-6 place-items-center rounded-full bg-amber-400/20 text-xs font-semibold text-amber-300">
                  {s.name.charAt(0).toUpperCase()}
                </span>
                {s.name}
                {s.isStudent && <span className="text-xs text-white/40">· student</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-[11px] text-white/35">
        Type <span className="text-white/55">@</span> to mention a member.
      </p>
    </div>
  );
}
