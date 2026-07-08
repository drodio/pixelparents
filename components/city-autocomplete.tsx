"use client";

import { useEffect, useId, useRef, useState } from "react";
import { COUNTRIES, US_STATES } from "@/lib/options";
import type { City } from "@/lib/cities";

// City autocomplete backed by Photon (https://photon.komoot.io), the keyless,
// OpenStreetMap-based geocoder — so it covers ANY city worldwide, not a bundled
// list. It's keyless (no token, no billing); we debounce and only send a short
// city PREFIX (not sensitive PII) once the user has typed ≥2 chars. Free text is
// always allowed: the field is a plain controlled input and suggestions are an
// optional convenience that, when picked, also report the city's country (and US
// state) so the parent form can auto-fill those selects. The parent stays the
// source of truth for `value`. If the network/API is unavailable the field simply
// behaves as a normal text input.

const MAX_SUGGESTIONS = 8;
const MIN_QUERY = 2;
const DEBOUNCE_MS = 280;

// Photon returns English country names (lang=en); fold the few that differ from
// our COUNTRIES list onto the canonical spelling so the country <select> auto-fills.
const COUNTRY_ALIASES: Record<string, string> = {
  "united states of america": "United States",
  usa: "United States",
  "u.s.a.": "United States",
  "united states": "United States",
};

function normalizeCountry(raw: string): string {
  const key = raw.trim().toLowerCase();
  const aliased = COUNTRY_ALIASES[key] ?? key;
  return COUNTRIES.find((c) => c.toLowerCase() === aliased) ?? raw.trim();
}

// Photon returns full US state names ("California"), matching US_STATES. Only
// return one when it's an exact option so the state <select> can adopt it.
function normalizeUsState(raw: string): string | undefined {
  const key = raw.trim().toLowerCase();
  return US_STATES.find((s) => s.toLowerCase() === key);
}

// Query Photon for populated places matching `q`. Maps each feature to a City with
// the app's canonical country/state. Dedupes name+country+state. Throws on abort or
// a bad response (the caller ignores aborts + degrades to no suggestions).
async function fetchCities(q: string, signal: AbortSignal): Promise<City[]> {
  const url =
    "https://photon.komoot.io/api/?" +
    new URLSearchParams({ q, lang: "en", limit: "12", layer: "city" }).toString();
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`photon ${res.status}`);
  const data = (await res.json()) as {
    features?: Array<{ properties?: Record<string, unknown> }>;
  };
  const seen = new Set<string>();
  const out: City[] = [];
  for (const f of data.features ?? []) {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const name = typeof p.name === "string" ? p.name.trim() : "";
    if (!name) continue;
    const country = normalizeCountry(typeof p.country === "string" ? p.country : "");
    const state =
      country === "United States" && typeof p.state === "string"
        ? normalizeUsState(p.state)
        : undefined;
    const key = `${name.toLowerCase()}|${country.toLowerCase()}|${(state ?? "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, country, state });
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}

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
  const [matches, setMatches] = useState<City[]>([]);
  const [loading, setLoading] = useState(false);
  // Suppress a fetch/reopen immediately after a pick (the pick sets `value`, which
  // would otherwise refetch and pop the menu back open).
  const justPicked = useRef(false);
  // Monotonic request id so a slow earlier response can't overwrite a newer one.
  const seqRef = useRef(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const q = value.trim();

  // Debounced Photon lookup on every value change (skipped right after a pick).
  // All state changes happen INSIDE the async callback (never synchronously in the
  // effect body) — the menu is gated on `q.length >= MIN_QUERY` (see `showMenu`),
  // so we don't need to synchronously clear stale matches when the query shortens.
  useEffect(() => {
    if (justPicked.current) {
      justPicked.current = false;
      return;
    }
    if (q.length < MIN_QUERY) return;
    const controller = new AbortController();
    const seq = ++seqRef.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await fetchCities(q, controller.signal);
        if (seq === seqRef.current) {
          setMatches(results);
          setLoading(false);
        }
      } catch (err) {
        // Ignore aborts (a newer keystroke superseded this one); on any other
        // failure just show no suggestions — free-text entry still works.
        if ((err as Error)?.name !== "AbortError" && seq === seqRef.current) {
          setMatches([]);
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  // Close on outside click.
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

  const showMenu = open && q.length >= MIN_QUERY && (loading || matches.length > 0);

  return (
    <div ref={wrapRef} className="relative">
      <input
        id={id}
        value={value}
        onChange={(e) => {
          onCityChange(e.target.value);
          setOpen(true);
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
          active >= 0 && matches[active] ? `${listboxId}-opt-${active}` : undefined
        }
      />
      {showMenu && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-white/15 bg-neutral-900 py-1 shadow-2xl"
        >
          {matches.map((c, i) => {
            const secondary =
              c.country === "United States" && c.state ? `${c.state}, USA` : c.country;
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
                {secondary && (
                  <span className="shrink-0 text-xs text-white/40">{secondary}</span>
                )}
              </li>
            );
          })}
          {loading && matches.length === 0 && (
            <li className="px-3 py-1.5 text-sm text-white/40" aria-hidden>
              Searching…
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
