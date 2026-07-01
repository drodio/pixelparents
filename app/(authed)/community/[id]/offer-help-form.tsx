"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconX, IconPlus, IconClock } from "@/components/icons";
import { ASK_OFFER_MAX } from "@/lib/ask-validate";
import { MAX_SLOTS } from "@/lib/community-schedule";
import { ASK_PROPOSES, type AskKind } from "@/lib/db/asks";
import { MentionInput } from "../mention-input";
import { respondToAskAction } from "../actions";

const PROPOSE_LABEL: Record<(typeof ASK_PROPOSES)[number], string> = {
  async: "Async advice",
  zoom: "A short Zoom call",
  dinner: "Meet over a meal",
  other: "Something else",
};

const controlCls =
  "w-full rounded-md border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-amber-400/50";

// Respond to a post. Wording flips with the post's direction: on an Ask you OFFER
// to help; on an Offer you REQUEST it. The underlying action + storage are the
// same (ask_responses). Enriched with: @-mentions in the message, optional
// scheduling slots (1-3 specific date/times to propose), and an optional EA email
// to CC on the intro when accepted. `datetime-local` values are sent as-is and
// resolved server-side (Date.parse honors the local offset the browser encodes).
export function OfferHelpForm({ askId, kind }: { askId: string; kind: AskKind }) {
  const router = useRouter();
  const isOffer = kind === "offer";
  const [offer, setOffer] = useState(""); // marker string from MentionInput
  const [proposes, setProposes] = useState<(typeof ASK_PROPOSES)[number]>("async");
  const [slots, setSlots] = useState<string[]>([]); // datetime-local values
  const [eaEmail, setEaEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const addSlot = () => {
    if (slots.length >= MAX_SLOTS) return;
    setSlots((prev) => [...prev, ""]);
  };
  const setSlot = (i: number, val: string) =>
    setSlots((prev) => prev.map((s, idx) => (idx === i ? val : s)));
  const removeSlot = (i: number) => setSlots((prev) => prev.filter((_, idx) => idx !== i));

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await respondToAskAction({
          askId,
          offer,
          proposes,
          // Convert each datetime-local value to an ISO instant so the server gets
          // an unambiguous time. Blank rows are dropped server-side too.
          slots: slots
            .filter((s) => s.trim())
            .map((s) => {
              const d = new Date(s);
              return Number.isFinite(d.getTime()) ? d.toISOString() : s;
            }),
          eaEmail: eaEmail.trim() || null,
        });
        if (res.ok) {
          router.refresh();
        } else {
          setError(res.error);
        }
      } catch {
        // A thrown action must not crash to the error boundary — the response may
        // have been recorded. Show a recoverable notice.
        setError(
          "Something went wrong while sending — your response may have gone through. Refresh to check.",
        );
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
        <span className="text-sm font-medium text-white/80">
          {isOffer ? "Why are you interested?" : "How can you help?"}
        </span>
        <MentionInput
          value={offer}
          onChange={setOffer}
          rows={3}
          maxLength={ASK_OFFER_MAX}
          placeholder={
            isOffer
              ? "A sentence or two on what you're looking for."
              : "A sentence or two on how you can help."
          }
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

      {/* Optional scheduling: propose up to 3 specific date/time options. */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-white/80">
          Propose times <span className="font-normal text-white/45">(optional)</span>
        </span>
        {slots.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <IconClock className="h-4 w-4 shrink-0 text-white/40" />
            <input
              type="datetime-local"
              value={s}
              onChange={(e) => setSlot(i, e.target.value)}
              className={`${controlCls} max-w-xs`}
            />
            <button
              type="button"
              onClick={() => removeSlot(i)}
              aria-label="Remove time option"
              className="text-white/40 transition hover:text-red-300"
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>
        ))}
        {slots.length < MAX_SLOTS && (
          <button
            type="button"
            onClick={addSlot}
            className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/[0.08]"
          >
            <IconPlus className="h-3.5 w-3.5" /> Add a time option
          </button>
        )}
      </div>

      {/* Optional EA email — CC'd on the intro email if this response is accepted. */}
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white/80">
          Assistant email to CC{" "}
          <span className="font-normal text-white/45">(optional)</span>
        </span>
        <input
          type="email"
          value={eaEmail}
          onChange={(e) => setEaEmail(e.target.value)}
          placeholder="assistant@example.com"
          className={`${controlCls} max-w-sm`}
        />
        <span className="text-[11px] text-white/35">
          If you connect, we&apos;ll CC this address on the intro email so your assistant can
          help schedule.
        </span>
      </label>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-50"
        >
          {pending ? "Sending…" : isOffer ? "Request this" : "Send offer"}
        </button>
      </div>
    </form>
  );
}
