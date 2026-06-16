"use client";

import { useActionState } from "react";
import { GRADES } from "@/lib/options";
import type { ChildRow } from "@/lib/db/schema/signups";
import { updateChild, type ChildEditState } from "./actions";

const initial: ChildEditState = { ok: false };
const labelCls = "block text-sm font-medium text-white/80";
const inputCls =
  "mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white placeholder-white/30 outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40";

function Err({ msg }: { msg?: string }) {
  return msg ? <p className="mt-1 text-sm text-red-400">{msg}</p> : null;
}

export default function ChildEditForm({ row }: { row: ChildRow }) {
  const [state, action, pending] = useActionState(updateChild, initial);
  const errors = state.errors ?? {};

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="id" value={row.id} />
      {state.message && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {state.message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Child&rsquo;s first name *</label>
          <input name="firstName" defaultValue={row.firstName} className={inputCls} />
          <Err msg={errors.firstName} />
        </div>
        <div>
          <label className={labelCls}>Grade</label>
          <select name="grade" defaultValue={row.grade ?? ""} className={inputCls}>
            <option value="">Select…</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls}>Interests (comma-separated)</label>
        <input
          name="interests"
          defaultValue={(row.interests ?? []).join(", ")}
          className={inputCls}
          placeholder="Books, Robotics, Singing"
        />
      </div>

      <div>
        <label className={labelCls}>Notes</label>
        <textarea name="notes" defaultValue={row.notes ?? ""} rows={3} className={inputCls} />
      </div>

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-white px-6 py-3 font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
