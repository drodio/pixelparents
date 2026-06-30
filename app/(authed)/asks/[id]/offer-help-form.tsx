"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ASK_OFFER_MAX } from "@/lib/ask-validate";
import { ASK_PROPOSES } from "@/lib/db/asks";
import { respondToAskAction } from "../actions";

const PROPOSE_LABEL: Record<(typeof ASK_PROPOSES)[number], string> = {
  async: "Async advice",
  zoom: "A short Zoom call",
  dinner: "Meet over a meal",
  other: "Something else",
};

const controlCls =
  "w-full rounded-md border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-amber-400/50";

export function OfferHelpForm({ askId }: { askId: string }) {
  const router = useRouter();
  const [offer, setOffer] = useState("");
  const [proposes, setProposes] = useState<(typeof ASK_PROPOSES)[number]>("async");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await respondToAskAction({ askId, offer, proposes });
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex max-w-2xl flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white/80">How can you help?</span>
        <textarea
          value={offer}
          onChange={(e) => setOffer(e.target.value)}
          maxLength={ASK_OFFER_MAX}
          rows={3}
          placeholder="A sentence or two on how you can help."
          className={controlCls}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white/80">Proposed format</span>
        <select
          value={proposes}
          onChange={(e) => setProposes(e.target.value as (typeof ASK_PROPOSES)[number])}
          className={controlCls}
        >
          {ASK_PROPOSES.map((p) => (
            <option key={p} value={p}>
              {PROPOSE_LABEL[p]}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send offer"}
        </button>
      </div>
    </form>
  );
}
