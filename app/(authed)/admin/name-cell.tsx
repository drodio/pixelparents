"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PencilIcon, TrashIcon } from "./icons";
import { fieldInputCls } from "./inline-edit";

// A row's name, doubling as its row actions. Hovering the cell turns the name
// gold and reveals a pencil + a trash can. The name itself links to the full
// edit page; hovering the trash turns the name (and trash) red, and clicking it
// deletes the row (after a confirm).
//
// When `onSaveName` is supplied (parents table) the pencil edits first/last name
// inline; otherwise (children table) the pencil simply links to the edit page.
export function NameCell({
  firstName,
  lastName = "",
  editHref,
  deleteAction,
  id,
  confirmMessage,
  onSaveName,
}: {
  firstName: string;
  lastName?: string;
  editHref: string;
  deleteAction: (formData: FormData) => void | Promise<void>;
  id: string;
  confirmMessage: string;
  onSaveName?: (firstName: string, lastName: string) => Promise<void> | void;
}) {
  const [hover, setHover] = useState(false);
  const [hoverTrash, setHoverTrash] = useState(false);
  const [editing, setEditing] = useState(false);
  const [first, setFirst] = useState(firstName);
  const [last, setLast] = useState(lastName);
  const [saving, setSaving] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);
  // Esc routes through the editor's onBlur and must suppress the auto-save; an
  // Enter commit sets it too so the unmount blur doesn't double-save.
  const skipBlur = useRef(false);

  const name = `${firstName} ${lastName}`.trim();
  const nameColor = hoverTrash ? "text-red-400" : hover ? "text-amber-400" : "text-white";

  useEffect(() => {
    if (editing) firstRef.current?.focus();
  }, [editing]);

  function open() {
    setFirst(firstName);
    setLast(lastName);
    setEditing(true);
  }
  function cancel() {
    if (!saving) setEditing(false);
  }
  async function save() {
    if (!onSaveName) return;
    setSaving(true);
    try {
      await onSaveName(first, last);
      setEditing(false);
    } catch {
      // Leave the editor open so the admin can retry.
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    const changed = first !== firstName || last !== lastName;
    return (
      <span
        className="inline-flex items-center gap-1"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            skipBlur.current = true;
            cancel();
          } else if (e.key === "Enter") {
            skipBlur.current = true;
            void save();
          }
        }}
        // Auto-save when focus leaves both name inputs; no ✓ to click.
        onBlur={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          if (skipBlur.current) {
            skipBlur.current = false;
            return;
          }
          if (changed) void save();
          else cancel();
        }}
      >
        <input
          ref={firstRef}
          value={first}
          placeholder="First"
          disabled={saving}
          onChange={(e) => setFirst(e.target.value)}
          className={`${fieldInputCls} w-24`}
          aria-label="First name"
        />
        <input
          value={last}
          placeholder="Last"
          disabled={saving}
          onChange={(e) => setLast(e.target.value)}
          className={`${fieldInputCls} w-24`}
          aria-label="Last name"
        />
      </span>
    );
  }

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
        {onSaveName ? (
          <button
            type="button"
            onClick={open}
            title="Edit name inline"
            aria-label={`Edit ${name} name`}
            className="rounded-md p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <PencilIcon />
          </button>
        ) : (
          <Link
            href={editHref}
            title="Edit"
            aria-label={`Edit ${name}`}
            className="rounded-md p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <PencilIcon />
          </Link>
        )}
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
