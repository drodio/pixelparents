"use client";

import Link from "next/link";
import { useState } from "react";
import { COUNTRIES } from "@/lib/country-codes";
import {
  US_STATES,
  US_COUNTRY_NAME,
  abbreviateRegion,
  abbreviateCountry,
} from "@/lib/us-states";

type Mode = "inline" | "block";

type Props = {
  initialCity: string | null;
  initialRegion: string | null;
  initialCountry: string | null;
  // Owner sees an edit affordance. In block mode that opens the inline
  // editor right under the display; in inline mode it links to /account.
  canEdit: boolean;
  // "block" (default) — full layout below the name, inline editor on edit.
  // "inline" — render as a "| City, State, Country" suffix; clicking the
  // pen routes to /account#location.
  mode?: Mode;
};

// Location line under (or alongside) the profile name. Two layouts:
//
//   block  — own row, inline edit form. Used on /profile when the user has
//            no nickname (their full name is the heading and there's space
//            to drop the location underneath) and on /account.
//   inline — appended to the fullName subtitle row when the user DOES have
//            a nickname: "Daniel R. Odio [li] | San Mateo, CA, USA". No
//            inline editor in this mode; the pen links to /account.
//
// City is free text. Country and (when country=United States) state are
// dropdowns to keep written-out values consistent across profiles. Non-US
// users can type their own state/region.
export function LocationLine({
  initialCity,
  initialRegion,
  initialCountry,
  canEdit,
  mode = "block",
}: Props) {
  const [city, setCity] = useState(initialCity ?? "");
  const [region, setRegion] = useState(initialRegion ?? "");
  const [country, setCountry] = useState(initialCountry ?? "");
  const [editing, setEditing] = useState(false);
  // Defaults to USA when the user has nothing set — so the state dropdown
  // appears straight away rather than asking the user to pick a country
  // first.
  const [draftCity, setDraftCity] = useState(city);
  const [draftRegion, setDraftRegion] = useState(region);
  const [draftCountry, setDraftCountry] = useState(country || US_COUNTRY_NAME);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Storage keeps full names (e.g. "California", "United States") to match the
  // dropdown values; display compacts to postal-style ("CA, USA") so the line
  // doesn't dominate the heading.
  const display = [city, abbreviateRegion(region), abbreviateCountry(country)]
    .filter((v): v is string => !!v && v.trim().length > 0)
    .join(", ");
  const blank = display.length === 0;

  function open() {
    setDraftCity(city);
    setDraftRegion(region);
    setDraftCountry(country || US_COUNTRY_NAME);
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setError(null);
    setEditing(false);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/location", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          city: draftCity,
          region: draftRegion,
          country: draftCountry,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? `Save failed (${res.status})`);
        return;
      }
      setCity(draftCity.trim());
      setRegion(draftRegion.trim());
      setCountry(draftCountry.trim());
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "network error");
    } finally {
      setBusy(false);
    }
  }

  // INLINE MODE: just a suffix, no inline edit.
  if (mode === "inline") {
    if (blank) {
      if (!canEdit) return null;
      return (
        <Link
          href="/account#location"
          className="text-sm text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          | + Add location
        </Link>
      );
    }
    return (
      <span className="flex items-center gap-1 text-sm text-zinc-400">
        <span aria-hidden className="text-zinc-600">|</span>
        <span>{display}</span>
        {canEdit && (
          <Link
            href="/account#location"
            aria-label="Edit location"
            title="Edit location"
            className="text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            ✎
          </Link>
        )}
      </span>
    );
  }

  // BLOCK MODE: inline edit form.
  if (editing) {
    const isUS = draftCountry === US_COUNTRY_NAME;
    return (
      <div className="flex flex-col gap-2 text-sm">
        <div className="flex flex-wrap gap-2">
          <input
            value={draftCity}
            onChange={(e) => setDraftCity(e.target.value)}
            placeholder="City"
            maxLength={80}
            className="bg-transparent border border-zinc-700 rounded px-2 py-1 text-zinc-100 focus:border-zinc-400 outline-none w-40"
          />
          {isUS ? (
            <select
              value={draftRegion}
              onChange={(e) => setDraftRegion(e.target.value)}
              className="bg-[#1c1c1c] border border-zinc-700 rounded px-2 py-1 text-zinc-100 focus:border-zinc-400 outline-none w-40"
            >
              <option value="">State…</option>
              {US_STATES.map((s) => (
                <option key={s.code} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={draftRegion}
              onChange={(e) => setDraftRegion(e.target.value)}
              placeholder="State / Region (optional)"
              maxLength={80}
              className="bg-transparent border border-zinc-700 rounded px-2 py-1 text-zinc-100 focus:border-zinc-400 outline-none w-40"
            />
          )}
          <select
            value={draftCountry}
            onChange={(e) => {
              const next = e.target.value;
              // Switching INTO the US — keep any state value if it matches a
              // known state, otherwise blank so the dropdown shows "State…".
              // Switching OUT of the US — keep whatever's there (the user
              // can edit the free-text region after).
              if (next === US_COUNTRY_NAME && !US_STATES.some((s) => s.name === draftRegion)) {
                setDraftRegion("");
              }
              setDraftCountry(next);
            }}
            className="bg-[#1c1c1c] border border-zinc-700 rounded px-2 py-1 text-zinc-100 focus:border-zinc-400 outline-none w-44"
          >
            {COUNTRIES.map((c) => (
              <option key={c.iso} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-md bg-zinc-700 hover:bg-zinc-600 text-zinc-100 text-xs font-medium px-3 py-1 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={busy}
            className="rounded-md border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-xs px-3 py-1 disabled:opacity-50"
          >
            Cancel
          </button>
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
      </div>
    );
  }

  if (blank) {
    if (!canEdit) return null;
    return (
      <button
        type="button"
        onClick={open}
        className="self-start text-sm text-zinc-500 hover:text-zinc-200 transition-colors"
      >
        + Add your location
      </button>
    );
  }

  return (
    <p className="flex items-center gap-2 text-sm text-zinc-400">
      <span>{display}</span>
      {canEdit && (
        <button
          type="button"
          onClick={open}
          aria-label="Edit location"
          title="Edit location"
          className="inline-flex items-center gap-1 rounded-md border border-zinc-700 hover:border-zinc-500 px-2 py-0.5 text-xs text-zinc-300 hover:text-zinc-100 transition-colors"
        >
          <span aria-hidden>✎</span> Edit
        </button>
      )}
    </p>
  );
}
