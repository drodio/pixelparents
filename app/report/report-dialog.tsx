"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { IconX, IconCircleCheck } from "@/components/icons";
import { submitReport, type ReportState } from "./actions";

const initialState: ReportState = { ok: false };

const labelCls = "block text-sm font-medium text-white/80";
const inputCls =
  "mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-amber-400/60 focus:ring-1 focus:ring-amber-400/60";

// "Report a bug or abuse" entry for the landing footer. Renders a small text
// trigger that opens an accessible modal with a lightweight form. Submits to the
// submitReport server action, which emails the admin via the existing Resend
// setup (no DB write). On-theme (dark / amber), keyboard + screen-reader friendly.
export default function ReportDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(submitReport, initialState);
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

            {state.ok ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <IconCircleCheck className="h-10 w-10 text-amber-400" />
                <h2 id={titleId} className="text-lg font-semibold text-white">
                  Thanks for the heads up
                </h2>
                <p className="text-sm text-white/60">
                  We&apos;ve passed your report along to the team. We appreciate you
                  helping keep the community safe.
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mt-2 rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-black transition hover:bg-amber-300"
                >
                  Done
                </button>
              </div>
            ) : (
              <form action={formAction} className="flex flex-col gap-4">
                <div>
                  <h2 id={titleId} className="text-lg font-semibold text-white">
                    Report a bug or abuse
                  </h2>
                  <p className="mt-1 text-sm text-white/50">
                    Found something broken or saw something off? Let us know — it
                    goes straight to the team.
                  </p>
                </div>

                <div>
                  <label htmlFor="report-category" className={labelCls}>
                    What kind of report is this?
                  </label>
                  <select
                    id="report-category"
                    name="category"
                    defaultValue="bug"
                    className={inputCls}
                  >
                    <option value="bug">Bug — something is broken</option>
                    <option value="abuse">Abuse — someone or something harmful</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="report-message" className={labelCls}>
                    Details
                  </label>
                  <textarea
                    id="report-message"
                    name="message"
                    rows={4}
                    required
                    maxLength={4000}
                    placeholder="Tell us what happened…"
                    className={`${inputCls} resize-y`}
                  />
                </div>

                <div>
                  <label htmlFor="report-contact" className={labelCls}>
                    Your email{" "}
                    <span className="font-normal text-white/40">(optional)</span>
                  </label>
                  <input
                    id="report-contact"
                    name="contact"
                    type="email"
                    autoComplete="email"
                    placeholder="So we can follow up"
                    className={inputCls}
                  />
                </div>

                {state.error && (
                  <p role="alert" className="text-sm text-red-400">
                    {state.error}
                  </p>
                )}

                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-full px-4 py-2 text-sm font-medium text-white/60 transition-colors hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-60"
                  >
                    {pending ? "Sending…" : "Send report"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
