"use client";

import { useEffect, useRef, useState } from "react";

// Renders pre-sanitized HTML clamped to `maxHeight` px (e.g. the height of the
// adjacent image). When the content overflows, it's cut off with a fade + a
// "… Read more" toggle that expands the box to the full content (and back).
export function ClampedHtml({
  html,
  maxHeight,
  className,
}: {
  html: string;
  maxHeight: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el) setOverflowing(el.scrollHeight > maxHeight + 4);
  }, [html, maxHeight]);

  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        <div
          ref={ref}
          className={className}
          style={expanded ? undefined : { maxHeight, overflow: "hidden" }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {!expanded && overflowing && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-[#161618] to-transparent" />
        )}
      </div>
      {overflowing && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="self-start text-xs font-medium text-[#dfa43a] hover:underline"
        >
          {expanded ? "Show less" : "… Read more"}
        </button>
      )}
    </div>
  );
}
