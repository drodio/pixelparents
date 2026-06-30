import type { SVGProps } from "react";

// Custom, in-house icon set — hand-drawn on a 24×24 grid so the whole app shares
// one visual language instead of leaning on emoji (which render inconsistently
// across platforms). Stroke icons inherit `currentColor` and size to `1em` by
// default; pass a `className` (e.g. "h-5 w-5") to size them. Decorative by
// default (aria-hidden); pass a `title` to expose an accessible label.

type IconProps = SVGProps<SVGSVGElement> & { title?: string };

function Icon({
  title,
  children,
  ...props
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function IconX(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6 18 18M18 6 6 18" />
    </Icon>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12.5 10 17.5 19 6.5" />
    </Icon>
  );
}

// Check inside a circle — our "verified / approved" mark.
export function IconCircleCheck(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.4 12.4 11 15 15.8 9.3" />
    </Icon>
  );
}

// Mortarboard — "OHS student".
export function IconGradCap(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4 2.5 8.5 12 13l9.5-4.5L12 4Z" />
      <path d="M6.5 10.4V15c0 1.5 2.5 2.8 5.5 2.8s5.5-1.3 5.5-2.8v-4.6" />
      <path d="M21.5 8.5v4.3" />
    </Icon>
  );
}

// Circle with a slash — "blocked / declined".
export function IconBan(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6 18.4 18.4" />
    </Icon>
  );
}

export function IconWarning(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4 21 19H3L12 4Z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </Icon>
  );
}

export function IconPhone(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.5 4.5h3l1.3 3.6-2 1.4a11.5 11.5 0 0 0 5.2 5.2l1.4-2 3.6 1.3v3A1.7 1.7 0 0 1 17.3 20 14.5 14.5 0 0 1 4 6.7 1.7 1.7 0 0 1 6.5 4.5Z" />
    </Icon>
  );
}

export function IconMail(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3.6 7 12 12.5 20.4 7" />
    </Icon>
  );
}

// Filled heart — used for the "made with love" footer.
export function IconHeart(props: IconProps) {
  return (
    <Icon fill="currentColor" stroke="none" {...props}>
      <path d="M12 20.3 4.3 12.6a4.6 4.6 0 0 1 6.4-6.6l1.3 1.2 1.3-1.2a4.6 4.6 0 0 1 6.4 6.6Z" />
    </Icon>
  );
}

// Two sparkles — celebratory accent.
export function IconSparkles(props: IconProps) {
  return (
    <Icon fill="currentColor" stroke="none" {...props}>
      <path d="M11 3.5c.45 3.6 1.65 4.8 5.3 5.25-3.65.45-4.85 1.65-5.3 5.25-.45-3.6-1.65-4.8-5.3-5.25C9.35 8.3 10.55 7.1 11 3.5Z" />
      <path d="M17.7 13.2c.22 1.7.82 2.3 2.55 2.55-1.73.25-2.33.85-2.55 2.55-.22-1.7-.82-2.3-2.55-2.55 1.73-.25 2.33-.85 2.55-2.55Z" />
    </Icon>
  );
}
