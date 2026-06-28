"use client";

import { useState } from "react";
// Import from the DB-free shared module — NOT "@/lib/event-priorities", which
// imports "@/db" and would pull the Neon client into the browser bundle (crashes
// this page on hydration with "No database connection string…").
import { PRIORITY_CATEGORIES, CATEGORY_COLORS, type PriorityCategory } from "@/lib/event-priorities-shared";

type Item = { text: string; category: PriorityCategory };
type Status = "idle" | "saving" | "saved" | "error";

function normalizeCategory(c: string): PriorityCategory {
  return (PRIORITY_CATEGORIES as readonly string[]).includes(c) ? (c as PriorityCategory) : "tactical";
}

// Event priorities editor. Adding, editing, and removing a priority each save
// automatically (the API is replace-all, so we just POST the whole list after
// every change) — no separate "Save" button. Each row has an Edit and a Remove
// action; Edit swaps the row into inline select + text inputs.
export function EventPrioritiesEditor({
  eventId,
  initial,
}: {
  eventId: string;
  initial: { text: string; category: string }[];
}) {
  const [items, setItems] = useState<Item[]>(
    initial.map((i) => ({ text: i.text, category: normalizeCategory(i.category) })),
  );
  const [text, setText] = useState("");
  const [category, setCategory] = useState<PriorityCategory>("fundraising");
  const [status, setStatus] = useState<Status>("idle");

  // Inline-edit state for the row currently being edited (null = none).
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [editCategory, setEditCategory] = useState<PriorityCategory>("fundraising");

  // Optimistically update the list, then persist the whole thing (replace-all).
  async function persist(next: Item[]) {
    setItems(next);
    setStatus("saving");
    try {
      const res = await fetch(`/api/admin/events/${eventId}/priorities`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: next }),
      });
      setStatus(res.ok ? "saved" : "error");
    } catch {
      setStatus("error");
    }
  }

  function add() {
    const t = text.trim();
    if (!t) return;
    persist([...items, { text: t, category }]);
    setText("");
  }

  function remove(idx: number) {
    if (editIdx === idx) setEditIdx(null);
    persist(items.filter((_, i) => i !== idx));
  }

  function startEdit(idx: number) {
    setEditIdx(idx);
    setEditText(items[idx]!.text);
    setEditCategory(items[idx]!.category);
  }

  function commitEdit() {
    if (editIdx === null) return;
    const t = editText.trim();
    if (!t) {
      setEditIdx(null);
      return;
    }
    const next = items.map((it, i) => (i === editIdx ? { text: t, category: editCategory } : it));
    setEditIdx(null);
    persist(next);
  }

  const input = "rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white";
  const statusLabel =
    status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Couldn’t save — try again" : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          What is this event optimized for? These are matched against founder priorities later. Changes save
          automatically.
        </p>
        {statusLabel && (
          <span className={`shrink-0 text-xs ${status === "error" ? "text-red-400" : "text-zinc-500"}`}>
            {statusLabel}
          </span>
        )}
      </div>

      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((it, idx) =>
            editIdx === idx ? (
              <li key={idx} className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900/40 px-3 py-2">
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value as PriorityCategory)}
                  className={input}
                >
                  {PRIORITY_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input
                  autoFocus
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    else if (e.key === "Escape") setEditIdx(null);
                  }}
                  // Auto-save the edit when focus leaves the field (no Save button).
                  onBlur={commitEdit}
                  className={`flex-1 ${input}`}
                />
                <button
                  type="button"
                  // preventDefault on mousedown so the input doesn't blur-commit
                  // before this cancel runs.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setEditIdx(null)}
                  className="text-xs text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
              </li>
            ) : (
              <li key={idx} className="flex items-center gap-2 rounded-md border border-zinc-800 px-3 py-2">
                <span className={`rounded-full border px-2 py-0.5 text-xs ${CATEGORY_COLORS[it.category]}`}>{it.category}</span>
                <span className="flex-1 text-sm text-zinc-200">{it.text}</span>
                <button type="button" onClick={() => startEdit(idx)} className="text-xs text-zinc-400 hover:text-white">
                  Edit
                </button>
                <button type="button" onClick={() => remove(idx)} className="text-xs text-red-400 hover:text-red-300">
                  Remove
                </button>
              </li>
            ),
          )}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select value={category} onChange={(e) => setCategory(e.target.value as PriorityCategory)} className={input}>
          {PRIORITY_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Priority (e.g. Meet seed-stage AI founders)"
          className={`flex-1 ${input}`}
        />
        <button type="button" onClick={add} className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800">
          Add
        </button>
      </div>
    </div>
  );
}
