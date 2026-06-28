"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EvalProgress } from "./EvalProgress";
import { FindHandleHelper } from "./FindHandleHelper";
import { EVAL_STEPS, buildScoreTally, buildFoundIdentities, type TallyItem } from "@/lib/eval-steps";
import { parseNameParam } from "@/lib/score-them";

type Props = {
  onUrlFocus?: () => void;
  onUrlBlur?: () => void;
};

function extractLinkedinHandle(input: string): string {
  let s = input.trim();
  s = s.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  const m = s.match(/linkedin\.com\/in\/(.+)/i);
  if (m) s = m[1];
  return s.split(/[/?#]/)[0];
}

export function SplashForm({ onUrlFocus, onUrlBlur }: Props = {}) {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [evalDone, setEvalDone] = useState(false);
  const [tally, setTally] = useState<TallyItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [helperVisible, setHelperVisible] = useState(false);
  const [helperOpen, setHelperOpen] = useState(false);
  const [helperInitialName, setHelperInitialName] = useState<string | undefined>(undefined);
  const [submitHover, setSubmitHover] = useState(false);
  const nextPathRef = useRef<string | null>(null);
  const helperOpenRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Set true only on the ?name= arrival so we scroll the helper into view once
  // it opens. Manual "Help me find my LinkedIn handle" clicks don't scroll —
  // the user already chose to open it and knows where it is.
  const scrollToHelperRef = useRef(false);
  const helperRef = useRef<HTMLDivElement>(null);

  // Autofocus the handle field on desktop only. On touch devices (phones,
  // tablets) focusing on load pops the on-screen keyboard and hides the page
  // before the visitor has seen it — and on iOS it triggers Safari's zoom.
  // `(hover: hover) and (pointer: fine)` is true for mouse/trackpad desktops
  // and false for touch, so phones/tablets keep the keyboard down until tap.
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches
    ) {
      inputRef.current?.focus();
    }
  }, []);

  // "Score them now" entry point: arriving at /?name=Jane (from a header/
  // leaderboard search that found no scored profile) pre-fills the name and
  // opens the find-my-LinkedIn helper, which auto-runs the candidate search.
  // Read from window.location rather than useSearchParams() to avoid forcing a
  // Suspense boundary around the homepage for this client-only behavior.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const n = parseNameParam(window.location.search);
    if (n) {
      scrollToHelperRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHelperInitialName(n);
      openHelper();
    } else if (new URLSearchParams(window.location.search).get("find") === "1") {
      // "Check My Score" CTA (e.g. the /events upcoming gate for anonymous
      // visitors): open the find-my-LinkedIn helper ready for them to type their
      // name. No name → the helper just shows its empty search form.
      scrollToHelperRef.current = true;
      openHelper();
    }
  }, []);

  // When the helper opens via the ?name= flow, scroll it into view so the
  // visitor lands on the "Find my LinkedIn" search + candidate list rather than
  // the headline/handle input above it.
  useEffect(() => {
    if (helperOpen && scrollToHelperRef.current) {
      scrollToHelperRef.current = false;
      // Defer a frame so the helper has painted before we scroll to it.
      requestAnimationFrame(() => {
        helperRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [helperOpen]);

  function openHelper() {
    helperOpenRef.current = true;
    setHelperOpen(true);
    setHelperVisible(true);
  }
  function closeHelper() {
    helperOpenRef.current = false;
    setHelperOpen(false);
    setHelperVisible(false);
  }
  function handleUrlFocus() {
    setHelperVisible(true);
    onUrlFocus?.();
  }
  function handleUrlBlur() {
    // Delay so a click on the helper link can register before we hide it.
    setTimeout(() => {
      if (!helperOpenRef.current) setHelperVisible(false);
    }, 150);
    onUrlBlur?.();
  }
  // Score a candidate straight from the "Find my LinkedIn" results: fill the
  // handle (so the field reflects what's scoring) and kick off the eval. The
  // eval overlay takes over the screen, so we also close the helper underneath.
  function handleScoreCandidate(picked: string) {
    setHandle(picked);
    closeHelper();
    void runEvalForHandle(picked);
  }

  async function submitUrl(e: React.FormEvent) {
    e.preventDefault();
    await runEvalForHandle(handle);
  }

  async function runEvalForHandle(rawHandle: string) {
    setError(null);
    const url = `https://linkedin.com/in/${extractLinkedinHandle(rawHandle)}`;
    setBusy(true);
    setEvalDone(false);
    nextPathRef.current = null;
    setEvaluating(true);
    try {
      const res = await fetch("/api/eval", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ linkedinUrl: url }),
      });
      const json = await res.json();
      if (!res.ok) {
        setEvaluating(false);
        setBusy(false);
        setError(json.error || "Something went wrong");
        return;
      }
      // Already scored (cache hit) — skip the theatrical replay and go straight
      // to the result page; the data was computed on a previous run.
      if (json.cached) {
        // Low-signal and scored profiles both render at /profile now (the page
        // shows a claimable "not enough data" view for low-signal).
        router.push(`/profile?e=${json.evaluationId}`);
        return;
      }
      nextPathRef.current = `/profile?e=${json.evaluationId}`;
      // Confirm the accounts we matched, then narrate the score breakdown as it
      // folds in (both no-op for low-signal).
      setTally([
        ...buildFoundIdentities(json.foundIdentities),
        ...buildScoreTally(json.founderBreakdown, json.investorBreakdown),
      ]);
      setEvalDone(true);
    } catch {
      setEvaluating(false);
      setBusy(false);
      setError("Network error — please try again");
    }
  }

  function handleAllProgressDone() {
    if (nextPathRef.current) router.push(nextPathRef.current);
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch("/api/redeem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: code.trim() }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setError(json.error || "Invalid code"); return; }
    router.push(`/profile?e=${json.evaluationId}`);
  }

  if (evaluating) {
    // Use a fixed-position overlay so the progress panel owns the whole
    // viewport and scrolls cleanly when the step list is taller than
    // the screen. The parent splash layout uses justify-center +
    // overflow-hidden, which clips the top of tall progress lists on
    // shorter viewports (laptops, browsers with DevTools open, etc.).
    return (
      <div className="fixed inset-0 z-40 bg-[#151515] overflow-y-auto flex items-start sm:items-center justify-center p-6 sm:p-8">
        <div className="w-full max-w-md flex flex-col gap-6 my-auto py-8">
          <a
            href="/?home=1"
            aria-label="Founder Festival home"
            className="self-center opacity-90 hover:opacity-100 transition-opacity"
          >
            <img
              src="/images/founder-festival-logo.png"
              alt="Founder Festival"
              width={498}
              height={444}
              className="w-[72px] h-auto"
            />
          </a>
          <div className="flex flex-col gap-2">
            <div className="text-lg sm:text-xl font-bold text-white">
              Deploying agents to score you for membership
            </div>
            <div className="text-xs text-zinc-500">
              This usually takes about a minute.
            </div>
          </div>
          <div className="rounded-md border border-zinc-800 bg-black p-5">
            <EvalProgress
              steps={EVAL_STEPS}
              done={evalDone}
              onAllDone={handleAllProgressDone}
              finale={tally}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    // relative z-10 so the form paints ABOVE the splash cover image, which is
    // an absolutely-positioned h-[60vh] element. Without this, on tall
    // viewports the cover image's solid-dark gradient bottom overlaps (clips)
    // the "Do you Qualify for Membership?" heading.
    <div className="relative z-10 w-full max-w-md flex flex-col gap-6">
      <form onSubmit={submitUrl} className="flex flex-col gap-2">
        <label className="text-lg sm:text-xl font-bold text-white">
          Which Events Do You Qualify For?
        </label>
        <div className="input-glow flex flex-col sm:flex-row sm:items-stretch border border-zinc-800 rounded-md overflow-hidden bg-black">
          <span className="px-3 pt-3 pb-1 sm:py-3 text-zinc-500 select-none sm:border-r sm:border-zinc-800 text-xs sm:text-sm whitespace-nowrap">
            https://linkedin.com/in/
          </span>
          <input
            ref={inputRef}
            value={handle}
            // Focus is applied via the desktop-only effect above (not the
            // autoFocus attribute) so phones/tablets don't pop the keyboard on
            // load. Calling handleUrlFocus in onChange too ensures the cover
            // image appears on the user's first keystroke even if the focus
            // event was missed. Idempotent — a no-op once already focused.
            onChange={(e) => {
              setHandle(extractLinkedinHandle(e.target.value));
              handleUrlFocus();
            }}
            onFocus={handleUrlFocus}
            onBlur={handleUrlBlur}
            placeholder="your-handle"
            className="flex-1 px-3 pb-3 pt-1 sm:py-3 bg-transparent text-zinc-100 placeholder:text-[#dfa43a] outline-none text-sm"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        {helperVisible && !helperOpen && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={openHelper}
            className="self-center my-3 text-xs text-zinc-400 hover:text-white"
          >
            Help me find my LinkedIn handle
          </button>
        )}
        <div className="flex gap-2">
          {/* Wrapper div catches the mouseenter even when the button itself
              is disabled (disabled buttons block mouse events). When the
              handle field is empty and the user hovers, swap the label to
              tell them to fill the field in. */}
          <div
            className="flex-1 flex"
            onMouseEnter={() => setSubmitHover(true)}
            onMouseLeave={() => setSubmitHover(false)}
          >
            <button
              type="submit"
              disabled={busy || handle.trim() === ""}
              className="flex-1 rounded-md bg-white text-black font-medium py-3 disabled:opacity-40"
            >
              {busy
                ? "Working…"
                : submitHover && handle.trim() === ""
                  ? "Enter your LinkedIn Handle Above"
                  : "Check My Score"}
            </button>
          </div>
          <a
            href="/leaderboard"
            className="rounded-md bg-black border border-zinc-800 hover:border-zinc-600 inline-flex items-center px-4 text-sm font-medium transition-colors"
            style={{ color: "#dfa43a" }}
          >
            Leaderboard
          </a>
          <a
            href="/events"
            className="rounded-md bg-black border border-zinc-800 hover:border-zinc-600 inline-flex items-center px-4 text-sm font-medium transition-colors"
            style={{ color: "#dfa43a" }}
          >
            Events
          </a>
        </div>
      </form>
      {helperOpen && (
        <div ref={helperRef} className="scroll-mt-4">
          <FindHandleHelper
            onScore={handleScoreCandidate}
            onClose={closeHelper}
            initialName={helperInitialName}
          />
        </div>
      )}
      {!showCode ? (
        <button
          onClick={() => setShowCode(true)}
          // Negative margin keeps the visual position identical to the old
          // text-only treatment, while py-2 px-3 expands the tap target so
          // it clears the 32-44px mobile minimum.
          className="text-xs text-zinc-500 hover:text-zinc-300 self-center px-3 py-2 -my-2"
        >
          Have an invite code?
        </button>
      ) : (
        <form onSubmit={submitCode} className="flex flex-col gap-2">
          <label className="text-xs uppercase tracking-[0.2em] text-zinc-500">Invite code</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="rounded-md bg-black border border-zinc-800 text-zinc-100 px-3 py-3 text-sm outline-none"
          />
          <button
            type="submit"
            disabled={busy || code.trim() === ""}
            className="rounded-md bg-white text-black font-medium py-3 disabled:opacity-40"
          >
            Enter
          </button>
        </form>
      )}
      {error && <div className="text-sm text-red-400 text-center">{error}</div>}
    </div>
  );
}
