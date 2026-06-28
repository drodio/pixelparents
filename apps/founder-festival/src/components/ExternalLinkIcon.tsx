// The "open in a new tab" glyph — a box with a diagonal arrow leaving it. Single
// source of truth: use this EVERYWHERE a link opens a new tab, never a bare
// unicode north-east-arrow glyph.
// Inherits color via currentColor; inline-aligned to sit after a text label.
export function ExternalLinkIcon({ size = 12, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
      aria-hidden
      className={`inline-block shrink-0 align-[-0.1em] ${className}`}
    >
      <path d="M6 3.5H3.5v9h9V10" />
      <path d="M9.5 3.5H12.5V6.5" />
      <path d="M12.5 3.5L7.5 8.5" />
    </svg>
  );
}
