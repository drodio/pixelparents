"use client";

import { useEffect, useState } from "react";
import { sectionUrl } from "@/lib/section-anchors";

// Wires the per-section deep-link behavior for any page that renders
// `.section-anchor` links (docs pages, the event page). Mount once per page.
//   - Clicking a section's hover link copies its ?section=<label> URL + toasts.
//   - Landing on a ?section= URL smooth-scrolls to and briefly highlights it.
// Section headings/anchors live in server HTML or sibling components, so this
// uses delegated listeners on the document rather than React handlers.
export function SectionAnchors() {
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const anchor = (e.target as Element | null)?.closest?.("a.section-anchor") as HTMLElement | null;
      if (!anchor) return;
      e.preventDefault();
      const label = anchor.getAttribute("data-section") ?? "";
      const url = sectionUrl(label);
      const flash = () => {
        setCopied(label);
        window.setTimeout(() => setCopied(null), 1800);
      };
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(url).then(flash).catch(flash);
      } else {
        flash();
      }
      // Reflect the section in the address bar without navigating/scrolling.
      window.history.replaceState(null, "", url);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    // URLSearchParams decodes "+" back to a space, matching data-section.
    const section = new URLSearchParams(window.location.search).get("section");
    if (!section) return;
    // Defer one frame so client-rendered sections are mounted before we look.
    const id = window.setTimeout(() => {
      const match = Array.from(document.querySelectorAll<HTMLElement>("[data-section]")).find(
        (h) => (h.getAttribute("data-section") ?? "") === section,
      );
      if (!match) return;
      match.scrollIntoView({ behavior: "smooth", block: "start" });
      match.classList.add("docs-section-target");
      window.setTimeout(() => match.classList.remove("docs-section-target"), 1700);
    }, 80);
    return () => window.clearTimeout(id);
  }, []);

  if (!copied) return null;
  return (
    <div
      role="status"
      className="fixed bottom-5 left-1/2 z-30 -translate-x-1/2 rounded-full border border-zinc-700 bg-[#1b1b1b]/95 px-4 py-2 text-sm text-zinc-100 shadow-xl backdrop-blur"
    >
      Link copied to “{copied}”
    </div>
  );
}
