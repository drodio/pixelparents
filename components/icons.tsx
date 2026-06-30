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

// Clock — "pending / under review".
export function IconClock(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5l3.3 2" />
    </Icon>
  );
}

// Pencil — edit a post (creator-only control on the Exchange).
export function IconPencil(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 20h4l10-10-4-4L4 16v4z" />
      <path d="M13.5 6.5l4 4" />
    </Icon>
  );
}

// Trash can — delete a post (creator-only, behind a confirm dialog).
export function IconTrash(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V4.5h6V7" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </Icon>
  );
}

// --- Dashboard navigation ---------------------------------------------------

// Grid of four tiles — the dashboard / overview.
export function IconGrid(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
    </Icon>
  );
}

// House — the family hub (your own family: you, co-parents, kids). Distinct from
// IconUsers (the directory of OTHER families).
export function IconHome(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M5.5 10v9.5h13V10" />
      <path d="M9.5 19.5v-5.5h5v5.5" />
    </Icon>
  );
}

// Two people — the family directory.
export function IconUsers(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 5.7" />
      <path d="M17.6 14.2c2 .6 3.4 2.3 3.4 4.8" />
    </Icon>
  );
}

// Globe — the community map.
export function IconGlobe(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.6 2.5 3.9 5.7 3.9 9s-1.3 6.5-3.9 9c-2.6-2.5-3.9-5.7-3.9-9S9.4 5.5 12 3Z" />
    </Icon>
  );
}

// Angle brackets — the developer / API area.
export function IconCode(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 8 5 12l4 4" />
      <path d="M15 8l4 4-4 4" />
    </Icon>
  );
}

// Calendar — the Events tab. A grid with a header bar + two hanging tabs.
export function IconCalendar(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M7.5 13h2M11 13h2M14.5 13h2M7.5 16.5h2M11 16.5h2" />
    </Icon>
  );
}

// Map pin — an in-person event's location marker.
export function IconMapPin(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 21s7-5.5 7-11a7 7 0 0 0-14 0c0 5.5 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </Icon>
  );
}

// Video camera — an online event marker.
export function IconVideo(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="6.5" width="12" height="11" rx="2" />
      <path d="M15 10.5l6-3.5v10l-6-3.5" />
    </Icon>
  );
}

// Plus — "new event" / add control.
export function IconPlus(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

// Star — "interested" RSVP.
export function IconStar(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4l2.3 4.9 5.2.6-3.9 3.6 1.1 5.1L12 16.9 7.2 18.8l1.1-5.1L4.4 10l5.2-.6L12 4Z" />
    </Icon>
  );
}

// Padlock — a locked / sign-in-required nav item. Shown beside grayed tabs when
// the dashboard renders in its signed-out (unauthenticated) mode.
export function IconLock(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      <path d="M12 14.5v2" />
    </Icon>
  );
}

// Sliders — account / settings.
export function IconSettings(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h9" />
      <path d="M17 7h3" />
      <circle cx="15" cy="7" r="2" />
      <path d="M4 12h3" />
      <path d="M11 12h9" />
      <circle cx="9" cy="12" r="2" />
      <path d="M4 17h7" />
      <path d="M15 17h5" />
      <circle cx="13" cy="17" r="2" />
    </Icon>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h13" />
      <path d="M12 6l6 6-6 6" />
    </Icon>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 6l6 6-6 6" />
    </Icon>
  );
}

// "in" mark in a rounded square — a LinkedIn link. Drawn in the house stroke
// style (currentColor) rather than the brand blue glyph so it matches the set.
export function IconLinkedin(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M7 10v7" />
      <path d="M7 7v.01" />
      <path d="M11 17v-4a2 2 0 0 1 4 0v4" />
      <path d="M11 13v4" />
    </Icon>
  );
}

// The GitHub "octocat" silhouette, simplified to a single filled path so the
// link is recognizable at small sizes. Fills with currentColor.
export function IconGithub(props: IconProps) {
  return (
    <Icon fill="currentColor" stroke="none" {...props}>
      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48l-.01-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.56 9.56 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85l-.01 2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
    </Icon>
  );
}

// Hamburger / menu — three stacked bars. Used for the mobile nav drawer trigger.
export function IconMenu(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Icon>
  );
}

// Sliders / filter control — used for the mobile "Filters" sheet trigger.
export function IconFilter(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </Icon>
  );
}
