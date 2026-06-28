"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BADGE_CATALOG,
  BADGE_CATEGORY_CLASS,
  badgeClassFor,
  type Badge,
  type BadgeCatalogEntry,
} from "@/lib/badges";
import { FILTERABLE_BADGE_IDS } from "@/lib/leaderboard-constants";
import { useOneRowFit } from "@/components/use-one-row-fit";

// The leaderboard view filtered to everyone who has `badge`, or null when the
// badge has no leaderboard filter. Industry badges (id "industry:<slug>") map
// to the `industry` facet; the fixed-taxonomy badges map to the `badge` facet.
function leaderboardHrefFor(badge: Badge): string | null {
  if (badge.category === "industry") {
    const slug = badge.id.startsWith("industry:") ? badge.id.slice("industry:".length) : "";
    return slug ? `/leaderboard?industry=${encodeURIComponent(slug)}` : null;
  }
  if ((FILTERABLE_BADGE_IDS as readonly string[]).includes(badge.id)) {
    return `/leaderboard?badge=${encodeURIComponent(badge.id)}`;
  }
  return null;
}

type Props = {
  badges: Badge[];
  // "wrap" = pills wrap onto multiple lines (used on /profile).
  // "fit"  = single-line; pills that don't fit collapse into a "+N" expander.
  layout?: "wrap" | "fit";
  size?: "xs" | "sm";
  // Owner-only editor surface. When true, hovering any pill reveals
  // ✓ confirm / ✏ edit / ✗ reject buttons; a "+ add" pill appears at the end
  // that opens a picker of badges not already on the row. Pass evaluationId
  // so the inline API calls know which eval to update.
  editable?: boolean;
  evaluationId?: string;
  // Click-to-filter (leaderboard only). When set, badges whose id is in
  // `filterableBadgeIds` render as buttons that call onBadgeClick(id). Other
  // badges and the "+N more" expander are unaffected.
  onBadgeClick?: (badgeId: string) => void;
  filterableBadgeIds?: readonly string[];
  // Profile surface: render each badge as a link to its leaderboard filtered
  // view (instead of the in-page onBadgeClick used on the leaderboard itself).
  // The owner ✓/✗ edit controls keep working independently of the link.
  leaderboardLinks?: boolean;
  // Gray group label rendered to the LEFT of the pills (e.g. "Professional:").
  label?: string;
  // "left" left-justifies the row (default "center"). Profile groups use "left".
  align?: "center" | "left";
  // Prefix each pill with a small bullet dot (profile group lists).
  bulleted?: boolean;
  // "wrap" mode only: constrain to a single row and collapse overflow into a
  // clickable "+N more" pill. Clicking it expands the group inline to the full
  // (editable) wrap. Used on /profile so badge-heavy groups stay one row.
  collapsible?: boolean;
};

const PILL_BASE =
  "inline-flex items-center rounded-md border font-medium whitespace-nowrap";
const PILL_SIZE: Record<"xs" | "sm", string> = {
  xs: "px-2 py-0.5 text-[10px]",
  sm: "px-2.5 py-1 text-xs",
};

export function Badges({
  badges,
  layout = "fit",
  size = "sm",
  editable,
  evaluationId,
  onBadgeClick,
  filterableBadgeIds,
  leaderboardLinks,
  label,
  align = "center",
  bulleted = false,
  collapsible = false,
}: Props) {
  const clickable = useMemo(
    () => (filterableBadgeIds ? new Set(filterableBadgeIds) : null),
    [filterableBadgeIds],
  );
  const [expanded, setExpanded] = useState(false);
  // Local optimistic state — server's `badges` prop is the seed, but as the
  // user clicks confirm/edit/reject we update locally so the UI is snappy.
  const [local, setLocal] = useState<Badge[]>(badges);
  useEffect(() => setLocal(badges), [badges]);

  // "+ add" picker state.
  const [pickerOpen, setPickerOpen] = useState(false);

  // Single-row fit: active for leaderboard "fit" rows and for collapsible
  // /profile groups while collapsed. The measure layer (rendered below) carries
  // an optional leading label, then all pills, then the "+N more" sentinel.
  const fitEnabled = layout === "fit" || (collapsible && !expanded);
  const leadingCount = collapsible && !!label ? 1 : 0;
  const fitSignature = `${size}:${local.map((b) => `${b.id}:${b.label}:${b.status}`).join("|")}`;
  const { measureRef, visibleCount } = useOneRowFit(local.length, fitEnabled, {
    leadingCount,
    signature: fitSignature,
  });

  function patchLocal(next: Badge) {
    setLocal((arr) => {
      const exists = arr.some((b) => b.id === next.id);
      return exists ? arr.map((b) => (b.id === next.id ? next : b)) : [...arr, next];
    });
  }
  function removeLocal(id: string) {
    setLocal((arr) => arr.filter((b) => b.id !== id));
  }

  if (local.length === 0 && !editable) return null;

  // Compact "fit" mode (used on leaderboard rows) — no editor surface, just
  // the wrap+ellipsis logic.
  if (layout === "fit") {
    const visible = expanded ? local : local.slice(0, visibleCount);
    const hiddenCount = expanded ? 0 : local.length - visibleCount;
    return (
      <div className="relative w-full max-w-full">
        <div
          ref={measureRef}
          aria-hidden
          // overflow-hidden is REQUIRED: this single-line (flex-nowrap) layer
          // would otherwise extend its pills past the viewport on badge-heavy
          // rows and expand the document's horizontal scroll (it's only
          // visibility-hidden, so it still affects layout). Clipping doesn't
          // affect the offsetLeft/offsetWidth reads the measurement relies on.
          className="invisible absolute inset-x-0 top-0 flex flex-nowrap gap-1.5 pointer-events-none whitespace-nowrap overflow-hidden"
        >
          {local.map((b) => (<PillReadOnly key={`m-${b.id}`} badge={b} size={size} />))}
          {/* Sentinel sized for the widest possible "+N more" so the visible
              expander always has reserved room. */}
          <span className={`${PILL_BASE} ${PILL_SIZE[size]} border-zinc-700`}>
            +{local.length} more
          </span>
        </div>
        <div className={expanded ? "flex flex-wrap gap-1.5" : "flex flex-nowrap gap-1.5 overflow-hidden"}>
          {visible.map((b) => (
            <PillReadOnly
              key={b.id}
              badge={b}
              size={size}
              onClick={
                (clickable?.has(b.id) || b.category === "industry") && onBadgeClick
                  ? () => onBadgeClick(b.id)
                  : undefined
              }
            />
          ))}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-label={`Show ${hiddenCount} more`}
              className={`${PILL_BASE} ${PILL_SIZE[size]} border-zinc-700 bg-zinc-800/40 text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-200 transition-colors cursor-pointer`}
              title={local.slice(local.length - hiddenCount).map((b) => b.label).join(", ")}
            >
              +{hiddenCount} more
            </button>
          )}
          {expanded && local.length > 3 && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className={`${PILL_BASE} ${PILL_SIZE[size]} border-transparent text-zinc-500 hover:text-zinc-300 cursor-pointer`}
              aria-label="Collapse badges"
            >
              less
            </button>
          )}
        </div>
      </div>
    );
  }

  // Collapsed single-row view (collapsible groups on /profile). Shows the label,
  // the pills that fit on one row, and a "+N more" pill that expands inline to
  // the full editable wrap below. Pills are read-only here; the ✓/✏/✗ + "add"
  // controls live in the expanded state.
  if (collapsible && !expanded && local.length > 0) {
    const labelNode = label ? (
      <span className="shrink-0 mr-1 text-xs text-zinc-500">{label}</span>
    ) : null;
    const visible = local.slice(0, visibleCount);
    const hiddenCount = local.length - visibleCount;
    return (
      <div className="relative w-full max-w-full">
        {/* Hidden measure layer: label + ALL pills on one nowrap line + the
            "+N more" sentinel. overflow-hidden keeps it from widening the page;
            it still affects layout so offset reads are accurate. */}
        <div
          ref={measureRef}
          aria-hidden
          inert
          className="invisible absolute inset-x-0 top-0 flex flex-nowrap items-center gap-1.5 pointer-events-none whitespace-nowrap overflow-hidden"
        >
          {labelNode}
          {local.map((b) => (
            <PillReadOnly key={`m-${b.id}`} badge={b} size={size} />
          ))}
          <span className={`${PILL_BASE} ${PILL_SIZE[size]} border-zinc-700`}>
            +{local.length} more
          </span>
        </div>
        <div className="flex flex-nowrap items-center gap-1.5 overflow-hidden">
          {labelNode}
          {visible.map((b) => {
            const href = leaderboardLinks ? leaderboardHrefFor(b) ?? undefined : undefined;
            return <PillReadOnly key={b.id} badge={b} size={size} href={href} />;
          })}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-label={`Show ${hiddenCount} more`}
              className={`${PILL_BASE} ${PILL_SIZE[size]} border-zinc-700 bg-zinc-800/40 text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-200 transition-colors cursor-pointer`}
              title={local.slice(local.length - hiddenCount).map((b) => b.label).join(", ")}
            >
              +{hiddenCount} more
            </button>
          )}
        </div>
      </div>
    );
  }

  // "wrap" mode — used on /profile. This is where the editable surface lives.
  const knownIds = new Set(local.map((b) => b.id));
  const addable: BadgeCatalogEntry[] = Object.values(BADGE_CATALOG).filter(
    (c) => !knownIds.has(c.id),
  );
  const dot = (
    <span className="h-1 w-1 shrink-0 rounded-full bg-zinc-600" aria-hidden />
  );
  return (
    // `group/badges` so the trailing "+" pill can hide unless the user is
    // hovering somewhere in the badges row. Stays visible whenever the
    // picker is open (so it doesn't disappear out from under the user mid-
    // interaction).
    <div
      className={`flex flex-wrap gap-1.5 items-center group/badges ${
        align === "left" ? "justify-start" : "justify-center"
      }`}
    >
      {label && (
        <span className="shrink-0 mr-1 text-xs text-zinc-500">{label}</span>
      )}
      {local.map((b) => {
        const href = leaderboardLinks ? leaderboardHrefFor(b) ?? undefined : undefined;
        // "Profile Claimed" and industry badges can't be confirmed / edited /
        // rejected from the pill UI — claimed is auto-confirmed at claim time,
        // and industries are derived facts. They render read-only even on the
        // owner's profile (but still link to the leaderboard).
        const pill =
          editable && evaluationId && b.id !== "claimed" && b.category !== "industry" ? (
            <EditablePill
              badge={b}
              size={size}
              href={href}
              evaluationId={evaluationId}
              onUpdated={patchLocal}
              onRemoved={() => removeLocal(b.id)}
            />
          ) : (
            <PillReadOnly badge={b} size={size} href={href} />
          );
        return bulleted ? (
          <span key={b.id} className="inline-flex items-center gap-1.5">
            {dot}
            {pill}
          </span>
        ) : (
          <span key={b.id} className="contents">
            {pill}
          </span>
        );
      })}
      {editable && evaluationId && addable.length > 0 && (
        <div
          className={`relative ${
            pickerOpen
              ? ""
              : "opacity-0 group-hover/badges:opacity-100 focus-within:opacity-100 transition-opacity"
          }`}
        >
          <button
            type="button"
            aria-label="Add another pill"
            title="Add another pill"
            onClick={() => setPickerOpen((v) => !v)}
            className={`${PILL_BASE} ${PILL_SIZE[size]} border-dashed border-zinc-600 text-zinc-400 hover:text-white hover:border-zinc-300 cursor-pointer`}
          >
            +
          </button>
          {pickerOpen && (
            <AddPicker
              addable={addable}
              evaluationId={evaluationId}
              onClose={() => setPickerOpen(false)}
              onAdded={(b) => {
                patchLocal(b);
                setPickerOpen(false);
              }}
            />
          )}
        </div>
      )}
      {collapsible && expanded && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className={`${PILL_BASE} ${PILL_SIZE[size]} border-transparent text-zinc-500 hover:text-zinc-300 cursor-pointer`}
          aria-label="Collapse badges"
        >
          less
        </button>
      )}
    </div>
  );
}

function PillReadOnly({
  badge,
  size,
  onClick,
  href,
}: {
  badge: Badge;
  size: "xs" | "sm";
  // When provided, the pill becomes a button that filters the leaderboard by
  // this badge (in-page click-to-filter on the leaderboard). Otherwise it
  // renders as a plain span — or a link, when `href` is set (profile surface).
  onClick?: () => void;
  href?: string;
}) {
  const content = (
    <>
      {badge.label}
      {badge.status === "pending" && (
        <span className="ml-1.5 opacity-80">(Pending)</span>
      )}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={`Filter by ${badge.label}`}
        className={`${PILL_BASE} ${PILL_SIZE[size]} ${badgeClassFor(badge)} cursor-pointer hover:brightness-125 transition`}
      >
        {content}
      </button>
    );
  }
  if (href) {
    return (
      <a
        href={href}
        title={`See everyone with ${badge.label} on the leaderboard`}
        className={`${PILL_BASE} ${PILL_SIZE[size]} ${badgeClassFor(badge)} cursor-pointer hover:brightness-125 transition`}
      >
        {content}
      </a>
    );
  }
  return (
    <span className={`${PILL_BASE} ${PILL_SIZE[size]} ${badgeClassFor(badge)}`}>
      {content}
    </span>
  );
}

function EditablePill({
  badge,
  size,
  href,
  evaluationId,
  onUpdated,
  onRemoved,
}: {
  badge: Badge;
  size: "xs" | "sm";
  href?: string;
  evaluationId: string;
  onUpdated: (b: Badge) => void;
  onRemoved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const catalog = BADGE_CATALOG[badge.id];
  const hasTiers = !!catalog?.tiers && catalog.tiers.length > 0;

  async function call(body: object) {
    setSaving(true);
    try {
      const res = await fetch("/api/badges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evaluationId, badgeId: badge.id, ...body }),
      });
      const json = await res.json();
      if (res.ok && json.override) {
        if (json.override.status === "rejected") {
          onRemoved();
        } else {
          onUpdated({
            ...badge,
            status: json.override.status,
            label: json.override.editedLabel ?? badge.label,
          });
        }
      }
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  const pillClass = `${PILL_BASE} ${PILL_SIZE[size]} ${badgeClassFor(badge)}`;
  const pillInner = (
    <>
      {badge.label}
      {badge.status === "pending" && (
        <span className="ml-1.5 opacity-80">(Pending)</span>
      )}
    </>
  );
  return (
    <span className="relative group/pill inline-flex items-center">
      {/* The pill body links to the leaderboard; the ✓/✗ popover below is a
          sibling (not nested in the link), so confirm/reject never navigate. */}
      {href ? (
        <a
          href={href}
          title={`See everyone with ${badge.label} on the leaderboard`}
          className={`${pillClass} cursor-pointer hover:brightness-125 transition`}
        >
          {pillInner}
        </a>
      ) : (
        <span className={pillClass}>{pillInner}</span>
      )}
      {/* Hover actions: ✓ ✏ ✗ — float ABOVE the pill as an absolute popover
          so the pill keeps its inline position. The OUTER span is a
          transparent hit-area with `pb-1.5` padding-bottom that bridges
          the visual gap to the pill; the INNER span is the actual dark
          popover. Without this bridge, moving the cursor from the pill UP
          to the popover crosses the 4-6px margin gap and loses the hover
          state, hiding the popover mid-flight. */}
      <span className="absolute left-1/2 bottom-full -translate-x-1/2 pb-1.5 hidden group-hover/pill:block focus-within:block z-20">
        <span className="inline-flex items-center gap-0.5 rounded-md bg-zinc-900/95 border border-zinc-700 px-1 py-0.5 shadow-md whitespace-nowrap">
          <button
            type="button"
            onClick={() => call({ action: "confirm" })}
            disabled={saving}
            aria-label="Confirm this badge"
            title="Confirm"
            className="rounded p-0.5 text-green-500 hover:bg-zinc-800"
          >
            <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3,8.5 7,12 13,4.5" />
            </svg>
          </button>
          {hasTiers && (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              disabled={saving}
              aria-label="Edit this badge"
              title="Edit"
              className="rounded p-0.5 text-zinc-300 hover:bg-zinc-800"
            >
              <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2.5l1.5 1.5-8 8H4v-1.5z" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={() => call({ action: "reject" })}
            disabled={saving}
            aria-label="Reject this badge"
            title="Reject"
            className="rounded p-0.5 text-red-500 hover:bg-zinc-800"
          >
            <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="4" x2="12" y2="12" />
              <line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          </button>
        </span>
      </span>
      {editing && hasTiers && catalog?.tiers && (
        <TierPicker
          tiers={catalog.tiers}
          currentLabel={badge.label}
          onCancel={() => setEditing(false)}
          onPick={(label) => call({ action: "edit", editedLabel: label, originalLabel: badge.label })}
        />
      )}
    </span>
  );
}

function TierPicker({
  tiers,
  currentLabel,
  onCancel,
  onPick,
}: {
  tiers: { value: number; label: string }[];
  currentLabel: string;
  onCancel: () => void;
  onPick: (label: string) => void;
}) {
  return (
    <span
      role="dialog"
      className="absolute left-0 top-full mt-1 z-20 rounded-md border border-zinc-700 bg-zinc-900 shadow-xl p-2 min-w-[160px] flex flex-col gap-0.5"
    >
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 px-2 py-1">
        Pick the right value
      </p>
      {tiers.map((t) => (
        <button
          key={t.label}
          type="button"
          onClick={() => onPick(t.label)}
          className={`text-left text-xs px-2 py-1 rounded hover:bg-zinc-800 ${
            t.label === currentLabel ? "text-white font-semibold" : "text-zinc-300"
          }`}
        >
          {t.label}
        </button>
      ))}
      <button
        type="button"
        onClick={onCancel}
        className="text-left text-[10px] uppercase tracking-wider text-zinc-500 px-2 py-1 hover:text-zinc-300"
      >
        Cancel
      </button>
    </span>
  );
}

function AddPicker({
  addable,
  evaluationId,
  onClose,
  onAdded,
}: {
  addable: BadgeCatalogEntry[];
  evaluationId: string;
  onClose: () => void;
  onAdded: (b: Badge) => void;
}) {
  // Group by category for visual scanning.
  const grouped = useMemo(() => {
    const m = new Map<string, BadgeCatalogEntry[]>();
    for (const c of addable) {
      if (!m.has(c.category)) m.set(c.category, []);
      m.get(c.category)!.push(c);
    }
    return [...m.entries()];
  }, [addable]);
  async function pick(entry: BadgeCatalogEntry, label?: string) {
    const res = await fetch("/api/badges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        evaluationId,
        badgeId: entry.id,
        action: "add",
        editedLabel: label ?? entry.defaultLabel,
      }),
    });
    const json = await res.json();
    if (res.ok && json.override) {
      onAdded({
        id: entry.id,
        label: json.override.editedLabel ?? entry.defaultLabel,
        category: entry.category,
        status: json.override.status,
      });
    }
  }
  return (
    <div
      role="dialog"
      className="absolute right-0 top-full mt-1 z-20 rounded-md border border-zinc-700 bg-zinc-900 shadow-xl p-2 w-72 max-h-80 overflow-y-auto"
    >
      <div className="flex items-center justify-between px-2 py-1">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500">
          Add a pill (pending admin review)
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close picker"
          className="text-zinc-500 hover:text-zinc-300 text-xs"
        >
          ✕
        </button>
      </div>
      {grouped.map(([cat, entries]) => (
        <div key={cat} className="mb-1.5">
          <p className="text-[9px] uppercase tracking-wider text-zinc-600 px-2 py-1">
            {cat}
          </p>
          <div className="flex flex-wrap gap-1.5 px-2">
            {entries.map((e) => (
              <PickerEntry key={e.id} entry={e} onPick={pick} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PickerEntry({
  entry,
  onPick,
}: {
  entry: BadgeCatalogEntry;
  onPick: (entry: BadgeCatalogEntry, label?: string) => void;
}) {
  const [tierOpen, setTierOpen] = useState(false);
  const className = `${PILL_BASE} ${PILL_SIZE.xs} ${BADGE_CATEGORY_CLASS[entry.category]} cursor-pointer hover:brightness-110`;
  if (!entry.tiers || entry.tiers.length === 0) {
    return (
      <button type="button" className={className} onClick={() => onPick(entry)}>
        {entry.defaultLabel}
      </button>
    );
  }
  return (
    <span className="relative">
      <button type="button" className={className} onClick={() => setTierOpen((v) => !v)}>
        {entry.defaultLabel} ▾
      </button>
      {tierOpen && (
        <TierPicker
          tiers={entry.tiers}
          currentLabel={entry.defaultLabel}
          onCancel={() => setTierOpen(false)}
          onPick={(label) => { setTierOpen(false); onPick(entry, label); }}
        />
      )}
    </span>
  );
}
