"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { iconForInterest } from "@/lib/interest-icons";
import { IconX, IconCode, IconGradCap, IconLinkedin, IconGithub } from "@/components/icons";
import { TagList } from "@/components/tag-list";
import {
  familyMatchesAgeRange,
  familyWithinRadius,
  geocodeLocation,
} from "@/lib/directory-filters";
import {
  parseUrlState,
  serializeUrlState,
  type DirectorySortDir,
  type DirectorySortKey,
} from "@/lib/directory-url-state";
import type { LatLng } from "@/lib/data/us-geo";
import type { DirectoryCard } from "@/lib/directory";

export type { DirectoryCard };

type SortKey = DirectorySortKey;
type SortDir = DirectorySortDir;

// How long to wait after the last keystroke before reflecting the search text in
// the URL — keeps fast typing from thrashing router.replace / browser history.
const SEARCH_URL_DEBOUNCE_MS = 300;

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
  return lower === upper && upper < AGE_MAX ? `Age ${lower}` : `Ages ${lower}–${hi}`;
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

// "Builder" recognition badge — a member who has shipped commits to Pixel
// Parents (or was manually marked). Shows the contribution count when known.
function BuilderBadge({ contributions }: { contributions: number }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-300"
      title={
        contributions > 0
          ? `${contributions} contribution${contributions === 1 ? "" : "s"} to Pixel Parents`
          : "A Pixel Parents builder"
      }
    >
      <IconCode className="h-3.5 w-3.5" strokeWidth={2} />
      Builder
      {contributions > 0 && (
        <span className="text-amber-300/70">
          · {contributions} contribution{contributions === 1 ? "" : "s"}
        </span>
      )}
    </span>
  );
}

// "OHS student" badge — a minor account. Coarse-only fields are shown on these
// cards (see lib/directory buildDirectoryCard).
function StudentBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.05] px-2 py-0.5 text-[11px] font-medium text-white/75">
      <IconGradCap className="h-3.5 w-3.5" strokeWidth={2} />
      OHS student
    </span>
  );
}

function Card({ card, wide }: { card: DirectoryCard; wide: boolean }) {
  const thumbs = card.thumbUrls.slice(0, 4);
  const childNames = card.children.map((c) => c.name).filter(Boolean);
  // Interests + skillsets + (shared) enrichment expertise share one chip strip;
  // deduped case-insensitively. The enrichment expertise tags only appear when
  // the owner enabled the "profile_enrichment" share field (gated upstream in
  // buildDirectoryCard) — card.enrichment is null otherwise.
  const tagByKey = new Map<string, string>();
  for (const t of [
    ...card.interests,
    ...card.skillsets,
    ...(card.enrichment?.expertiseTags ?? []),
  ]) {
    const k = t.toLowerCase();
    if (!tagByKey.has(k)) tagByKey.set(k, t);
  }
  const tags = Array.from(tagByKey.values());

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
      {(card.isBuilder || card.isStudent) && (
        <div className="flex flex-wrap gap-1.5">
          {card.isStudent && <StudentBadge />}
          {card.isBuilder && <BuilderBadge contributions={card.contributions} />}
        </div>
      )}
      {card.location && <p className="text-sm text-white/55">{card.location}</p>}
      {card.enrichment?.bio && (
        <p className="line-clamp-2 text-sm text-white/65">{card.enrichment.bio}</p>
      )}
      {childNames.length > 0 && (
        <p className="text-sm text-amber-400/90">{childNames.join(", ")}</p>
      )}
      {tags.length > 0 && (
        <TagList
          tags={tags}
          max={wide ? 12 : 6}
          className="mt-1 flex flex-wrap items-center gap-1.5"
          renderTag={(t) => {
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
          }}
        />
      )}
      {(card.linkedinUrl || card.githubUrl) && (
        <div className="flex flex-wrap gap-2 pt-0.5 text-white/45">
          {card.linkedinUrl && (
            <a
              href={card.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="LinkedIn"
              aria-label="LinkedIn profile"
              className="transition-colors hover:text-amber-300"
            >
              <IconLinkedin className="h-4 w-4" />
            </a>
          )}
          {card.githubUrl && (
            <a
              href={card.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="GitHub"
              aria-label="GitHub profile"
              className="transition-colors hover:text-amber-300"
            >
              <IconGithub className="h-4 w-4" />
            </a>
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

  // Clicking a member opens their profile IN-TAB at /directory/<token> — a nested
  // route rendered inside DashboardShell, NOT a jump to /p (which exits the shell).
  return (
    <Link
      href={`/directory/${card.token}`}
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

// The consolidated community member grid: parents AND students who opted in. A
// fork of the old directory client — same URL-persisted filters (search, age,
// near-me, interests, sort, per-row) — but cards open IN-TAB at /directory/<token>
// and surface the student badge, skillsets, and opt-in LinkedIn/GitHub links.
export function ShowcaseClient({ cards }: { cards: DirectoryCard[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The set of interest keys that actually exist on the current cards. Used to
  // validate interests coming in from a shared URL (unknown ones are dropped).
  const validInterestKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const c of cards) {
      for (const i of c.interests) keys.add(i.toLowerCase());
      for (const s of c.skillsets) keys.add(s.toLowerCase());
    }
    return keys;
  }, [cards]);

  // Restore filter state from the URL on first render (so a shared/bookmarked
  // link reproduces the view). Read once via a lazy initializer. "Near me" is
  // intentionally absent (never URL-persisted).
  const [initialState] = useState(() =>
    parseUrlState(new URLSearchParams(searchParams.toString()), validInterestKeys),
  );

  const [query, setQuery] = useState(initialState.query);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialState.interests));
  const [sortKey, setSortKey] = useState<SortKey>(initialState.sortKey);
  const [sortDir, setSortDir] = useState<SortDir>(initialState.sortDir);
  const [density, setDensity] = useState(initialState.perRow);

  // Age-range filter. Inactive until a thumb moves off the extremes.
  const [ageLower, setAgeLower] = useState(initialState.ageLower);
  const [ageUpper, setAgeUpper] = useState(initialState.ageUpper);
  const ageActive = ageLower > AGE_MIN || ageUpper < AGE_MAX;

  // Debounce ONLY the search text before it reaches the URL.
  const [debouncedQuery, setDebouncedQuery] = useState(initialState.query);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), SEARCH_URL_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // Mirror the persisted filter state into the URL (replace, NOT push). The
  // "Near me" radius/origin is deliberately excluded so a user's location never
  // lands in a shareable URL. Skip the first run so a shared link's params aren't
  // immediately rewritten.
  const didMountUrlSync = useRef(false);
  useEffect(() => {
    if (!didMountUrlSync.current) {
      didMountUrlSync.current = true;
      return;
    }
    const next = serializeUrlState({
      query: debouncedQuery,
      interests: Array.from(selected),
      sortKey,
      sortDir,
      ageLower,
      ageUpper,
      perRow: density,
    }).toString();
    if (next === searchParams.toString()) return;
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [
    debouncedQuery,
    selected,
    sortKey,
    sortDir,
    ageLower,
    ageUpper,
    density,
    pathname,
    router,
    searchParams,
  ]);

  // Radius filter (opt-in). Origin is the viewer's geolocated or typed location.
  const [radiusOn, setRadiusOn] = useState(false);
  const [radiusIdx, setRadiusIdx] = useState(DEFAULT_RADIUS_IDX);
  const radiusMiles = RADIUS_STOPS[radiusIdx];
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const [originLabel, setOriginLabel] = useState<string>("");
  const [locInput, setLocInput] = useState("");
  const [geoStatus, setGeoStatus] = useState<"idle" | "locating" | "denied" | "notfound">("idle");

  // Geocode each card's location ONCE (locations never change).
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
      setGeoStatus("notfound");
    }
  };

  const viewportWidth = useViewportWidth();
  const maxCols = maxColsForWidth(viewportWidth);
  const effectiveCols = Math.min(density, maxCols);

  // Distinct interests + skillsets across all visible cards, deduped
  // case-insensitively but keeping the first-seen display label.
  const allInterests = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const c of cards) {
      for (const i of [...c.interests, ...c.skillsets]) {
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
      const cardTags = [...c.interests, ...c.skillsets];
      // Interest/skill filter: OR — match any selected tag.
      if (selected.size > 0) {
        const cardKeys = new Set(cardTags.map((i) => i.toLowerCase()));
        let any = false;
        for (const s of selected) {
          if (cardKeys.has(s)) {
            any = true;
            break;
          }
        }
        if (!any) return false;
      }
      // Search: name, any child name, or any interest/skill (substring).
      if (q) {
        const haystack = [c.name, ...c.children.map((k) => k.name), ...cardTags]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      // Age range: any shown child's derived age within [lower, upper]. Families
      // with no age-derivable children don't match. (Students have no children.)
      if (
        ageActive &&
        !familyMatchesAgeRange(c.children.map((k) => k.age), ageLower, ageUpper, AGE_MAX)
      ) {
        return false;
      }
      // Radius: ungeocodable / location-not-shared members are excluded when a
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
      const av = sortKey === "name" ? a.name : a.children[0]?.firstName ?? "";
      const bv = sortKey === "name" ? b.name : b.children[0]?.firstName ?? "";
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
            placeholder="Search by name, child, interest, or skill…"
            className={`${controlCls} min-w-[14rem] flex-1`}
          />
          <label className="flex items-center gap-2 text-sm text-white/60">
            Sort
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className={controlCls}
            >
              <option value="name">Name</option>
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
              <span className="text-xs text-white/35">(only members who shared child ages)</span>
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
                    {geoStatus === "locating" ? "locating…" : "set an origin →"}
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

        {/* Interest / skill filter chips. Collapsed to a handful with a
            "+N more" toggle so the ~40-item facet doesn't dominate the page;
            expanding reveals the rest, and every chip stays a clickable filter. */}
        {allInterests.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <TagList
              tags={allInterests}
              max={12}
              className="flex flex-wrap items-center gap-2"
              renderTag={(label) => {
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
              }}
            />
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
        {visible.length} {visible.length === 1 ? "member" : "members"}
        {selected.size > 0 ||
        query.trim() ||
        ageActive ||
        (radiusOn && origin && radiusMiles !== Infinity)
          ? " match your filters"
          : " sharing with the community"}
      </p>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center text-white/50">
          No members match your filters.
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
