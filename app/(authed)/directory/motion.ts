"use client";

// Shared Framer Motion variants + helpers for the Directory and Community
// surfaces. Centralized so the staggered-reveal / filter-animation rhythm stays
// consistent across the two grids, and so the reduced-motion gate is applied the
// same way everywhere. All consumers wrap these with `useReducedMotion()` and
// fall back to no-op variants when the user has opted out of motion.

import type { Transition, Variants } from "framer-motion";

// A snappy but soft spring used for card hover-lift and the filter pill.
export const SOFT_SPRING: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 34,
  mass: 0.7,
};

// Container that staggers its children in on mount / when the keyed set changes.
export const gridContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.045, delayChildren: 0.02 },
  },
};

// Each card fades + lifts into place; on exit it fades + shrinks slightly so
// AnimatePresence filtering reads as cards leaving rather than hard-cutting.
export const gridItem: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 380, damping: 30, mass: 0.8 },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.18, ease: "easeIn" },
  },
};

// Reduced-motion variants: present/absent only, no transform, near-instant — so
// the same component tree renders without any movement when the user opts out.
export const staticContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0 } },
};

export const staticItem: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.12 } },
  exit: { opacity: 0, transition: { duration: 0.08 } },
};
