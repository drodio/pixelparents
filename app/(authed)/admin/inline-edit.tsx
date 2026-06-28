"use client";

// Reusable inline-edit cells for the admin parents table. Each cell shows its
// value plus a pencil that fades in when the row (a Tailwind `group`) is hovered
// or the pencil is focused. Clicking the pencil swaps the cell for a small
// editor appropriate to the field; ✓ / Enter saves, ✕ / Esc cancels. Saving is
// delegated to the caller's `onSave`, which persists via patchSignup() and
// refreshes the table.
//
// Note: blur-to-save is intentionally NOT wired up — it races with clicking the
// ✓ / ✕ buttons and could persist a value the admin meant to discard. Enter, the
// ✓ button, and (for tags) comma all commit; Esc / ✕ cancel.

import { useEffect, useRef, useState } from "react";
import { PencilIcon, CheckIcon } from "./icons";

export const fieldInputCls =
  "rounded border border-white/20 bg-white/10 px-1.5 py-1 text-sm text-white outline-none focus:border-amber-400/60 focus:ring-1 focus:ring-amber-400/40";

function XIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

// Shared ✓ / ✕ button pair for every inline editor.
export function EditActions({
  onSave,
  onCancel,
  saving,
}: {
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        aria-label="Save"
        title="Save"
        className="rounded p-1 text-emerald-400 transition-colors hover:bg-emerald-500/15 disabled:opacity-40"
      >
        <CheckIcon />
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        aria-label="Cancel"
        title="Cancel"
        className="rounded p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
      >
        <XIcon />
      </button>
    </span>
  );
}

// Pencil that fades in on row-hover (parent `group`) or keyboard focus.
export function EditTrigger({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="ml-1 inline-flex shrink-0 rounded p-0.5 text-white/30 opacity-0 transition-colors hover:bg-white/10 hover:text-amber-400 focus-visible:opacity-100 group-hover:opacity-100"
    >
      <PencilIcon />
    </button>
  );
}

// Shared editing state. `save(override)` lets callers commit a freshly-computed
// value (e.g. tag editors folding in pending input text) instead of the draft.
function useEditing<T>(
  initial: T,
  onSave: (v: T) => Promise<void> | void,
  onOpen?: () => void,
) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<T>(initial);
  const [saving, setSaving] = useState(false);

  const open = () => {
    onOpen?.();
    setDraft(initial);
    setEditing(true);
  };
  const cancel = () => {
    if (!saving) setEditing(false);
  };
  // `override` (when passed) must be a DEFINED value — callers use it to commit a
  // freshly-computed result instead of `draft` (e.g. the tag editor folding in
  // pending input). `undefined` always falls through to `draft`.
  const save = async (override?: T) => {
    const value = override !== undefined ? override : draft;
    setSaving(true);
    try {
      await onSave(value);
      setEditing(false);
    } catch {
      // Leave the editor open so the admin can retry.
    } finally {
      setSaving(false);
    }
  };

  return { editing, draft, setDraft, saving, open, cancel, save };
}

// Display wrapper used by every cell when NOT editing.
function Display({
  children,
  onEdit,
  label,
}: {
  children: React.ReactNode;
  onEdit: () => void;
  label: string;
}) {
  return (
    <span className="inline-flex items-center">
      <span>{children}</span>
      <EditTrigger onClick={onEdit} label={label} />
    </span>
  );
}

// --- Free text -------------------------------------------------------------

export function TextCell({
  value,
  label,
  display,
  placeholder,
  prefix,
  type = "text",
  inputMode,
  onSave,
}: {
  value: string;
  label: string;
  display: React.ReactNode;
  placeholder?: string;
  prefix?: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  onSave: (v: string) => Promise<void> | void;
}) {
  const ed = useEditing(value, onSave);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ed.editing) ref.current?.focus();
  }, [ed.editing]);

  if (!ed.editing) {
    return (
      <Display onEdit={ed.open} label={label}>
        {display}
      </Display>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1"
      onKeyDown={(e) => {
        if (e.key === "Escape") ed.cancel();
      }}
    >
      {prefix && <span className="select-none text-xs text-white/40">{prefix}</span>}
      <input
        ref={ref}
        type={type}
        inputMode={inputMode}
        value={ed.draft}
        placeholder={placeholder}
        onChange={(e) => ed.setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void ed.save();
        }}
        className={`${fieldInputCls} w-36`}
      />
      <EditActions onSave={() => void ed.save()} onCancel={ed.cancel} saving={ed.saving} />
    </span>
  );
}

// --- Single select ---------------------------------------------------------

export function SelectCell({
  value,
  label,
  display,
  options,
  blankLabel = "— none —",
  optionLabel,
  onSave,
}: {
  value: string;
  label: string;
  display: React.ReactNode;
  options: readonly string[];
  blankLabel?: string;
  optionLabel?: (o: string) => string;
  onSave: (v: string) => Promise<void> | void;
}) {
  const ed = useEditing(value, onSave);
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (ed.editing) ref.current?.focus();
  }, [ed.editing]);

  if (!ed.editing) {
    return (
      <Display onEdit={ed.open} label={label}>
        {display}
      </Display>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1"
      onKeyDown={(e) => {
        if (e.key === "Escape") ed.cancel();
      }}
    >
      <select
        ref={ref}
        value={ed.draft}
        onChange={(e) => ed.setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void ed.save();
        }}
        className={`${fieldInputCls} max-w-[12rem]`}
      >
        <option value="">{blankLabel}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {optionLabel ? optionLabel(o) : o}
          </option>
        ))}
      </select>
      <EditActions onSave={() => void ed.save()} onCancel={ed.cancel} saving={ed.saving} />
    </span>
  );
}

// --- Multi-select (checkboxes) ---------------------------------------------

export function MultiSelectCell({
  value,
  label,
  display,
  options,
  onSave,
}: {
  value: string[];
  label: string;
  display: React.ReactNode;
  options: readonly string[];
  onSave: (v: string[]) => Promise<void> | void;
}) {
  const ed = useEditing<string[]>(value, onSave);

  if (!ed.editing) {
    return (
      <Display onEdit={ed.open} label={label}>
        {display}
      </Display>
    );
  }
  const toggle = (o: string) =>
    ed.setDraft(ed.draft.includes(o) ? ed.draft.filter((x) => x !== o) : [...ed.draft, o]);
  return (
    <div
      className="flex flex-col gap-1"
      onKeyDown={(e) => {
        if (e.key === "Escape") ed.cancel();
      }}
    >
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        {options.map((o) => (
          <label key={o} className="flex items-center gap-1 whitespace-nowrap text-xs text-white/80">
            <input
              type="checkbox"
              checked={ed.draft.includes(o)}
              onChange={() => toggle(o)}
              className="h-3.5 w-3.5 accent-amber-500"
            />
            <span>{o}</span>
          </label>
        ))}
      </div>
      <EditActions onSave={() => void ed.save()} onCancel={ed.cancel} saving={ed.saving} />
    </div>
  );
}

// --- Free-form tags --------------------------------------------------------

export function TagsCell({
  value,
  label,
  display,
  onSave,
}: {
  value: string[];
  label: string;
  display: React.ReactNode;
  onSave: (v: string[]) => Promise<void> | void;
}) {
  const [text, setText] = useState("");
  const ed = useEditing<string[]>(value, onSave, () => setText(""));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ed.editing) ref.current?.focus();
  }, [ed.editing]);

  if (!ed.editing) {
    return (
      <Display onEdit={ed.open} label={label}>
        {display}
      </Display>
    );
  }
  // Merge any comma/whitespace-separated pending text into the current draft.
  const merge = (base: string[], raw: string): string[] => {
    const next = [...base];
    for (const p of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
      if (!next.includes(p)) next.push(p);
    }
    return next;
  };
  const addPending = () => {
    ed.setDraft((d) => merge(d, text));
    setText("");
  };
  const remove = (t: string) => ed.setDraft(ed.draft.filter((x) => x !== t));
  const commit = () => {
    setText("");
    void ed.save(merge(ed.draft, text));
  };
  return (
    <div
      className="flex w-56 flex-col gap-1"
      onKeyDown={(e) => {
        if (e.key === "Escape") ed.cancel();
      }}
    >
      {ed.draft.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {ed.draft.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => remove(t)}
              title="Remove"
              className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-white/80 transition-colors hover:border-red-400/40 hover:text-red-300"
            >
              {t} <span aria-hidden>×</span>
            </button>
          ))}
        </div>
      )}
      <input
        ref={ref}
        value={text}
        placeholder="Type, Enter to add"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addPending();
          } else if (e.key === "Backspace" && text === "" && ed.draft.length > 0) {
            remove(ed.draft[ed.draft.length - 1]);
          }
        }}
        className={`${fieldInputCls} w-full`}
      />
      <EditActions onSave={commit} onCancel={ed.cancel} saving={ed.saving} />
    </div>
  );
}
