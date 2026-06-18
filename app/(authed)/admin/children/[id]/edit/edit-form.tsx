"use client";

import { useCallback, useState } from "react";
import { GRADES } from "@/lib/options";
import type { ChildRow } from "@/lib/db/schema/signups";
import { useAutoSave } from "@/lib/use-auto-save";
import { SaveStatus } from "@/components/save-status";
import { patchChild, type ChildPatch } from "@/app/signup/thanks/actions";

const labelCls = "block text-sm font-medium text-white/80";
const inputCls =
  "mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white placeholder-white/30 outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40";

export default function ChildEditForm({ row }: { row: ChildRow }) {
  const save = useCallback(
    async (patch: ChildPatch) => {
      const r = await patchChild(row.id, row.signupId, patch);
      if (!r.ok) throw new Error("save failed");
    },
    [row.id, row.signupId],
  );
  const { queue, status } = useAutoSave<ChildPatch>(save);

  const [firstName, setFirstName] = useState(row.firstName);
  const [grade, setGrade] = useState(row.grade ?? "");
  const [interests, setInterests] = useState((row.interests ?? []).join(", "));
  const [notes, setNotes] = useState(row.notes ?? "");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <SaveStatus status={status} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Child&rsquo;s first name</label>
          <input
            value={firstName}
            onChange={(e) => {
              setFirstName(e.target.value);
              queue({ firstName: e.target.value });
            }}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Grade</label>
          <select
            value={grade}
            onChange={(e) => {
              setGrade(e.target.value);
              queue({ grade: e.target.value }, true);
            }}
            className={inputCls}
          >
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
          value={interests}
          onChange={(e) => {
            setInterests(e.target.value);
            queue({
              interests: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            });
          }}
          className={inputCls}
          placeholder="Books, Robotics, Singing"
        />
      </div>

      <div>
        <label className={labelCls}>Notes</label>
        <textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            queue({ notes: e.target.value });
          }}
          rows={3}
          className={inputCls}
        />
      </div>

      <p className="text-xs text-white/40">Changes save automatically.</p>
    </div>
  );
}
