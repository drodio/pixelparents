"use client";

import { useState } from "react";
import { IconCheck } from "@/components/icons";

export function ChangelogSubscribe() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  // "invalid" = client-side email regex failed (edit the address).
  // "failed"  = the request reached the network but the server/connection
  //             failed — the email may be fine, so prompt a retry, not an edit.
  const [status, setStatus] = useState<
    "idle" | "loading" | "done" | "invalid" | "failed"
  >("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setStatus("invalid");
      return;
    }
    setStatus("loading");
    try {
      const res = await fetch("/api/changelog/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setStatus(res.ok ? "done" : "failed");
    } catch {
      setStatus("failed");
    }
  }

  if (status === "done") {
    return (
      <p className="inline-flex items-center gap-1.5 text-sm text-emerald-300">
        <IconCheck className="h-4 w-4" /> Subscribed — we&apos;ll email you new updates.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-black transition hover:bg-amber-300"
      >
        Subscribe
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input
        type="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (status === "invalid" || status === "failed") setStatus("idle");
        }}
        placeholder="you@example.com"
        autoFocus
        className="w-56 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/40"
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-60"
      >
        {status === "loading" ? "…" : "Subscribe"}
      </button>
      {status === "invalid" && (
        <span className="text-xs text-red-400">Enter a valid email.</span>
      )}
      {status === "failed" && (
        <span className="text-xs text-red-400">
          Something went wrong — please try again.
        </span>
      )}
    </form>
  );
}
