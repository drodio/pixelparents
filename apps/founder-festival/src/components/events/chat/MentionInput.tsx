"use client";

import { useEffect, useRef, useState } from "react";
import { serializeMentions } from "@/lib/event-chat-shared";

type Suggestion = { id: string; name: string; company: string | null };

// Textarea with an `@` autocomplete that searches all claimed members (reuses
// the leaderboard search). Shows readable "@Full Name" while tracking the picked
// member ids; reports the SERIALIZED body (with @[Name](evalId) markers) via
// onBody so the server can parse mentions.
export function MentionInput({
  onBody,
  placeholder,
  rows = 4,
  singleLine = false,
}: {
  onBody: (serialized: string) => void;
  placeholder?: string;
  rows?: number;
  // Render a one-line <input> (e.g. the thread title) instead of a textarea.
  singleLine?: boolean;
}) {
  const [text, setText] = useState("");
  const [mentions, setMentions] = useState<Array<{ name: string; evalId: string }>>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [query, setQuery] = useState<string | null>(null); // the active @token, or null
  const taRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const genRef = useRef(0);

  // Report serialized body whenever text/mentions change.
  useEffect(() => {
    onBody(serializeMentions(text, mentions));
  }, [text, mentions, onBody]);

  // Debounced member search for the active @token. When there's no active token
  // we simply don't fetch; the dropdown is gated on `query` below, so stale
  // suggestions never render (avoids a synchronous setState in this effect).
  useEffect(() => {
    if (query == null || query.length < 1) return;
    const myGen = ++genRef.current;
    const h = setTimeout(async () => {
      try {
        const res = await fetch(`/api/leaderboard/search?q=${encodeURIComponent(query)}`);
        const data = (await res.json()) as { rows?: Array<{ id: string; fullName?: string; companyName?: string | null }> };
        if (genRef.current !== myGen) return;
        setSuggestions(
          (data.rows ?? [])
            .filter((r) => r.fullName)
            .slice(0, 6)
            .map((r) => ({ id: r.id, name: r.fullName!, company: r.companyName ?? null })),
        );
      } catch {
        if (genRef.current === myGen) setSuggestions([]);
      }
    }, 200);
    return () => clearTimeout(h);
  }, [query]);

  // Find the @token immediately before the caret (letters/space, no newline).
  function activeTokenAt(value: string, caret: number): string | null {
    const upto = value.slice(0, caret);
    const m = upto.match(/(?:^|\s)@([A-Za-z][\w .'-]*)$/);
    return m ? m[1]! : null;
  }

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) {
    const value = e.target.value;
    setText(value);
    setQuery(activeTokenAt(value, e.target.selectionStart ?? value.length));
  }

  function pick(s: Suggestion) {
    const ta = taRef.current;
    if (!ta) return;
    const caret = ta.selectionStart ?? text.length;
    const before = text.slice(0, caret);
    const after = text.slice(caret);
    // Replace the trailing "@token" with "@Full Name ".
    const replaced = before.replace(/@([A-Za-z][\w .'-]*)$/, `@${s.name} `);
    const next = replaced + after;
    setText(next);
    setMentions((m) => (m.some((x) => x.evalId === s.id) ? m : [...m, { name: s.name, evalId: s.id }]));
    setQuery(null);
    setSuggestions([]);
    // Restore focus + caret after the inserted name.
    requestAnimationFrame(() => {
      ta.focus();
      const pos = replaced.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  // Segment the text so picked @mentions render gold in the overlay "mirror"
  // behind a transparent-text field (textareas can't style substrings directly).
  const segments: { t: string; gold: boolean }[] = (() => {
    if (mentions.length === 0) return [{ t: text, gold: false }];
    const names = [...new Set(mentions.map((m) => m.name))].sort((a, b) => b.length - a.length);
    const esc = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const re = new RegExp(`@(?:${esc.join("|")})`, "g");
    const out: { t: string; gold: boolean }[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push({ t: text.slice(last, m.index), gold: false });
      out.push({ t: m[0], gold: true });
      last = m.index + m[0].length;
    }
    out.push({ t: text.slice(last), gold: false });
    return out;
  })();

  function syncScroll(e: React.UIEvent<HTMLTextAreaElement | HTMLInputElement>) {
    if (mirrorRef.current) mirrorRef.current.scrollTop = e.currentTarget.scrollTop;
  }

  // Shared box model: the wrapper draws the border/bg/focus ring; the mirror and
  // the field share identical padding so the colored text lines up under the caret.
  const wrapClass = "relative w-full rounded-md border border-zinc-700 bg-zinc-900 focus-within:border-zinc-400";
  const mirrorClass = "pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-3 py-2 text-sm text-zinc-100";
  const fieldClass = "relative z-[1] w-full bg-transparent px-3 py-2 text-sm text-transparent caret-zinc-100 outline-none placeholder:text-zinc-500";

  const mirror = (
    <div ref={mirrorRef} aria-hidden className={mirrorClass}>
      {segments.map((s, i) =>
        s.gold ? (
          <span key={i} className="text-[#dfa43a]">{s.t}</span>
        ) : (
          <span key={i}>{s.t}</span>
        ),
      )}
      {"​"}
    </div>
  );

  return (
    <div className="relative">
      <div className={wrapClass}>
        {mirror}
        {singleLine ? (
          <input
            ref={taRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={text}
            onChange={onChange}
            onScroll={syncScroll}
            placeholder={placeholder ?? "Use @ to mention a member"}
            className={fieldClass}
          />
        ) : (
          <textarea
            ref={taRef as React.RefObject<HTMLTextAreaElement>}
            value={text}
            onChange={onChange}
            onScroll={syncScroll}
            placeholder={placeholder ?? "Write something… use @ to mention a member"}
            rows={rows}
            className={`${fieldClass} resize-y`}
          />
        )}
      </div>
      {query != null && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full max-w-sm overflow-hidden rounded-md border border-zinc-700 bg-zinc-900 shadow-lg">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-200 hover:bg-zinc-800"
              >
                <span className="font-medium">{s.name}</span>
                {s.company && <span className="text-xs text-zinc-500">· {s.company}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
