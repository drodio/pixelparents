// Status marker shown to the right of the Founder and Investor scores.
//   current → green check   past → gold asterisk   never → red asterisk
// Rendered as small SVGs (not glyphs) so the check and asterisk share the exact
// same stroke weight, and so size/alignment are precise.
//
// Two variants:
//   - "superscript" (default, profile page): half the score's height (0.5em) and
//     raised, so it sits up-and-to-the-right of the big number.
//   - "inline" (leaderboard): the same visual size as the score digits and
//     baseline-aligned, not raised.
// Tooltip pops to the right on hover, on top via z-index. Pure CSS → server component.

type Role = "founder" | "investor";
type Status = "current" | "past" | "never";
type Variant = "superscript" | "inline";

// Shared stroke so the check and asterisk read as the same "pen". Darker green /
// red than the default-500s per design; past stays gold.
const STROKE = 2.25;

const TOOLTIP: Record<Role, Record<Status, string>> = {
  founder: {
    current: "Current founder",
    past: "Past founder",
    never: "Not (yet!) a founder",
  },
  investor: {
    current: "Current investor",
    past: "Past investor",
    never: "Not (yet!) an investor",
  },
};

function MarkerIcon({ status, sizeClass }: { status: Status; sizeClass: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: STROKE,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (status === "current") {
    // Checkmark — darker green. Spans most of the box height so it reads the
    // same visual size as the asterisk.
    return (
      <svg {...common} className={`${sizeClass} text-green-700`}>
        <path d="M3.5 12l6 6.5L20.5 5" />
      </svg>
    );
  }
  // Asterisk (6 rays) — same stroke weight + box fill as the check.
  // red (never) / gold (past).
  return (
    <svg {...common} className={`${sizeClass} ${status === "never" ? "text-red-700" : "text-amber-500"}`}>
      <path d="M12 5v14M6 9l12 6M18 9l-12 6" />
    </svg>
  );
}

export function StatusMarker({
  role,
  status,
  variant = "superscript",
}: {
  role: Role;
  status: Status | null | undefined;
  variant?: Variant;
}) {
  if (!status || !(status === "current" || status === "past" || status === "never")) return null;
  const tip = TOOLTIP[role][status];
  const inline = variant === "inline";
  // inline: ~1.1em so the glyph matches the digit height, baseline-aligned.
  // superscript: half-size and raised.
  const sizeClass = inline ? "h-[1.1em] w-[1.1em]" : "h-[0.55em] w-[0.55em]";
  return (
    <span
      className={`group relative inline-flex cursor-default ${inline ? "ml-1.5 align-middle" : "ml-1"}`}
      style={inline ? undefined : { verticalAlign: "super" }}
      aria-label={tip}
    >
      <MarkerIcon status={status} sizeClass={sizeClass} />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded bg-black/90 px-3 py-1.5 font-sans text-sm font-normal normal-case leading-normal tracking-normal text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
      >
        {tip}
      </span>
    </span>
  );
}
