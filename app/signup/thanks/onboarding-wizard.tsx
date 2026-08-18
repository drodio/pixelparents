"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { OnboardingStep } from "./onboarding-steps";
import { clampForward, stepIndexFor } from "./onboarding-steps";
import { OnboardingGateContext } from "./onboarding-gate";

// Paged shell for the post-signup onboarding (V2 feedback, Aug 2026): each part
// of finishing your account is its own page with Continue / Skip, instead of one
// continuous webpage.
//
// Composition contract: the server page renders one child per step, in the same
// order as `steps`. ALL children stay mounted — hidden steps use the `hidden`
// attribute — so the forms inside keep their state and autosave behaviour when
// the member moves back and forth. Only the visible one is interactive.
//
// The current step lives in ?step=<key> (replace, not push, so Back leaves the
// signup funnel rather than walking the wizard) which makes refresh resume on
// the same page and lets other surfaces deep-link a specific step.
export function OnboardingWizard({
  steps,
  finishHref,
  children,
}: {
  steps: OnboardingStep[];
  // Where "Finish" lands — the status-aware welcome screen, same destination the
  // single-page flow's Finish button used.
  finishHref: string;
  children: React.ReactNode[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [index, setIndex] = useState(() => stepIndexFor(steps, searchParams.get("step")));

  // Stamp ?step= into the URL immediately on mount. The page uses a present
  // ?step= as "I'm inside the wizard" — without this, an autosave on the FIRST
  // step (before any navigation) could re-render the page into the editing
  // layout mid-flow (the Aug 17 walkthrough bug, first-step variant).
  useEffect(() => {
    if (searchParams.get("step")) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("step", steps[index]?.key ?? steps[0]!.key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Steps whose content reports "not done yet" (today: verification). A blocked
  // step can be entered but not passed — see clampForward.
  const [blockedKeys, setBlockedKeys] = useState<ReadonlySet<string>>(new Set());
  const setBlocked = useCallback((stepKey: string, blocked: boolean) => {
    setBlockedKeys((prev) => {
      if (prev.has(stepKey) === blocked) return prev;
      const next = new Set(prev);
      if (blocked) next.add(stepKey);
      else next.delete(stepKey);
      return next;
    });
  }, []);
  const gate = useMemo(() => ({ setBlocked }), [setBlocked]);

  function go(next: number) {
    let clamped = Math.max(0, Math.min(steps.length - 1, next));
    if (clamped > index) clamped = clampForward(steps, blockedKeys, index, clamped);
    setIndex(clamped);
    const params = new URLSearchParams(searchParams.toString());
    params.set("step", steps[clamped]!.key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: true });
  }

  const step = steps[index]!;
  const last = index === steps.length - 1;
  const currentBlocked = blockedKeys.has(step.key);
  // Furthest dot a forward jump can land on right now (for disabling the rest).
  const maxReachable = clampForward(steps, blockedKeys, index, steps.length - 1);

  return (
    <div>
      {/* Progress: dots + "Step n of N". Buttons, so a member can skip ahead to
          any step directly (V2: "provide an option to skip ahead … each"). */}
      <nav aria-label="Onboarding progress" className="mb-8 flex items-center gap-3">
        <ol className="flex items-center gap-2">
          {steps.map((s, i) => {
            const unreachable = i > maxReachable;
            return (
              <li key={s.key}>
                <button
                  type="button"
                  aria-label={`Step ${i + 1}: ${s.title}`}
                  aria-current={i === index ? "step" : undefined}
                  aria-disabled={unreachable || undefined}
                  onClick={() => go(i)}
                  className={`h-2.5 rounded-full transition-all ${
                    i === index
                      ? "w-6 bg-amber-400"
                      : unreachable
                        ? "w-2.5 cursor-not-allowed bg-white/10"
                        : "w-2.5 bg-white/20 hover:bg-white/40"
                  }`}
                />
              </li>
            );
          })}
        </ol>
        <span className="text-xs text-white/50">
          Step {index + 1} of {steps.length}
        </span>
      </nav>

      <header className="mb-6">
        <h2 className="text-xl font-semibold text-white/90 sm:text-2xl">{step.title}</h2>
        <p className="mt-1 text-sm text-white/55">{step.blurb}</p>
      </header>

      <OnboardingGateContext.Provider value={gate}>
        {children.map((node, i) => (
          <div key={steps[i]?.key ?? i} hidden={i !== index}>
            {node}
          </div>
        ))}
      </OnboardingGateContext.Provider>

      <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-white/10 pt-6">
        {index > 0 && (
          <button
            type="button"
            onClick={() => go(index - 1)}
            className="rounded-full border border-white/20 px-5 py-2 text-sm text-white/75 transition hover:bg-white/10"
          >
            ← Back
          </button>
        )}
        {!last ? (
          <>
            <button
              type="button"
              onClick={() => go(index + 1)}
              disabled={currentBlocked}
              className="rounded-full bg-amber-400 px-6 py-2 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continue →
            </button>
            {step.skippable && !currentBlocked && (
              <button
                type="button"
                onClick={() => go(index + 1)}
                className="text-sm text-white/50 underline underline-offset-2 transition hover:text-white/80"
              >
                Skip for now
              </button>
            )}
            {currentBlocked && (
              <span className="text-sm text-white/50">
                Complete this step to continue.
              </span>
            )}
          </>
        ) : (
          <a
            href={finishHref}
            className="rounded-full bg-amber-400 px-6 py-2 text-sm font-semibold text-black transition hover:bg-amber-300"
          >
            Finish →
          </a>
        )}
      </div>
    </div>
  );
}
