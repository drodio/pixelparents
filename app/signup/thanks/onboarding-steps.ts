// Pure step-list builder for the post-signup onboarding wizard (V2 feedback,
// Aug 2026: "the parts of the onboarding essentially need to be broken down
// into different pages and flow through, instead of one continuous webpage").
//
// Kept DB- and React-free so the order — which IS the product spec — can be
// unit-tested: verification comes FIRST (confirm the family is part of OHS via
// the student's OHS email), then the role step, then sharing, then the invite.

export type OnboardingStepKey = "verify" | "children" | "parent-link" | "share" | "invite";

export type OnboardingStep = {
  key: OnboardingStepKey;
  title: string;
  // Shown under the title; role-aware wording.
  blurb: string;
  // Skippable steps show "Skip for now" next to Continue. Verification is
  // skippable too (the platform nudges elsewhere) — required=false everywhere is
  // deliberate: V2 asks every step to be individually skippable.
  skippable: boolean;
};

export function buildOnboardingSteps(opts: {
  isStudent: boolean;
  hasReferral: boolean;
  // False when the verify panel has nothing to render (no verify state
  // available) — the step is dropped rather than shown empty.
  hasVerify: boolean;
}): OnboardingStep[] {
  const steps: OnboardingStep[] = [
    {
      key: "verify",
      title: opts.isStudent ? "Confirm you're an OHS student" : "Confirm you're part of OHS",
      blurb: opts.isStudent
        ? "We'll email a code to your OHS student email."
        : "Enter your child's OHS student email and we'll send it a code — that's how we keep GoPixel to real OHS families. You'll need the code from their inbox.",
      // NOT skippable (V2 round 2: "DO NOT let parents or students skip the
      // verification part — that's why it is the first thing they ask"). The
      // step itself decides when the member may advance: a verified code, or
      // choosing the WhatsApp manual path (which proceeds as unverified).
      skippable: false,
    },
    opts.isStudent
      ? {
          key: "parent-link",
          title: "Add your parent / guardian",
          blurb: "Invite them, or link to a parent who already has an account.",
          skippable: true,
        }
      : {
          key: "children",
          title: "Tell us about your child(ren)",
          blurb: "Optional — you can add or edit them any time from your Family page.",
          skippable: true,
        },
    {
      key: "share",
      title: "Choose what you share",
      blurb: "Nothing is shared until you say so, and every field is opt-in.",
      skippable: true,
    },
    {
      key: "invite",
      title: "Know another OHS family?",
      blurb: "GoPixel gets better with every family — pass your link along.",
      skippable: true,
    },
  ];
  return steps.filter(
    (s) =>
      (s.key !== "invite" || opts.hasReferral) && (s.key !== "verify" || opts.hasVerify),
  );
}

// Resolve a ?step= query value to a valid index in `steps` (default: first).
export function stepIndexFor(steps: OnboardingStep[], key: string | null | undefined): number {
  if (!key) return 0;
  const i = steps.findIndex((s) => s.key === key);
  return i >= 0 ? i : 0;
}

// Furthest index a forward move from `from` toward `to` may actually reach,
// given the set of currently-blocked step keys. The rule: a blocked step may be
// ENTERED but never PASSED — so a jump lands on the first blocked step in the
// way, and a blocked CURRENT step pins you where you are. Backward moves are
// never clamped (call sites only use this when to > from).
export function clampForward(
  steps: OnboardingStep[],
  blockedKeys: ReadonlySet<string>,
  from: number,
  to: number,
): number {
  for (let i = from; i < to && i < steps.length; i++) {
    if (blockedKeys.has(steps[i]!.key)) return i;
  }
  return to;
}
