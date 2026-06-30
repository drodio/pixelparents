"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { iconForInterest } from "@/lib/interest-icons";
import { IconX } from "@/components/icons";
import {
  familyMatchesAgeRange,
  familyWithinRadius,
  geocodeLocation,
} from "@/lib/directory-filters";
import type { LatLng } from "@/lib/data/us-geo";
import type { DirectoryCard } from "@/lib/directory";

export type { DirectoryCard };

type SortKey = "name" | "child";
type SortDir = "asc" | "desc";

// Age slider bounds. AGE_MAX is rendered as "18+" — a family with any shown
// child AGE_MAX or older matches the top of the range.
const AGE_MIN = 1;
const AGE_MAX = 18;

// Radius slider stops (miles). The final stop means "no limit" (Worldwide).
const RADIUS_STOPS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, Infinity];
const DEFAULT_RADIUS_IDX = 2; // 10 miles

function radiusLabel(miles: number): string {
  return miles === Infinity ? "Worldwide" : `${miles} mi`;
}

function ageLabel(lower: number, upper: number): string {
  const hi = upper >= AGE_MAX ? `${AGE_MAX}+` : `${upper}`;
  return lower === upper && upper < AGE_MAX
    ? `Age ${lower}`
    : `Ages ${lower}–${hi}`;
}

// Cap the user's chosen column count so cards stay readable on smaller screens.
function maxColsForWidth(width: number): number {
  if (width < 560) return 1;
  if (width < 800) return 2;
  if (width < 1100) return 3;
  if (width < 1400) return 5;
  return 10;
}

function useViewportWidth(): number {
  // Start wide so the first server/client render matches and doesn't clamp the
  // grid before hydration; the effect corrects it on mount.
  const [width, setWidth] = useState(1440);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

function Card({ card, wide }: { card: DirectoryCard; wide: boolean }) {
  const thumbs = card.thumbUrls.slice(0, 4);
  const childNames = card.children.map((c) => c.firstName).filter(Boolean);

  const hero = (
    <div
      className={
        wide
          ? "relative h-40 w-56 shrink-0 overflow-hidden rounded-xl sm:h-44 sm:w-64"
          : "relative aspect-[16/10] w-full overflow-hidden rounded-t-2xl"
      }
    >
      {card.heroUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.heroUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-400/15 via-white/[0.04] to-black">
          <span className="text-3xl font-semibold text-white/40">
            {card.firstName.slice(0, 1).toUpperCase() || "?"}
          </span>
        </div>
      )}
    </div>
  );

  const body = (
    <div className={wide ? "flex min-w-0 flex-1 flex-col gap-2" : "flex flex-col gap-2 p-4"}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="truncate text-base font-semibold text-white">{card.name}</h3>
      </div>
      {card.location && <p className="text-sm text-white/55">{card.location}</p>}
      {childNames.length > 0 && (
        <p className="text-sm text-amber-400/90">
          {childNames.join(", ")}
        </p>
      )}
      {card.interests.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {card.interests.slice(0, wide ? 12 : 6).map((t) => {
            const Icon = iconForInterest(t);
            return (
              <span
                key={t}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.05] px-2.5 py-1 text-xs text-white/80"
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                {t}
              </span>
            );
          })}
          {card.interests.length > (wide ? 12 : 6) && (
            <span className="self-center text-xs text-white/40">
              +{card.interests.length - (wide ? 12 : 6)}
            </span>
          )}
        </div>
      )}
      {thumbs.length > 0 && (
        <div className="mt-auto flex gap-1.5 pt-2">
          {thumbs.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt=""
              referrerPolicy="no-referrer"
              className="h-12 w-12 shrink-0 rounded-md object-cover"
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Link
      href={`/p/${card.token}`}
      className={
        wide
          ? "group flex gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-amber-400/40 hover:bg-white/[0.04]"
          : "group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] transition-colors hover:border-amber-400/40 hover:bg-white/[0.04]"
      }
    >
      {hero}
      {body}
    </Link>
  );
}

// A dual-thumb range slider built from two overlaid native range inputs. The
// thumbs stay grabbable because each input only owns its half of the track via
// pointer-events toggling, and the active fill is drawn between them.
function DualRange({
  min,
  max,
  lower,
  upper,
  onChange,
}: {
  min: number;
  max: number;
  lower: number;
  upper: number;
  onChange: (lower: number, upper: number) => void;
}) {
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  const lowPct = pct(lower);
  const highPct = pct(upper);

  const thumb =
    "pointer-events-none absolute h-2 w-full appearance-none bg-transparent " +
    "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none " +
    "[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full " +
    "[&::-webkit-slider-thumb]:bg-amber-400 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-black " +
    "[&::-webkit-slider-thumb]:cursor-pointer " +
    "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 " +
    "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-amber-400 [&::-moz-range-thumb]:border-2 " +
    "[&::-moz-range-thumb]:border-black [&::-moz-range-thumb]:cursor-pointer";

  return (
    <div className="relative h-4 w-48 select-none">
      {/* track */}
      <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-white/15" />
      {/* active fill */}
      <div
        className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-amber-400/80"
        style={{ left: `${lowPct}%`, right: `${100 - highPct}%` }}
      />
      <input
        type="range"
        min={min}
        max={max}
        value={lower}
        aria-label="Minimum age"
        onChange={(e) => onChange(Math.min(Number(e.target.value), upper), upper)}
        className={`${thumb} top-1/2 -translate-y-1/2`}
        // Keep the higher thumb clickable when both sit at the same spot.
        style={{ zIndex: lower >= max ? 5 : 3 }}
      />
      <input
        type="range"
        min={min}
        max={max}
        value={upper}
        aria-label="Maximum age"
        onChange={(e) => onChange(lower, Math.max(Number(e.target.value), lower))}
        className={`${thumb} top-1/2 -translate-y-1/2`}
        style={{ zIndex: 4 }}
      />
    </div>
  );
}

export function DirectoryClient({ cards }: { cards: DirectoryCard[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [density, setDensity] = useState(3);

  // Age-range filter. Inactive until a thumb moves off the extremes.
  const [ageLower, setAgeLower] = useState(AGE_MIN);
  const [ageUpper, setAgeUpper] = useState(AGE_MAX);
  const ageActive = ageLower > AGE_MIN || ageUpper < AGE_MAX;

  // Radius filter (opt-in). Origin is the viewer's geolocated or typed location.
  const [radiusOn, setRadiusOn] = useState(false);
  const [radiusIdx, setRadiusIdx] = useState(DEFAULT_RADIUS_IDX);
  const radiusMiles = RADIUS_STOPS[radiusIdx];
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const [originLabel, setOriginLabel] = useState<string>("");
  const [locInput, setLocInput] = useState("");
  const [geoStatus, setGeoStatus] = useState<
    "idle" | "locating" | "denied" | "notfound"
  >("idle");

  // Geocode each card's location ONCE (locations never change), so the radius
  // filter doesn't re-parse the whole list on every keystroke / filter change.
  const coordsByToken = useMemo(() => {
    const m = new Map<string, LatLng | null>();
    for (const c of cards) m.set(c.token, geocodeLocation(c.location));
    return m;
  }, [cards]);

  const requestGeolocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoStatus("denied");
      return;
    }
    setGeoStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin([pos.coords.latitude, pos.coords.longitude]);
        setOriginLabel("your location");
        setGeoStatus("idle");
      },
      () => setGeoStatus("denied"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  };

  const toggleRadius = () => {
    setRadiusOn((on) => {
      const next = !on;
      // Ask for the browser location the first time it's switched on.
      if (next && !origin) requestGeolocation();
      return next;
    });
  };

  const applyTypedLocation = () => {
    const coords = geocodeLocation(locInput);
    if (coords) {
      setOrigin(coords);
      setOriginLabel(locInput.trim());
      setGeoStatus("idle");
    } else {
      // Distinct from a browser "denied" so the message can speak to the typed
      // value rather than geolocation permission.
      setGeoStatus("notfound");
    }
  };

  const viewportWidth = useViewportWidth();
  const maxCols = maxColsForWidth(viewportWidth);
  // What the grid actually renders — the user's choice clamped to what fits the
  // viewport. The "Per row" select shows THIS (not the raw stored density) so the
  // control never claims more columns than are drawn.
  const effectiveCols = Math.min(density, maxCols);

  // Distinct interests across all visible cards, deduped case-insensitively but
  // keeping the first-seen display label.
  const allInterests = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const c of cards) {
      for (const i of c.interests) {
        const k = i.toLowerCase();
        if (!byKey.has(k)) byKey.set(k, i);
      }
    }
    return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
  }, [cards]);

  const toggleInterest = (label: string) => {
    const key = label.toLowerCase();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = cards.filter((c) => {
      // Interest filter: OR — match any selected interest.
      if (selected.size > 0) {
        const cardKeys = new Set(c.interests.map((i) => i.toLowerCase()));
        let any = false;
        for (const s of selected) {
          if (cardKeys.has(s)) {
            any = true;
            break;
          }
        }
        if (!any) return false;
      }
      // Search: parent name, any child name, or any interest (substring).
      if (q) {
        const haystack = [
          c.name,
          ...c.children.map((k) => k.firstName),
          ...c.interests,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      // Age range: any shown child's derived age within [lower, upper] (upper at
      // AGE_MAX means "18+"). Families with no age-derivable children don't match.
      if (
        ageActive &&
        !familyMatchesAgeRange(
          c.children.map((k) => k.age),
          ageLower,
          ageUpper,
          AGE_MAX,
        )
      ) {
        return false;
      }
      // Radius: ungeocodable / location-not-shared families are excluded when a
      // finite radius is active (Worldwide keeps everyone).
      if (
        radiusOn &&
        origin &&
        radiusMiles !== Infinity &&
        !familyWithinRadius(coordsByToken.get(c.token) ?? null, origin, radiusMiles)
      ) {
        return false;
      }
      return true;
    });

    const dir = sortDir === "asc" ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => {
      const av =
        sortKey === "name" ? a.name : a.children[0]?.firstName ?? "";
      const bv =
        sortKey === "name" ? b.name : b.children[0]?.firstName ?? "";
      return av.localeCompare(bv) * dir;
    });
    return sorted;
  }, [
    cards,
    query,
    selected,
    sortKey,
    sortDir,
    ageActive,
    ageLower,
    ageUpper,
    radiusOn,
    origin,
    radiusMiles,
    coordsByToken,
  ]);

  const controlCls =
    "rounded-md border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-amber-400/50";

  return (
    <div className="flex flex-col gap-6">
      {/* Controls */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, child, or interest…"
            className={`${controlCls} min-w-[14rem] flex-1`}
          />
          <label className="flex items-center gap-2 text-sm text-white/60">
            Sort
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className={controlCls}
            >
              <option value="name">Parent name</option>
              <option value="child">Child name</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className={`${controlCls} hover:bg-white/10`}
            aria-label="Toggle sort direction"
          >
            {sortDir === "asc" ? "↑ A–Z" : "↓ Z–A"}
          </button>
          <label className="flex items-center gap-2 text-sm text-white/60">
            Per row
            <select
              value={effectiveCols}
              onChange={(e) => setDensity(Number(e.target.value))}
              className={controlCls}
            >
              {Array.from({ length: maxCols }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Age range + location radius filters */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          {/* Child age-range slider */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-white/60">Child age</span>
            <DualRange
              min={AGE_MIN}
              max={AGE_MAX}
              lower={ageLower}
              upper={ageUpper}
              onChange={(lo, hi) => {
                setAgeLower(lo);
                setAgeUpper(hi);
              }}
            />
            <span className="min-w-[5.5rem] text-sm tabular-nums text-white/80">
              {ageActive ? ageLabel(ageLower, ageUpper) : "All ages"}
            </span>
            {ageActive && (
              <button
                type="button"
                onClick={() => {
                  setAgeLower(AGE_MIN);
                  setAgeUpper(AGE_MAX);
                }}
                className="text-white/45 hover:text-white/80"
                aria-label="Reset age filter"
              >
                <IconX className="h-3.5 w-3.5" />
              </button>
            )}
            {ageActive && (
              <span className="text-xs text-white/35">
                (only families who shared child ages)
              </span>
            )}
          </div>

          {/* Location radius filter (opt-in) */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-white/60">
              <input
                type="checkbox"
                checked={radiusOn}
                onChange={toggleRadius}
                className="h-4 w-4 accent-amber-400"
              />
              Near me
            </label>
            {radiusOn && (
              <>
                <input
                  type="range"
                  min={0}
                  max={RADIUS_STOPS.length - 1}
                  value={radiusIdx}
                  onChange={(e) => setRadiusIdx(Number(e.target.value))}
                  aria-label="Radius"
                  className="h-1 w-40 accent-amber-400"
                />
                <span className="min-w-[5rem] text-sm tabular-nums text-white/80">
                  {radiusLabel(radiusMiles)}
                </span>
                {origin ? (
                  <span className="text-xs text-white/45">
                    from {originLabel}
                    <button
                      type="button"
                      onClick={requestGeolocation}
                      className="ml-2 text-amber-400/80 hover:text-amber-300"
                    >
                      use my location
                    </button>
                  </span>
                ) : (
                  <span className="text-xs text-white/45">
                    {geoStatus === "locating"
                      ? "locating…"
                      : "set an origin →"}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <input
                    value={locInput}
                    onChange={(e) => setLocInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        applyTypedLocation();
                      }
                    }}
                    placeholder="City, State or ZIP"
                    className={`${controlCls} w-40`}
                  />
                  <button
                    type="button"
                    onClick={applyTypedLocation}
                    className={`${controlCls} hover:bg-white/10`}
                  >
                    Set
                  </button>
                </span>
                {geoStatus === "denied" && !origin && (
                  <span className="text-xs text-amber-400/80">
                    Couldn&apos;t locate you — type a city/state or ZIP.
                  </span>
                )}
                {geoStatus === "notfound" && (
                  <span className="text-xs text-amber-400/80">
                    Couldn&apos;t place that — try &ldquo;City, State&rdquo; or a ZIP.
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Interest filter chips */}
        {allInterests.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {allInterests.map((label) => {
              const active = selected.has(label.toLowerCase());
              const Icon = iconForInterest(label);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleInterest(label)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    active
                      ? "border-amber-400 bg-amber-400 text-black"
                      : "border-white/15 bg-white/[0.04] text-white/70 hover:bg-white/10"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                  {label}
                </button>
              );
            })}
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="inline-flex items-center gap-1 px-2 text-xs text-white/45 hover:text-white/80"
              >
                Clear filters <IconX className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>

      <p className="text-sm text-white/45">
        {visible.length} {visible.length === 1 ? "family" : "families"}
        {selected.size > 0 ||
        query.trim() ||
        ageActive ||
        (radiusOn && origin && radiusMiles !== Infinity)
          ? " match your filters"
          : " shared with OHS families"}
      </p>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center text-white/50">
          No families match your filters.
        </div>
      ) : (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${effectiveCols}, minmax(0, 1fr))` }}
        >
          {visible.map((c) => (
            <Card key={c.token} card={c} wide={effectiveCols === 1} />
          ))}
        </div>
      )}
    </div>
  );
}
