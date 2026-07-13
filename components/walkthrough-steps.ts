// Pure step model for the guided walkthrough tour. Kept in its own module (no
// React, no DOM) so the step sequence + navigation math can be unit-tested in
// isolation and so the tour component stays a thin renderer over this data.

export type TourStep = {
  // The data-tour attribute value of the element to spotlight. `null` for steps
  // that show a centered card with no highlight target (intro / outro).
  target: string | null;
  title: string;
  body: string;
};

// The canonical flow. Order matters — this IS the Next/Back sequence:
//   intro → six Explore cards → notifications → feedback → account → outro.
// Targets line up with the data-tour attributes added to the dashboard cards
// (explore-*) and the shell controls (notifications / feedback / account).
export const TOUR_STEPS: TourStep[] = [
  {
    target: null,
    title: "Welcome to GoPixel",
    body: "A quick 60-second tour of the essentials. Use Next and Back to move, or Skip anytime.",
  },
  {
    target: "explore-community",
    title: "Community",
    body: "The two-way help board — post an Ask when you need a hand, or an Offer when you can give one, and get matched with another OHS family.",
  },
  {
    target: "explore-directory",
    title: "Directory",
    body: "Browse verified OHS families and students who are sharing, plus a map of where our community is building.",
  },
  {
    target: "explore-events",
    title: "Events",
    body: "The shared OHS calendar — community-created events alongside the school-year calendar.",
  },
  {
    target: "explore-resources",
    title: "Resources",
    body: "Community resource boards — OHS-only, upvotable collections of links, files, and notes.",
  },
  {
    target: "explore-family",
    title: "Family",
    body: "Manage your own family profile and your verified OHS students.",
  },
  {
    target: "explore-developers",
    title: "Developers",
    body: "Build on the GoPixel API — request a key, read the docs, and ship on top of the community.",
  },
  {
    target: "notifications",
    title: "Notifications",
    body: "Replies, connections, event RSVPs, and board activity land here. The badge shows what's unread.",
  },
  {
    target: "feedback",
    title: "Send feedback",
    body: "Got an idea or hit a snag? This button is always here — tell us anytime and we'll read every note.",
  },
  {
    target: "account",
    title: "Account settings",
    body: "Your account, sign-in, and verification status live here at the bottom of the sidebar.",
  },
  {
    target: null,
    title: "You're all set!",
    body: "That's the tour. Explore at your own pace — and remember the ? button in the corner if you ever need help.",
  },
];

export const TOUR_STORAGE_KEY = "pp:walkthrough-completed:v1";

// Clamp an index into the valid step range. Guards against out-of-range Next/Back
// (and a NaN) so the tour can never index past the ends.
export function clampStep(index: number, total: number = TOUR_STEPS.length): number {
  if (!Number.isFinite(index)) return 0;
  const max = Math.max(0, total - 1);
  return Math.min(Math.max(0, Math.floor(index)), max);
}

export function isFirstStep(index: number): boolean {
  return clampStep(index) === 0;
}

export function isLastStep(index: number, total: number = TOUR_STEPS.length): boolean {
  return clampStep(index, total) === Math.max(0, total - 1);
}

// The label for the primary (advance) button: "Next" mid-tour, "Finish" on the
// last step. Single source of truth so the component and any test agree.
export function primaryLabel(index: number, total: number = TOUR_STEPS.length): string {
  return isLastStep(index, total) ? "Finish" : "Next";
}
