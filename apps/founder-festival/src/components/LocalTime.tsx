// Render a UTC/ISO timestamp in a fixed timezone (Pacific by default).
//
// This used to format with the *viewer's* timezone via toLocaleString(undefined),
// but it sets suppressHydrationWarning — which tells React to KEEP the server's
// first render and NOT patch it on hydration. On Vercel the server's TZ is UTC,
// so the displayed value stayed UTC and never updated to the viewer's clock.
//
// We format with an explicit locale + timeZone instead. That makes the server and
// client renders identical (deterministic, no hydration mismatch) and always shows
// Pacific time, which is what the admin tooling expects. Override `timeZone` per use.
export function LocalTime({
  iso,
  dateStyle = "short",
  timeStyle = "short",
  timeZone = "America/Los_Angeles",
  className,
}: {
  iso: string;
  dateStyle?: "short" | "medium" | "long" | "full";
  timeStyle?: "short" | "medium" | "long" | "full";
  timeZone?: string;
  className?: string;
}) {
  const d = new Date(iso);
  const text = Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-US", { dateStyle, timeStyle, timeZone });
  return (
    <time dateTime={iso} title={iso} className={className}>
      {text}
    </time>
  );
}
