"use client";

import { FiLink } from "react-icons/fi";
import { slugifyHeading, sectionParam } from "@/lib/section-anchors";

// A section heading with a per-section deep link. Renders the heading text plus
// a hover "copy link" icon pointing at ?section=<label>. The copy + scroll
// behavior is wired globally by <SectionAnchors>. Marked "use client" only so it
// can be used inside client components too (it has no interactivity of its own).
//
// `label` is the stable section name used for the id + ?section= link; pass
// `children` to render different display text (e.g. "Personalized Learnings for
// Jon" while the link stays ?section=Personalized+Learnings).
export function SectionHeading({
  label,
  children,
  as: Tag = "h2",
  className,
}: {
  label: string;
  children?: React.ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <Tag
      id={slugifyHeading(label)}
      data-section={label}
      className={`section-h${className ? ` ${className}` : ""}`}
    >
      {children ?? label}
      <a
        className="section-anchor"
        href={`?section=${sectionParam(label)}`}
        data-section={label}
        aria-label={`Copy link to “${label}”`}
      >
        <FiLink className="h-[0.9em] w-[0.9em]" aria-hidden />
      </a>
    </Tag>
  );
}
