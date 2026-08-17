"use client";

import { createContext, useContext } from "react";

// Lets a step's CONTENT tell the wizard chrome whether the member may advance
// past it (V2 round 2: verification is not skippable — the code path unlocks
// only on a verified code; the WhatsApp manual path unlocks immediately but the
// member proceeds as unverified).
//
// A context rather than a callback prop because the step nodes are composed on
// the SERVER (page.tsx) and handed to the client wizard as children — a
// function prop can't cross that boundary, a context consumer can.
export type OnboardingGate = {
  // blocked=true → the wizard refuses to move forward past the step with this
  // key (Continue disabled, forward dot-jumps clamped). Steps that never call
  // this are never blocked.
  setBlocked: (stepKey: string, blocked: boolean) => void;
};

export const OnboardingGateContext = createContext<OnboardingGate | null>(null);

// Null outside the wizard (e.g. the same component rendered on /account or the
// editing layout) — consumers must treat that as "no gate to report to".
export function useOnboardingGate(): OnboardingGate | null {
  return useContext(OnboardingGateContext);
}
