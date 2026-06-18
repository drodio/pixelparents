"use client";

import { useRef, useState } from "react";
import { renderCaption, serializeMention } from "@/lib/mentions";

export type MentionCandidate = { id: string; name: string };

// Convert stored markers -> readable display text ("@Name") + the mentions used.
function fromMarkers(markers: string): { text: string; mentions: MentionCandidate[] } {
  let text = "";
  const mentions: MentionCandidate[] = [];
  for (const s of renderCaption(markers)) {
    if (s.kind === "text") text += s.text;
    else {
      text += `@${s.name}`;
      mentions.push({ id: s.id, name: s.name });
    }
  }
  return { text, mentions };
}

// Convert display text back to markers, using the picked mentions. Longest names
// first so "@Sam Lee" isn't half-matched by "@Sam". Mentions whose "@Name" no
// longer appears simply produce no marker (i.e. they were deleted).
function toMarkers(text: string, mentions: MentionCandidate[]): string {
  let out = text;
  for (const m of [...mentions].sort((a, b) => b.name.length - a.name.length)) {
    out = out.split(`@${m.name}`).join(serializeMention(m.name, m.id));
  }
  return out;
}

// A textarea where typing "@" suggests people (the family's children). Picking
// one inserts a readable "@Name"; on every edit we re-serialize to markers and
// call onChange. No rich-text dependency.
export function MentionCaptionInput({
  value,
  onChange,
  candidates,
  placeholder,
  className,
}: {
  value: string;
  onChange: (markers: string) => void;
  candidates: MentionCandidate[];
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const initial = fromMarkers(value);
  const [text, setText] = useState(initial.text);
  const [mentions, setMentions] = useState<MentionCandidate[]>(initial.mentions);
  const [token, setToken] = useState<string | null>(null);

  function activeTokenAt(val: string, caret: number): string | null {
    const upto = val.slice(0, caret);
    const m = upto.match(/(?:^|\s)@([^@\s]*)$/);
    return m ? m[1]! : null;
  }

  function update(nextText: string, nextMentions: MentionCandidate[]) {
    setText(nextText);
    setMentions(nextMentions);
    onChange(toMarkers(nextText, nextMentions));
  }

  function onInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    update(next, mentions);
    setToken(activeTokenAt(next, e.target.selectionStart ?? next.length));
  }

  function pick(c: MentionCandidate) {
    const el = ref.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([^@\s]*)$/, `@${c.name} `);
    const after = text.slice(caret);
    const nextText = before + after;
    const nextMentions = mentions.some((m) => m.id === c.id) ? mentions : [...mentions, c];
    update(nextText, nextMentions);
    setToken(null);
    // restore focus after the inserted name
    requestAnimationFrame(() => {
      el?.focus();
      const pos = before.length;
      el?.setSelectionRange(pos, pos);
    });
  }

  const matches =
    token === null
      ? []
      : candidates
          .filter((c) => c.name.toLowerCase().includes(token.toLowerCase()))
          .slice(0, 8);

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={text}
        onChange={onInput}
        onKeyDown={(e) => {
          // While the @-suggestion list is open, Enter/Tab picks the top match.
          if (token !== null && matches.length > 0 && (e.key === "Enter" || e.key === "Tab")) {
            e.preventDefault();
            pick(matches[0]);
          }
        }}
        onBlur={() => setTimeout(() => setToken(null), 120)}
        rows={2}
        placeholder={placeholder ?? "Add a caption — type @ to tag a child"}
        className={
          className ??
          "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/40"
        }
      />
      {token !== null && matches.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-48 w-full max-w-xs overflow-auto rounded-md border border-white/15 bg-zinc-900 py-1 text-sm shadow-lg">
          {matches.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(c);
                }}
                className="block w-full px-3 py-1.5 text-left text-white/80 hover:bg-white/10"
              >
                @{c.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {candidates.length === 0 && (
        <p className="mt-1 text-xs text-white/40">
          Add a child first to tag them in photos.
        </p>
      )}
    </div>
  );
}
