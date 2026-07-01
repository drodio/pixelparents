"use client";

import Link from "next/link";
import {
  IconSparkles,
  IconChevronRight,
  IconGithub,
  IconLock,
  IconFile,
  IconClock,
} from "@/components/icons";

// A speech-bubble glyph for the feedback strip (mirrors feedback-widget's).
function ChatIcon({ className }: { className?: string }) {
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
      aria-hidden="true"
      className={className}
    >
      <path d="M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 16.5H9l-4 3.5V16.5H4A1.5 1.5 0 0 1 2.5 15V7A1.5 1.5 0 0 1 4 5.5Z" />
      <path d="M7 10h10M7 13h6" />
    </svg>
  );
}

// A circled question mark — the "FAQ" strip glyph.
function HelpIcon({ className }: { className?: string }) {
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
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M9.2 9.2a2.8 2.8 0 0 1 5.4 1c0 1.9-2.8 2.3-2.8 4" />
      <path d="M12 17.5h.01" />
    </svg>
  );
}

// Shared strip styling for both button-strips and link-strips.
const STRIP =
  "flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-sm font-medium text-white/85 transition-colors hover:border-amber-400/30 hover:bg-white/[0.06]";

function StripInner({
  Icon,
  label,
}: {
  Icon: (p: { className?: string }) => React.ReactElement;
  label: string;
}) {
  return (
    <>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-400/15 text-amber-300">
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex-1">{label}</span>
      <IconChevronRight className="h-4 w-4 shrink-0 text-white/30" />
    </>
  );
}

// The stacked-strip help menu content. Purely presentational — the parent
// (HelpButton) owns open state and wires each action's onClick / navigation.
export function HelpMenu({
  onBeginWalkthrough,
  onOpenFaq,
  onOpenFeedback,
  onOpenGithub,
  onNavigate,
  canWalkthrough,
}: {
  onBeginWalkthrough: () => void;
  onOpenFaq: () => void;
  onOpenFeedback: () => void;
  onOpenGithub: () => void;
  // Called after a link strip is clicked so the parent can close the menu.
  onNavigate: () => void;
  // The guided walkthrough only has targets on the md+ desktop layout, so the
  // parent passes false on mobile / narrow windows to hide the entry entirely.
  canWalkthrough: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {canWalkthrough && (
        <button type="button" onClick={onBeginWalkthrough} className={STRIP}>
          <StripInner Icon={IconSparkles} label="Begin walkthrough" />
        </button>
      )}
      <button type="button" onClick={onOpenFaq} className={STRIP}>
        <StripInner Icon={HelpIcon} label="FAQ" />
      </button>
      <Link href="/privacy" onClick={onNavigate} className={STRIP}>
        <StripInner Icon={IconLock} label="Privacy Policy" />
      </Link>
      <Link href="/terms" onClick={onNavigate} className={STRIP}>
        <StripInner Icon={IconFile} label="Terms of Service" />
      </Link>
      <Link href="/changelog" onClick={onNavigate} className={STRIP}>
        <StripInner Icon={IconClock} label="Changelog" />
      </Link>
      <button type="button" onClick={onOpenFeedback} className={STRIP}>
        <StripInner Icon={ChatIcon} label="Send feedback" />
      </button>
      <button type="button" onClick={onOpenGithub} className={STRIP}>
        <StripInner Icon={IconGithub} label="GitHub" />
      </button>
    </div>
  );
}
