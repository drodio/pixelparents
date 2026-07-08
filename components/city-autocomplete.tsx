"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CITIES, type City } from "@/lib/cities";

// Keyless, privacy-preserving city autocomplete. Matching runs ENTIRELY in the
// browser against the bundled lib/cities.ts list — no keystroke ever leaves the
// page and no external geocoding API is called. Free text is always allowed: the
// field is a plain controlled input; suggestions are an optional convenience that,
// when picked, also report the city's country (and US state) so the parent form
// can auto-fill those fields. The parent stays the source of truth for `value`.

// Highlights the typed portion of a suggestion in gold (mirrors the TagPicker
// idiom in app/signup/thanks/family-form.tsx).
function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <span className="text-amber-400">{text.slice(i, i + query.length)}</span>
      {text.slice(i + query.length)}
    </>
  );
}

const MAX_SUGGESTIONS = 8;

// Rank matches: prefix matches first (a user typing "san" wants "San …" before
// "…san…"), then substring matches, each group alphabetical. Case-insensitive.
function matchCities(query: string): City[] {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];
  const prefix: City[] = [];
  const substring: City[] = [];
  for (const c of CITIES) {
    const name = c.name.toLowerCase();
    if (name.startsWith(q)) prefix.push(c);
    else if (name.includes(q)) substring.push(c);
    if (prefix.length >= MAX_SUGGESTIONS) break;
  }
  const out = prefix.slice(0, MAX_SUGGESTIONS);
  if (out.length < MAX_SUGGESTIONS) {
    out.push(...substring.slice(0, MAX_SUGGESTIONS - out.length));
  }
  return out;
}

export function CityAutocomplete({
  id,
  value,
  onCityChange,
  onSelect,
  inputClassName,
  autoComplete = "address-level2",
  placeholder,
}: {
  id?: string;
  value: string;
  // Free-text change (typing). Country/state are left untouched.
  onCityChange: (city: string) => void;
  // A suggestion was picked — fill city AND (via the parent) country + optional
  // US state to match.
  onSelect: (picked: City) => void;
  inputClassName: string;
  autoComplete?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // Suppress reopening the list immediately after a pick (the pick sets `value`,
  // which would otherwise recompute matches and pop the menu back open).
  const justPicked = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const matches = useMemo(() => (open ? matchCities(value) : []), [open, value]);

  // Close on outside click / focus loss.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function pick(c: City) {
    justPicked.current = true;
    onSelect(c);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (!open || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? matches.length - 1 : a - 1));
    } else if (e.key === "Enter") {
      // Only intercept Enter when a suggestion is highlighted — otherwise let the
      // keystroke behave normally (free-text entry stays intact).
      if (active >= 0 && active < matches.length) {
        e.preventDefault();
        pick(matches[active]!);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        id={id}
        value={value}
        onChange={(e) => {
          if (justPicked.current) {
            justPicked.current = false;
          }
          onCityChange(e.target.value);
          setOpen(true);
          // Reset highlight as the match set changes with each keystroke.
          setActive(-1);
        }}
        onFocus={() => {
          if (!justPicked.current) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className={inputClassName}
        autoComplete={autoComplete}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          active >= 0 && matches[active]
            ? `${listboxId}-opt-${active}`
            : undefined
        }
      />
      {open && matches.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-white/15 bg-neutral-900 py-1 shadow-2xl"
        >
          {matches.map((c, i) => {
            const secondary =
              c.country === "United States" && c.state
                ? `${c.state}, USA`
                : c.country;
            return (
              <li
                key={`${c.name}-${c.country}-${c.state ?? ""}`}
                id={`${listboxId}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                // onMouseDown (not onClick) so the pick fires before the input's
                // blur/outside-click closes the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(c);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-1.5 text-sm ${
                  i === active ? "bg-white/10 text-white" : "text-white/80"
                }`}
              >
                <span>
                  <HighlightedText text={c.name} query={value} />
                </span>
                <span className="shrink-0 text-xs text-white/40">{secondary}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
