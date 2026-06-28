type Size = "xs" | "sm" | "md" | "lg";

const SIZE_CLASS: Record<Size, string> = {
  xs: "h-5 w-5 text-[10px]",
  sm: "h-7 w-7 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-base sm:h-16 sm:w-16 sm:text-lg",
};

type Props = {
  imageUrl?: string | null;
  name?: string | null;
  size?: Size;
  // Optional title (hover tooltip) — falls back to the name.
  title?: string;
};

// Avatar — renders the image when present, falls back to a two-letter
// initials chip in the brand gold. Used on /profile (lg) and on the
// leaderboard rows (sm).
export function Avatar({ imageUrl, name, size = "sm", title }: Props) {
  const initials = toInitials(name);
  const tooltip = title ?? name ?? undefined;
  const base = `inline-flex items-center justify-center rounded-full bg-zinc-800 text-zinc-200 font-semibold shrink-0 overflow-hidden border border-zinc-700 ${SIZE_CLASS[size]}`;

  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={imageUrl}
        alt={name ?? "Profile"}
        title={tooltip}
        className={`${base} object-cover`}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span className={base} title={tooltip} aria-label={tooltip}>
      {initials}
    </span>
  );
}

function toInitials(name: string | null | undefined): string {
  if (!name) return "·";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "·";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
