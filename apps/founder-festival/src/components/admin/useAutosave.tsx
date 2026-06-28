"use client";

import { useRef, useState } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

// Tiny autosave helper for admin editors. Components pass a save thunk that
// returns whether it succeeded. `schedule` debounces (for typing); `saveNow`
// fires immediately (for toggles / blur). A generation token ignores stale
// responses so the last edit always wins.
export function useAutosave(delay = 700) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gen = useRef(0);
  const fnRef = useRef<(() => Promise<boolean>) | null>(null);

  async function run() {
    const fn = fnRef.current;
    if (!fn) return;
    const my = ++gen.current;
    setStatus("saving");
    try {
      const ok = await fn();
      if (gen.current === my) setStatus(ok ? "saved" : "error");
    } catch {
      if (gen.current === my) setStatus("error");
    }
  }

  function schedule(fn: () => Promise<boolean>) {
    fnRef.current = fn;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(run, delay);
  }

  function saveNow(fn: () => Promise<boolean>) {
    fnRef.current = fn;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    void run();
  }

  return { status, schedule, saveNow };
}

export function AutosaveStatus({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  const text =
    status === "saving" ? "Saving…" : status === "saved" ? "Saved ✓" : "Couldn’t save — try again";
  return (
    <span className={`text-xs ${status === "error" ? "text-red-400" : "text-zinc-500"}`}>{text}</span>
  );
}
