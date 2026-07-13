"use client";

import { useState } from "react";
import { IconX, IconChevronRight } from "@/components/icons";

type QA = { q: string; a: string };

// Real Q&As for the help menu's FAQ. Written for OHS families landing in the app
// for the first time. No PII — community contact lives in the GitHub dialog (env).
const FAQS: QA[] = [
  {
    q: "What is GoPixel?",
    a: "GoPixel is a community app for Stanford OHS families — a place to ask for and offer help, find other families in a directory, share events and resources, and build together. It's open source and made by OHS students and parents.",
  },
  {
    q: "Who is it for?",
    a: "Any Stanford OHS family — parents and students alike. Once your family verifies an OHS student, you get full access to the community, directory, events, and resource boards.",
  },
  {
    q: "How do I get verified?",
    a: "Open Verify (from the dashboard prompt or your account) and confirm your student's Stanford OHS email with a one-time code. It takes about a minute and unlocks the full directory and community for your whole family.",
  },
  {
    q: "What's public versus private?",
    a: "Your family's details are private by default. You choose what to share in the Directory, and only verified OHS families can see shared profiles. We never expose children's full names, emails, or contact info to other members.",
  },
  {
    q: "How do I connect with someone?",
    a: "In Community, post an Ask when you need a hand or an Offer when you can give one — the app matches you with another family and opens a private conversation so you can coordinate. You can also browse the Directory to find families who are sharing.",
  },
  {
    q: "How can I contribute or build?",
    a: "GoPixel is open source. Check the Developers area for the API and docs, or open the GitHub option in this help menu to view the code and see how to get involved.",
  },
  {
    q: "How do I join the builder group?",
    a: "Open the GitHub option in this help menu — it has the WhatsApp invite for the builder group and how to message Daniel (DROdio) to be added.",
  },
];

// The FAQ shown from the help menu — an accessible accordion in a dialog.
export function FaqDialog({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Frequently asked questions"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-white/15 bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-semibold text-white">Frequently asked questions</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col divide-y divide-white/10 overflow-y-auto p-2">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium text-white transition-colors hover:bg-white/5"
                >
                  <IconChevronRight
                    className={`h-4 w-4 shrink-0 text-white/40 transition-transform ${
                      isOpen ? "rotate-90" : ""
                    }`}
                  />
                  <span className="flex-1">{item.q}</span>
                </button>
                {isOpen && (
                  <p className="px-3 pb-4 pl-10 text-sm leading-relaxed text-white/65">
                    {item.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
