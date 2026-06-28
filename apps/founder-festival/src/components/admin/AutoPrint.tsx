"use client";

import { useEffect } from "react";

// Opens the browser print dialog once the badge sheet has rendered. The print
// route is opened in a new tab from the event page, so firing print on mount is
// the expected behavior; the user can re-print any time via Cmd/Ctrl+P.
export function AutoPrint() {
  useEffect(() => {
    // A tick after paint so fonts/QR SVGs are in the DOM before the dialog.
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, []);
  return null;
}
