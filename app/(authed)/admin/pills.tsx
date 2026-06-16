"use client";

import { useState } from "react";

const pillCls =
  "whitespace-nowrap rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-white/80";

// Shows up to 2 pills inline; when there are more, shows the first + a
// "+N more" chip that expands the row to reveal the rest.
export function Pills({ values }: { values?: string[] | null }) {
  const [open, setOpen] = useState(false);
  if (!values || values.length === 0)
    return <span className="text-white/30">—</span>;

  const collapsed = !open && values.length > 2;
  const shown = collapsed ? values.slice(0, 1) : values;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((v) => (
        <span key={v} className={pillCls}>
          {v}
        </span>
      ))}
      {collapsed && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-white/20 bg-white/10 px-2 py-0.5 text-xs text-white/70 hover:bg-white/20"
        >
          +{values.length - 1} more
        </button>
      )}
      {open && values.length > 2 && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-1 text-xs text-white/40 hover:text-white/70"
        >
          show less
        </button>
      )}
    </div>
  );
}
