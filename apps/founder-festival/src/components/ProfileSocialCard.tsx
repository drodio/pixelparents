"use client";

import { useEffect, useState, type ReactNode } from "react";
import { FaLinkedinIn, FaXTwitter, FaFacebookF, FaRegCopy } from "react-icons/fa6";

export type SocialCardData = {
  imageUrl: string | null;
  name: string;
  // Absolute URL to the profile (for sharing). Null if it couldn't be built.
  profileUrl: string | null;
  founderScore: number;
  investorScore: number;
  rank: number;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "·";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

// Clickable wrapper (avatar or name) that opens a shareable "social card" modal:
// the profile photo + name + scores, with LinkedIn / X / Facebook share buttons
// and a copy-link button.
export function ProfileSocialCard({
  card,
  children,
  className = "",
}: {
  card: SocialCardData;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const url = card.profileUrl ?? "";
  const text = `${card.name} on Founder Festival`;
  const e = encodeURIComponent;
  const shares = url
    ? {
        linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${e(url)}`,
        x: `https://twitter.com/intent/tweet?url=${e(url)}&text=${e(text)}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${e(url)}`,
      }
    : null;

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked; no-op */
    }
  }

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && setOpen(true)}
        className={`cursor-pointer ${className}`}
        aria-label={`Open ${card.name}'s share card`}
      >
        {children}
      </span>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl border border-zinc-700 bg-[#1b1b1b] p-6 shadow-2xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute right-3 top-3 text-zinc-500 hover:text-white"
            >
              ✕
            </button>

            <div className="flex flex-col items-center gap-3 text-center">
              {card.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={card.imageUrl}
                  alt={card.name}
                  referrerPolicy="no-referrer"
                  className="h-28 w-28 rounded-full border border-zinc-700 object-cover"
                />
              ) : (
                <div className="flex h-28 w-28 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-3xl font-semibold text-zinc-300">
                  {initials(card.name)}
                </div>
              )}
              <div className="font-display text-2xl font-bold text-zinc-100">{card.name}</div>
              <div className="flex items-center gap-3 text-sm text-zinc-400">
                <span>
                  Founder <span className="font-semibold text-[#dfa43a]">{card.founderScore}</span>
                </span>
                <span className="text-zinc-600">·</span>
                <span>
                  Investor <span className="font-semibold text-[#dfa43a]">{card.investorScore}</span>
                </span>
              </div>
              <div className="text-xs text-zinc-500">#{card.rank} on the Founder Festival leaderboard</div>
            </div>

            <div className="mt-5 flex items-center justify-center gap-3">
              {shares && (
                <>
                  <ShareBtn href={shares.linkedin} label="Share on LinkedIn">
                    <FaLinkedinIn size={15} />
                  </ShareBtn>
                  <ShareBtn href={shares.x} label="Share on X">
                    <FaXTwitter size={15} />
                  </ShareBtn>
                  <ShareBtn href={shares.facebook} label="Share on Facebook">
                    <FaFacebookF size={15} />
                  </ShareBtn>
                </>
              )}
              <button
                type="button"
                onClick={copy}
                aria-label="Copy profile link"
                title="Copy link"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
              >
                <FaRegCopy size={15} />
              </button>
            </div>
            <div className="mt-2 h-4 text-center text-xs text-emerald-400">{copied ? "Link copied!" : ""}</div>
          </div>
        </div>
      )}
    </>
  );
}

function ShareBtn({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
    >
      {children}
    </a>
  );
}
