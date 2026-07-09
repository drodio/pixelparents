"use client";

import { IconX, IconGithub } from "@/components/icons";

// The public repo URL — safe to hardcode (it's a public open-source repo, not PII).
const REPO_URL = "https://github.com/drodio/pixelparents";

// Community contact channels come ENTIRELY from env (PUBLIC repo — never hardcode
// a personal phone number or private link in source):
//   - NEXT_PUBLIC_DRODIO_WHATSAPP_URL: the builder-group WhatsApp invite (a wa.me
//     link). This is the same env the rest of the app already uses.
//   - NEXT_PUBLIC_DRODIO_PHONE: Daniel's number to message to be added. GRACEFUL
//     FALLBACK: if unset, we omit the number entirely and just show the WhatsApp
//     link — the copy still makes sense without it.
const WHATSAPP_URL = process.env.NEXT_PUBLIC_DRODIO_WHATSAPP_URL;
const DRODIO_PHONE = process.env.NEXT_PUBLIC_DRODIO_PHONE;

// The "open source / built by the community" dialog opened from the help menu's
// GitHub strip. Explains the project, features the WhatsApp builder group, tells
// people to message Daniel to be added (showing his number only when the env is
// set), and links the repo.
export function GithubDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="About the GoPixel open-source project"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-md rounded-2xl border border-white/15 bg-zinc-900 p-6 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <span className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white">
              <IconGithub className="h-5 w-5" />
            </span>
            <h2 className="text-lg font-semibold text-white">Built in the open</h2>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm text-white/65">
          GoPixel is open source — designed and built by students and
          parents in the Stanford OHS community. Anyone in the community can jump
          in, propose an idea, and ship it.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          {WHATSAPP_URL && (
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.07] px-4 py-3 text-sm font-medium text-emerald-200 transition hover:bg-emerald-400/[0.12]"
            >
              <span>Join the builder group on WhatsApp</span>
              <span aria-hidden="true">→</span>
            </a>
          )}

          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/65">
            Want in? Message{" "}
            <span className="font-medium text-white">Daniel (DROdio)</span> to be
            added
            {DRODIO_PHONE ? (
              <>
                {" "}
                at{" "}
                <a
                  href={`tel:${DRODIO_PHONE}`}
                  className="font-medium text-amber-300 underline-offset-2 hover:underline"
                >
                  {DRODIO_PHONE}
                </a>
              </>
            ) : null}
            .
          </div>

          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-3 rounded-xl border border-white/15 px-4 py-3 text-sm font-medium text-white/85 transition hover:bg-white/5"
          >
            <span className="flex items-center gap-2">
              <IconGithub className="h-4 w-4" />
              View the code on GitHub
            </span>
            <span aria-hidden="true">→</span>
          </a>
        </div>
      </div>
    </div>
  );
}
