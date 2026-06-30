"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IconX } from "@/components/icons";
import ReportForm from "./report-form";

// "Report a bug or abuse" / contact entry for the landing footer. Renders a small
// text trigger that opens an accessible modal hosting the shared <ReportForm>.
// The form submits to the submitReport server action, which PERSISTS the report
// to the `reports` DB table (triaged from /admin/reports) and best-effort
// notifies real admins — it no longer emails the dead hello@ mailbox. On-theme
// (dark / amber), keyboard + screen-reader friendly.
export default function ReportDialog() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  // Close on Escape; restore focus to the trigger when closing.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    // Move focus into the dialog on open.
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Return focus to the trigger after the dialog closes.
  useEffect(() => {
    if (!open) triggerRef.current?.focus({ preventScroll: true });
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="text-amber-400 underline decoration-amber-400/60 underline-offset-2 transition-colors hover:text-amber-300"
      >
        Report a bug or abuse
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="relative w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-6 text-left shadow-2xl outline-none"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute right-4 top-4 rounded-md p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            >
              <IconX className="h-5 w-5" />
            </button>

            <ReportForm titleId={titleId} onDone={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
