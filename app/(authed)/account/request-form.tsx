"use client";

import { useActionState } from "react";
import { submitRequest, type RequestState } from "./actions";

const initial: RequestState = {};

export function RequestForm() {
  const [state, formAction, pending] = useActionState(submitRequest, initial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-white/70">What do you want to build?</span>
        <textarea
          name="intended_use"
          required
          maxLength={2000}
          rows={4}
          placeholder="Tell us what you think you want to build. It's also totally okay if you're not sure yet."
          className="rounded-md border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/35 focus:border-emerald-400/60"
        />
      </label>

      {state.error && <p className="text-sm text-red-400">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Request API access"}
      </button>
      <p className="text-xs text-white/40">
        We review every request by hand. You&apos;ll get an email when it&apos;s approved, and your
        key will appear here.
      </p>
    </form>
  );
}
