"use client";

import { useActionState } from "react";
import { IconCircleCheck } from "@/components/icons";
import { submitReport, type ReportState } from "./actions";

const initialState: ReportState = { ok: false };

const labelCls = "block text-sm font-medium text-white/80";
const inputCls =
  "mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-amber-400/60 focus:ring-1 focus:ring-amber-400/60";

// The shared "Report a bug or abuse" / contact form. Used both inside the landing
// footer modal (ReportDialog) and as a standalone /report page that the
// privacy/terms "contact us" copy links to. Submits to the submitReport server
// action, which persists to the `reports` DB table. On-theme (dark / amber).
//
// `titleId` lets the dialog wire up aria-labelledby; `onDone` is called after a
// successful submit (the dialog uses it for a "Done" button to close the modal).
export default function ReportForm({
  titleId,
  onDone,
}: {
  titleId?: string;
  onDone?: () => void;
}) {
  const [state, formAction, pending] = useActionState(submitReport, initialState);

  if (state.ok) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <IconCircleCheck className="h-10 w-10 text-amber-400" />
        <h2 id={titleId} className="text-lg font-semibold text-white">
          Thanks for the heads up
        </h2>
        <p className="text-sm text-white/60">
          We&apos;ve passed your report along to the team. We appreciate you
          helping keep the community safe.
        </p>
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="mt-2 rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-black transition hover:bg-amber-300"
          >
            Done
          </button>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="pr-10">
        <h2 id={titleId} className="text-lg font-semibold text-white">
          Report a bug or abuse
        </h2>
        <p className="mt-1 text-sm text-white/50">
          Found something broken or saw something off? Let us know — it goes
          straight to the team.
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
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="rounded-full px-4 py-2 text-sm font-medium text-white/60 transition-colors hover:text-white"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send report"}
        </button>
      </div>
    </form>
  );
}
