"use client";

import { useState } from "react";

const MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleString("en-US", { month: "long" }),
);

// A click-to-open calendar + time picker. `value`/`onChange` use the native
// datetime-local string format ("YYYY-MM-DDTHH:mm") so callers can keep doing
// `new Date(value).toISOString()`. The trigger shows the chosen date/time; the
// modal has a clickable month calendar + a time field, applied on "Apply".
export function DateTimePickerModal({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const initial = value ? new Date(value) : new Date();
  const [viewMonth, setViewMonth] = useState(
    new Date(initial.getFullYear(), initial.getMonth(), 1),
  );
  const [selDate, setSelDate] = useState(
    new Date(initial.getFullYear(), initial.getMonth(), initial.getDate()),
  );
  const [time, setTime] = useState(`${pad(initial.getHours())}:${pad(initial.getMinutes())}`);

  // Reset the modal's working state from the current value each time it opens.
  function openModal() {
    const base = value ? new Date(value) : new Date();
    setViewMonth(new Date(base.getFullYear(), base.getMonth(), 1));
    setSelDate(new Date(base.getFullYear(), base.getMonth(), base.getDate()));
    setTime(`${pad(base.getHours())}:${pad(base.getMinutes())}`);
    setOpen(true);
  }

  function apply() {
    const [h, m] = time.split(":").map((n) => Number(n) || 0);
    const out = `${selDate.getFullYear()}-${pad(selDate.getMonth() + 1)}-${pad(selDate.getDate())}T${pad(h)}:${pad(m)}`;
    onChange(out);
    setOpen(false);
  }

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay(); // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const today = new Date();

  // Year dropdown range: last 10 years through next year, always including the
  // currently-viewed year. Newest first.
  const nowYear = today.getFullYear();
  const minYear = Math.min(nowYear - 10, year);
  const maxYear = Math.max(nowYear + 1, year);
  const years: number[] = [];
  for (let y = maxYear; y >= minYear; y--) years.push(y);

  return (
    <div className="w-fit">
      <button
        type="button"
        onClick={openModal}
        className="flex items-center gap-2 rounded-md bg-black border border-zinc-800 text-zinc-100 px-3 py-2 text-sm hover:border-zinc-600 transition-colors"
      >
        <span aria-hidden>📅</span>
        {value ? fmtDisplay(value) : <span className="text-zinc-500">Pick a date &amp; time</span>}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-950 p-5 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Month + year header: arrows step months; dropdowns jump directly. */}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setViewMonth(new Date(year, month - 1, 1))}
                className="rounded px-2 py-1 text-zinc-400 hover:text-white hover:bg-zinc-800"
                aria-label="Previous month"
              >
                ‹
              </button>
              <div className="flex items-center gap-2">
                <select
                  aria-label="Month"
                  value={month}
                  onChange={(e) => setViewMonth(new Date(year, Number(e.target.value), 1))}
                  className="rounded-md bg-black border border-zinc-800 text-zinc-100 px-2 py-1 text-sm outline-none focus:border-zinc-600"
                >
                  {MONTHS.map((label, i) => (
                    <option key={i} value={i}>
                      {label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Year"
                  value={year}
                  onChange={(e) => setViewMonth(new Date(Number(e.target.value), month, 1))}
                  className="rounded-md bg-black border border-zinc-800 text-zinc-100 px-2 py-1 text-sm outline-none focus:border-zinc-600"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => setViewMonth(new Date(year, month + 1, 1))}
                className="rounded px-2 py-1 text-zinc-400 hover:text-white hover:bg-zinc-800"
                aria-label="Next month"
              >
                ›
              </button>
            </div>

            {/* Weekday labels */}
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] uppercase tracking-wider text-zinc-500">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <span key={i}>{d}</span>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, i) =>
                day === null ? (
                  <span key={i} />
                ) : (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelDate(new Date(year, month, day))}
                    className={cellClass(year, month, day, selDate, today)}
                  >
                    {day}
                  </button>
                ),
              )}
            </div>

            {/* Time */}
            <div className="flex items-center justify-between border-t border-zinc-800 pt-3">
              <label className="text-sm text-zinc-400">Time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="rounded-md bg-black border border-zinc-800 text-zinc-100 px-3 py-1.5 text-sm outline-none focus:border-zinc-600"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-zinc-700 hover:border-zinc-500 text-zinc-300 px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={apply}
                className="rounded-md bg-[#dfa43a] hover:bg-[#c98e2a] text-black font-semibold px-4 py-2 text-sm"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function fmtDisplay(v: string): string {
  return new Date(v).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function cellClass(
  year: number,
  month: number,
  day: number,
  sel: Date,
  today: Date,
): string {
  const isSel = sel.getFullYear() === year && sel.getMonth() === month && sel.getDate() === day;
  const isToday =
    today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
  const base = "h-9 rounded-md text-sm transition-colors";
  if (isSel) return `${base} bg-[#dfa43a] text-black font-semibold`;
  if (isToday) return `${base} text-zinc-100 ring-1 ring-zinc-600 hover:bg-zinc-800`;
  return `${base} text-zinc-300 hover:bg-zinc-800`;
}
