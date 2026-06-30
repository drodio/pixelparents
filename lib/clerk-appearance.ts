import type { ComponentProps } from "react";
import { SignIn } from "@clerk/nextjs";
import { dark } from "@clerk/themes";

// Single source of truth for how Clerk's hosted UI (sign-in, the UserButton
// popover, "Manage account" modal, etc.) is themed. Clerk ships a light/white
// default that clashes badly with our black/amber app, so every Clerk surface
// imports `clerkAppearance` from here and stays in lockstep.
//
// We start from `@clerk/themes`' `dark` base theme (so unmapped elements still
// read dark instead of falling back to white) and override the palette + the
// primary button to match the app: near-black backgrounds, light text, and the
// amber accent (#fbbf24) used everywhere else in the UI.
//
// Note: this Clerk version (@clerk/nextjs ^7 / @clerk/react) names the base-theme
// slot `theme` (older docs call it `baseTheme`); we use `theme` to match the
// installed API.

// Brand tokens — keep in sync with the amber accent used across the app
// (Tailwind `amber-400` = #fbbf24) and the near-black page background (#0a0a0a,
// matching globals.css's dark `--background`).
const AMBER = "#fbbf24";
const AMBER_HOVER = "#f59e0b"; // amber-500, for button hover
const NEAR_BLACK = "#0a0a0a";
const PANEL = "#111111";

// Type the export off the component prop so it tracks Clerk's Appearance shape
// across versions without depending on an internal type path.
type ClerkAppearance = ComponentProps<typeof SignIn>["appearance"];

export const clerkAppearance: ClerkAppearance = {
  theme: dark,
  variables: {
    colorPrimary: AMBER,
    colorBackground: NEAR_BLACK,
    // Black label on the amber primary button.
    colorPrimaryForeground: "#0a0a0a",
    // Light, legible text on the dark surfaces.
    colorForeground: "#ededed",
    colorMutedForeground: "rgba(237,237,237,0.65)",
    colorInput: "#1a1a1a",
    colorInputForeground: "#ededed",
    // Neutral drives borders/hover fills — light shade for a dark theme.
    colorNeutral: "#ffffff",
    borderRadius: "0.625rem",
  },
  elements: {
    // Panels/cards: lift slightly off the page background with a hairline border.
    card: {
      backgroundColor: PANEL,
      borderColor: "rgba(255,255,255,0.10)",
    },
    // The hosted page wrapper behind the card.
    rootBox: { colorScheme: "dark" },
    // Primary button → amber fill, black label, amber-500 on hover.
    formButtonPrimary: {
      backgroundColor: AMBER,
      color: "#0a0a0a",
      fontWeight: 600,
      "&:hover, &:focus, &:active": { backgroundColor: AMBER_HOVER },
    },
    // Anchor links + the footer "Sign up" action read amber, not blue.
    footerActionLink: {
      color: AMBER,
      "&:hover": { color: AMBER_HOVER },
    },
  },
};
