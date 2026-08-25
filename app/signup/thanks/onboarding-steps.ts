// Pure step-list builder for the post-signup onboarding wizard (V2 feedback,
// Aug 2026: "the parts of the onboarding essentially need to be broken down
// into different pages and flow through, instead of one continuous webpage").
//
// Kept DB- and React-free so the order — which IS the product spec — can be
// unit-tested: verification comes FIRST (confirm the family is part of OHS via
// the student's OHS email), then the role step, then sharing, then the invite.

export type OnboardingStepKey =
  | "verify"
  | "parent-link"
  | "city"
  | "socials"
  | "interests"
  | "photos"
  | "share"
  | "students"
  | "invite";

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
  // Student flow only: true when the account already sits in a family with a
  // parent (e.g. the student was INVITED by one) — the parent-link step is
  // dropped because there is nothing left to link.
  alreadyLinked?: boolean;
}): OnboardingStep[] {
  const steps: OnboardingStep[] = [
    {
      key: "verify",
      title: opts.isStudent ? "Confirm you're an OHS student" : "Confirm you're part of OHS",
      // No blurb (Aug 18 walkthrough): the title + the two method cards say it
      // all — every extra explainer on this screen was called out as clutter.
      blurb: "",
      // NOT skippable (V2 round 2: "DO NOT let parents or students skip the
      // verification part — that's why it is the first thing they ask"). The
      // step itself decides when the member may advance: a verified code, or
      // choosing the WhatsApp manual path (which proceeds as unverified).
      skippable: false,
    },
    // Round 3 (Aug 17): parents no longer fill out children here at all — they
    // onboard THEMSELVES first, and the optional "Add your student" invite step
    // sits at the END. Round 5 (Aug 24): a student's parent-link moved to the
    // END too (see below) — students complete their own profile first.
    // The member's OWN info, one page each (V2 round 2: "you did not ask them
    // to fill in the information regarding themselves") — and all of it BEFORE
    // the sharing questions, because "how can they share information they did
    // not yet fill out."
    {
      key: "city",
      title: "Where are you located?",
      blurb: "City & state help nearby OHS families find each other.",
      skippable: true,
    },
    {
      key: "socials",
      title: "Connect your profiles",
      blurb: "LinkedIn, GitHub, WeChat, Instagram, X — add the ones you use.",
      skippable: true,
    },
    {
      key: "interests",
      title: "Your interests",
      blurb: "Shared interests are how the directory connects families.",
      skippable: true,
    },
    {
      key: "photos",
      title: "Add a photo or two",
      blurb: "Optional, and it doesn't have to be of you.",
      skippable: true,
    },
    {
      key: "share",
      title: "Choose what you share",
      blurb: "Asked one piece at a time, only about info you actually added.",
      skippable: true,
    },
    // Students only, the VERY LAST step (round 5): link or invite your parent /
    // guardian — after the student's own profile is complete. Invited students
    // (alreadyLinked) never see it.
    ...(opts.isStudent && !opts.alreadyLinked
      ? [
          {
            key: "parent-link",
            title: "Add your parent / guardian",
            blurb:
              "Last step — link to a parent who already has an account, or invite them. This updates by itself the moment they approve.",
            skippable: true,
          } satisfies OnboardingStep,
        ]
      : []),
    // Parents only, LAST before the invite: add your student(s) by name + OHS
    // email — the student finishes their own profile ("adding a child should
    // not be the parent's responsibility to fill in").
    ...(!opts.isStudent
      ? [
          {
            key: "students",
            title: "Add your student(s)",
            blurb:
              "Optional — name and OHS email only. They'll get an email and complete their own profile, already linked to you.",
            skippable: true,
          } satisfies OnboardingStep,
        ]
      : []),
    {
      key: "invite",
      title: "Know another OHS family?",
      blurb: "GoPixel gets better with every family — pass your link along.",
      skippable: true,
    },
  ];
  return steps.filter(
    (s) =>
      // The refer-a-family step is parents-only now (round 5): a student's flow
      // ends on linking their parent, not on recruiting.
      (s.key !== "invite" || (opts.hasReferral && !opts.isStudent)) &&
      (s.key !== "verify" || opts.hasVerify),
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
