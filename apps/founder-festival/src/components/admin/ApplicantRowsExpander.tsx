"use client";

import { useState, type ReactNode } from "react";

const LIMIT = 10;

// Renders applicant <tr> rows inside an existing <tbody>, capped at the first 10
// with a "Load more" row that reveals the rest. The rows themselves are the
// already-created <ApplicantRow> elements (client components) passed in from the
// server page, so all their per-row interactivity is preserved.
export function ApplicantRowsExpander({ rows, colSpan }: { rows: ReactNode[]; colSpan: number }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? rows : rows.slice(0, LIMIT);

  return (
    <>
      {shown}
      {!showAll && rows.length > LIMIT && (
        <tr>
          <td colSpan={colSpan} className="px-4 py-3 text-center">
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="rounded-md border border-zinc-700 px-4 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
            >
              Load more ({rows.length - LIMIT} more)
            </button>
          </td>
        </tr>
      )}
    </>
  );
}
