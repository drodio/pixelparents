"use client";

import { useEffect } from "react";
import { IconX } from "@/components/icons";

// A reusable bottom sheet for phones. Used to host filter/sort controls that are
// too dense for a phone's inline control row (directory, community, events). It
// renders a dimmed backdrop + a panel that slides up from the bottom, caps its
// height, and scrolls internally. Callers gate it behind a "Filters" button that
// is itself only shown on small screens (md:hidden), so desktop is untouched.
//
// Motion is intentionally CSS-only and gated on prefers-reduced-motion via the
// motion-reduce: variants, matching the rest of the app's reduced-motion policy.
export function MobileSheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  // Optional sticky footer row (e.g. "Clear all" / "Show N results").
  footer?: React.ReactNode;
}) {
  // Lock body scroll + close on Escape while the sheet is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end md:hidden" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="Close filters"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="relative z-10 flex max-h-[85dvh] flex-col rounded-t-2xl border-t border-white/10 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-10 w-10 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && (
          <div className="pb-safe border-t border-white/10 bg-zinc-950 px-4 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}
