"use client";

import { useState } from "react";
import {
  IconCircleCheck,
  IconArrowRight,
  IconMail,
  IconPhone,
  IconGlobe,
  IconLinkedin,
  IconGithub,
} from "@/components/icons";

// A serializable contact method (mirrors lib/intro.ContactMethod but kept
// client-safe — no node imports cross the boundary). The server derives these
// via the share-honoring reveal logic; this component only RENDERS them.
export type ConnectedMethod = {
  kind: "email" | "phone" | "linkedin" | "github" | "website" | "profile";
  // What to show. For email/phone this is the raw value (also copyable); for
  // links it's a short label ("LinkedIn").
  label: string;
  href: string;
  // The exact text to copy (email address / phone / url). Same as href sans the
  // mailto:/tel: scheme; absent for label-only links where copying the url is fine.
  copy: string;
};

export type ConnectedCardData = {
  // The person you connected WITH, from the viewer's perspective.
  name: string;
  isStudent: boolean;
  // Set when this person is a minor routed through a guardian.
  viaParentName: string | null;
  methods: ConnectedMethod[];
  messageHint: string | null;
  // "They can help with X" context — the post topic + (optionally) the proposed
  // format, so the connected moment carries why you're connected.
  helpWith: string | null;
  // Who initiated which side, for the heading copy.
  youAreAuthor: boolean;
};

const ICONS: Record<ConnectedMethod["kind"], typeof IconMail> = {
  email: IconMail,
  phone: IconPhone,
  linkedin: IconLinkedin,
  github: IconGithub,
  website: IconGlobe,
  profile: IconArrowRight,
};

function CopyRow({ method }: { method: ConnectedMethod }) {
  const [copied, setCopied] = useState(false);
  const Icon = ICONS[method.kind];
  const isLink = method.kind === "linkedin" || method.kind === "github" || method.kind === "website" || method.kind === "profile";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(method.copy || method.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked — the link/mailto still works as a fallback.
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.04] px-3 py-2">
      <a
        href={method.href}
        target={isLink ? "_blank" : undefined}
        rel={isLink ? "noopener noreferrer" : undefined}
        className="inline-flex min-w-0 items-center gap-2 text-sm text-emerald-100 hover:text-white"
      >
        <Icon className="h-4 w-4 shrink-0 text-emerald-300/70" />
        <span className="truncate">{method.label}</span>
      </a>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded-md border border-emerald-400/25 px-2 py-1 text-[11px] font-medium text-emerald-200 transition hover:bg-emerald-400/10"
        aria-label={`Copy ${method.label}`}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

// The "You're connected with X" panel shown on an accepted response to BOTH the
// author and the responder. Reveals only the share-honored contact the server
// derived; for a minor it clearly routes through the parent; if nothing is
// shareable it shows the message-channel hint instead of leaking anything.
export function ConnectedCard({ data }: { data: ConnectedCardData }) {
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-emerald-400/30 bg-gradient-to-b from-emerald-400/[0.10] to-emerald-400/[0.03]">
      <div className="flex items-start gap-3 border-b border-emerald-400/15 px-4 py-3">
        <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-400/15">
          <IconCircleCheck className="h-4 w-4 text-emerald-300" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-emerald-100">
            You&apos;re connected with {data.name}
          </p>
          <p className="mt-0.5 text-xs text-emerald-200/70">
            {data.youAreAuthor
              ? "You accepted — here's how to reach each other."
              : "You were accepted! Here's how to reach each other."}
          </p>
        </div>
      </div>

      <div className="px-4 py-3">
        {data.helpWith && (
          <p className="mb-3 text-sm text-emerald-100/90">
            <span className="text-emerald-300/80">Connecting over:</span> {data.helpWith}
          </p>
        )}

        {data.viaParentName && (
          <p className="mb-3 rounded-lg border border-sky-400/25 bg-sky-400/[0.06] px-3 py-2 text-xs text-sky-100">
            {data.name} is a student. To keep minors safe, reach them through their parent,{" "}
            <span className="font-medium">{data.viaParentName}</span>.
          </p>
        )}

        {data.methods.length > 0 ? (
          <div className="flex flex-col gap-2">
            {data.methods.map((m) => (
              <CopyRow key={`${m.kind}-${m.href}`} method={m} />
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-emerald-400/15 bg-emerald-400/[0.04] px-3 py-2 text-sm text-emerald-100/80">
            {data.messageHint ??
              "Reply on this post to coordinate — they haven't shared direct contact details."}
          </p>
        )}

        <p className="mt-3 text-[11px] text-emerald-200/55">
          We also emailed you both a warm intro. Only what each of you chose to share is revealed.
        </p>
      </div>
    </div>
  );
}
