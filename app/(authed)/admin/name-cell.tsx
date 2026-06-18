"use client";

import Link from "next/link";
import { useState } from "react";
import { PencilIcon, TrashIcon } from "./icons";

// A row's name, doubling as its row actions. Hovering the cell turns the name
// gold and reveals an edit pencil + a trash can. Clicking the name or pencil
// opens the edit page; hovering the trash turns the name (and trash) red, and
// clicking it deletes the row (after a confirm). Replaces the old Actions column.
export function NameCell({
  name,
  editHref,
  deleteAction,
  id,
  confirmMessage,
}: {
  name: string;
  editHref: string;
  deleteAction: (formData: FormData) => void | Promise<void>;
  id: string;
  confirmMessage: string;
}) {
  const [hover, setHover] = useState(false);
  const [hoverTrash, setHoverTrash] = useState(false);

  const nameColor = hoverTrash ? "text-red-400" : hover ? "text-amber-400" : "text-white";

  return (
    <span
      className="inline-flex items-center gap-2"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setHoverTrash(false);
      }}
    >
      <Link href={editHref} className={`font-bold transition-colors ${nameColor}`}>
        {name}
      </Link>
      <span
        className={`inline-flex items-center gap-1 transition-opacity ${
          hover ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <Link
          href={editHref}
          title="Edit"
          aria-label={`Edit ${name}`}
          className="rounded-md p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        >
          <PencilIcon />
        </Link>
        <form
          action={deleteAction}
          onSubmit={(e) => {
            if (!confirm(confirmMessage)) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            title="Delete"
            aria-label={`Delete ${name}`}
            onMouseEnter={() => setHoverTrash(true)}
            onMouseLeave={() => setHoverTrash(false)}
            className="rounded-md p-1 text-white/50 transition-colors hover:bg-red-500/15 hover:text-red-400"
          >
            <TrashIcon />
          </button>
        </form>
      </span>
    </span>
  );
}
