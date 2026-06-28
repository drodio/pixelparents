"use client";

import { useEffect, useRef, useState } from "react";
import { FaLinkedin } from "react-icons/fa";
import type { FoundCandidate } from "@/app/api/find-handle/route";
import { ExternalLinkIcon } from "@/components/ExternalLinkIcon";

type Props = {
  // Score this candidate's LinkedIn handle immediately (the white "Check Score"
  // button on each row). Replaces the old click-name-to-fill-the-field flow.
  onScore: (handle: string) => void;
  onClose: () => void;
  // When provided (e.g. arriving via /?name=Jane from a "Score them now" link),
  // the name field is pre-filled and the search runs automatically on mount, so
  // the visitor lands straight on LinkedIn candidates without retyping.
  initialName?: string;
};

const EMAIL = "Founder@Festival.so";
const MAILTO_HREF =
  "mailto:" +
  EMAIL +
  "?subject=" +
  encodeURIComponent("Please add me manually") +
  "&body=" +
  encodeURIComponent(
    "I don't have a LinkedIn profile, but I'd like to have a Founder Festival profile. Here's my information...",
  );

export function FindHandleHelper({ onScore, onClose, initialName }: Props) {
  const [name, setName] = useState(initialName?.trim() ?? "");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<FoundCandidate[] | null>(null);
  // "copied" flash for the email button — many systems (especially Chrome on
  // macOS without a configured default mail app) silently ignore mailto:
  // clicks, so we always also copy the address to the clipboard and tell the
  // user whether it actually worked.
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  async function copyToClipboard(text: string): Promise<boolean> {
    // 1. Modern Clipboard API (requires HTTPS or localhost + user gesture).
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {
        console.warn("[clipboard] navigator.clipboard.writeText failed:", e);
      }
    }
    // 2. Fallback: hidden <textarea> + execCommand("copy"). Works on older
    //    browsers and in some sandboxed iframe situations where the modern
    //    API is unavailable. Deprecated but still ships in all browsers.
    if (typeof document !== "undefined") {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.top = "0";
        ta.setAttribute("readonly", "");
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, text.length);
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (ok) return true;
        console.warn("[clipboard] execCommand('copy') returned false");
      } catch (e) {
        console.warn("[clipboard] execCommand fallback threw:", e);
      }
    }
    return false;
  }
  async function onEmailClick(e: React.MouseEvent) {
    e.preventDefault();
    const ok = await copyToClipboard(EMAIL);
    setCopyState(ok ? "copied" : "failed");
    setTimeout(() => setCopyState("idle"), 3000);
    // Also attempt mailto: in a new window so it doesn't replace the page.
    // For users with a configured mail app this opens the compose window;
    // for users without one the noop is silent.
    try {
      window.open(MAILTO_HREF, "_self");
    } catch {
      // ignore — clipboard fallback already covers them
    }
  }

  async function runSearch(nameValue: string, companyValue: string) {
    const trimmedName = nameValue.trim();
    if (trimmedName.length < 2) return;
    setError(null);
    setCandidates(null);
    setBusy(true);
    try {
      const res = await fetch("/api/find-handle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmedName, company: companyValue.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Search failed");
        return;
      }
      setCandidates(json.candidates ?? []);
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await runSearch(name, company);
  }

  // Auto-run once when arriving with a pre-filled name (the "Score them now"
  // flow). The ref guard keeps React 18 StrictMode's double-mount from firing
  // two identical Exa searches.
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (autoRanRef.current) return;
    const seed = initialName?.trim() ?? "";
    if (seed.length >= 2) {
      autoRanRef.current = true;
      // runSearch sets loading/cleared state synchronously before its first
      // await; that's the intended one-shot kickoff, not a render cascade.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void runSearch(seed, "");
    }
  }, [initialName]);

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
          Find my LinkedIn
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          Close
        </button>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          autoFocus
          className="rounded-md bg-black border border-zinc-800 text-zinc-100 px-3 py-2 text-sm outline-none placeholder:text-zinc-600"
        />
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Company (optional, helps disambiguate)"
          className="rounded-md bg-black border border-zinc-800 text-zinc-100 px-3 py-2 text-sm outline-none placeholder:text-zinc-600"
        />
        <button
          type="submit"
          disabled={busy || name.trim().length < 2}
          className="rounded-md bg-white text-black font-medium py-2 text-sm disabled:opacity-40"
        >
          {busy ? "Searching…" : "Find me"}
        </button>
      </form>

      {error && <div className="text-xs text-red-400">{error}</div>}

      {candidates && candidates.length === 0 && !busy && (
        <div className="text-xs text-zinc-400 leading-relaxed">
          We couldn&apos;t find your LinkedIn profile. Email us instead from a
          verifiable email address (like your work email).{" "}
          <button
            type="button"
            onClick={onEmailClick}
            className={
              copyState === "copied"
                ? "font-mono text-green-400"
                : copyState === "failed"
                  ? "font-mono text-red-400"
                  : "link cursor-pointer"
            }
            title="Click to copy address (also tries to open your mail app)"
          >
            {copyState === "copied"
              ? "✓ Copied"
              : copyState === "failed"
                ? `✗ Couldn't copy. Address: ${EMAIL}`
                : EMAIL}
          </button>
        </div>
      )}

      {candidates && candidates.length > 0 && (
        <>
          <p className="text-xs text-zinc-500 leading-relaxed">
            Tap <span className="text-zinc-300">Check Score</span> to score that
            person, or the LinkedIn icon to open their profile and confirm it&apos;s
            them.
          </p>
          <ul className="flex flex-col gap-1">
            {candidates.map((c) => (
              <li
                key={c.handle}
                className="flex items-stretch gap-1 rounded-md border border-zinc-800 bg-black overflow-hidden hover:border-zinc-600 transition-colors"
              >
                <div className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-zinc-100 truncate">{c.name}</div>
                    {c.headline && (
                      <div className="text-xs text-zinc-400 mt-0.5 line-clamp-2">
                        {c.headline}
                      </div>
                    )}
                    <div className="text-xs text-zinc-600 mt-0.5 truncate">
                      linkedin.com/in/{c.handle}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onScore(c.handle)}
                    className="shrink-0 rounded-md bg-white text-black text-sm font-medium px-3 py-1.5 hover:bg-zinc-200 transition-colors"
                  >
                    Check Score
                  </button>
                </div>
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open this LinkedIn profile in a new tab"
                  title="Open this LinkedIn profile in a new tab"
                  className="group shrink-0 flex items-center gap-1.5 self-stretch border-l border-zinc-800 px-3 hover:bg-zinc-900 transition-colors"
                >
                  <FaLinkedin
                    size={16}
                    className="text-zinc-500 group-hover:text-[#0a66c2] transition-colors"
                  />
                  <span className="text-[#dfa43a]">
                    <ExternalLinkIcon />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

