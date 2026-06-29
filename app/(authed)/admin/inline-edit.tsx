"use client";

// Reusable inline-edit cells for the admin parents table. Each cell shows its
// value plus a pencil that fades in when the row (a Tailwind `group`) is hovered
// or the pencil is focused. Clicking the pencil swaps the cell for a small
// editor appropriate to the field.
//
// Auto-save: there is NO required ✓ button. A change is persisted as soon as it
// is committed, then the table refreshes:
//   • single <select>     — saves on change, then closes
//   • free text           — saves on blur or Enter (Esc cancels, no save)
//   • multi-select / tags — save on every toggle / add / remove; the editor
//                           stays open and a "Done" button (or Esc) closes it
// Saving is delegated to the caller's `onSave`, which persists via patchSignup()
// and refreshes the table. If a save throws, the editor stays open for retry.

import { useEffect, useRef, useState } from "react";
import { PencilIcon } from "./icons";

export const fieldInputCls =
  "rounded border border-white/20 bg-white/10 px-1.5 py-1 text-sm text-white outline-none focus:border-amber-400/60 focus:ring-1 focus:ring-amber-400/40";

// Closes a still-open multi-value editor (its changes are already saved).
export function DoneButton({ onDone, saving }: { onDone: () => void; saving: boolean }) {
  return (
    <button
      type="button"
      onClick={onDone}
      disabled={saving}
      className="self-start rounded border border-white/20 bg-white/5 px-2 py-0.5 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
    >
      {saving ? "Saving…" : "Done"}
    </button>
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

// Shared editing state. `save(override, { keepOpen })` lets callers commit a
// freshly-computed value (e.g. a select's new value, or a tag editor's folded-in
// pending input) instead of the draft, and optionally keep the editor open for
// further edits (multi-select / tags).
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
  const close = () => setEditing(false);
  // `override` (when passed) must be a DEFINED value — callers use it to commit a
  // freshly-computed result instead of `draft`. `undefined` falls through to
  // `draft`. Pass `{ keepOpen: true }` to persist without closing the editor.
  const save = async (override?: T, opts?: { keepOpen?: boolean }) => {
    const value = override !== undefined ? override : draft;
    setSaving(true);
    try {
      await onSave(value);
      if (!opts?.keepOpen) setEditing(false);
    } catch {
      // Leave the editor open so the admin can retry.
    } finally {
      setSaving(false);
    }
  };

  return { editing, draft, setDraft, saving, open, cancel, close, save };
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
  // Esc routes through onBlur and must suppress the auto-save there.
  const cancelled = useRef(false);
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
    <span className="inline-flex items-center gap-1">
      {prefix && <span className="select-none text-xs text-white/40">{prefix}</span>}
      <input
        ref={ref}
        type={type}
        inputMode={inputMode}
        value={ed.draft}
        placeholder={placeholder}
        disabled={ed.saving}
        onChange={(e) => ed.setDraft(e.target.value)}
        onKeyDown={(e) => {
          // Enter commits, Esc cancels — both leave the field, which the blur
          // handler below turns into save / cancel respectively.
          if (e.key === "Enter") ref.current?.blur();
          else if (e.key === "Escape") {
            cancelled.current = true;
            ref.current?.blur();
          }
        }}
        onBlur={() => {
          if (cancelled.current) {
            cancelled.current = false;
            ed.cancel();
            return;
          }
          // Only persist when the value actually changed.
          if (ed.draft !== value) void ed.save();
          else ed.cancel();
        }}
        className={`${fieldInputCls} w-36`}
      />
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
    <span className="inline-flex items-center gap-1">
      <select
        ref={ref}
        value={ed.draft}
        disabled={ed.saving}
        // Auto-save the moment a different option is picked, then close.
        onChange={(e) => void ed.save(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") ed.cancel();
        }}
        // Clicking away without changing anything just closes the editor.
        onBlur={ed.cancel}
        className={`${fieldInputCls} max-w-[12rem]`}
      >
        <option value="">{blankLabel}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {optionLabel ? optionLabel(o) : o}
          </option>
        ))}
      </select>
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
  // Each toggle persists immediately; the editor stays open so the admin can
  // tick several boxes before clicking Done.
  const toggle = (o: string) => {
    const next = ed.draft.includes(o)
      ? ed.draft.filter((x) => x !== o)
      : [...ed.draft, o];
    ed.setDraft(next);
    void ed.save(next, { keepOpen: true });
  };
  return (
    <div
      className="flex flex-col gap-1"
      onKeyDown={(e) => {
        if (e.key === "Escape") ed.close();
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
      <DoneButton onDone={ed.close} saving={ed.saving} />
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
  // Both add and remove persist immediately and keep the editor open.
  const addPending = () => {
    const next = merge(ed.draft, text);
    setText("");
    ed.setDraft(next);
    void ed.save(next, { keepOpen: true });
  };
  const remove = (t: string) => {
    const next = ed.draft.filter((x) => x !== t);
    ed.setDraft(next);
    void ed.save(next, { keepOpen: true });
  };
  return (
    <div
      className="flex w-56 flex-col gap-1"
      onKeyDown={(e) => {
        if (e.key === "Escape") ed.close();
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
      <DoneButton onDone={ed.close} saving={ed.saving} />
    </div>
  );
}
