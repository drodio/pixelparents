"use client";

import { deleteChild } from "./actions";
import { TrashIcon } from "./icons";

export function DeleteChildButton({ id, name }: { id: string; name: string }) {
  return (
    <form
      action={deleteChild}
      onSubmit={(e) => {
        if (!confirm(`Delete child ${name}? This can't be undone.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        title="Delete"
        className="rounded-md p-1.5 text-white/50 transition-colors hover:bg-red-500/15 hover:text-red-300"
      >
        <TrashIcon />
      </button>
    </form>
  );
}
