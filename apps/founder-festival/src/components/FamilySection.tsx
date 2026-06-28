"use client";

import { useState } from "react";
import {
  computeAge,
  relationshipLabel,
  type FamilyMemberDTO,
} from "@/lib/family-constants";
import { FamilyMemberForm } from "@/components/FamilyMemberForm";
import { ImageLightbox } from "@/components/ImageLightbox";

// Kids & Family section for a claimed user's account. Lists their members and
// owns the add/edit modal. CRUD goes through /api/account/family; after a save
// or delete we re-fetch the list so the UI stays in sync without a full reload.
export function FamilySection({ initialMembers }: { initialMembers: FamilyMemberDTO[] }) {
  const [members, setMembers] = useState<FamilyMemberDTO[]>(initialMembers);
  const [editing, setEditing] = useState<FamilyMemberDTO | null>(null);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    try {
      const res = await fetch("/api/account/family");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.members)) setMembers(data.members);
    } catch {
      /* keep current list on transient error */
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this family member?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/account/family/${id}`, { method: "DELETE" });
      if (res.ok) setMembers((p) => p.filter((m) => m.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  function visibilityLabel(m: FamilyMemberDTO): string {
    if (m.visibility === "all_claimed") return "All claimed users";
    if (m.viewers.length === 0) return "Private (only you)";
    return `${m.viewers.length} ${m.viewers.length === 1 ? "person" : "people"}`;
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-zinc-100">Kids &amp; Family</h2>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 rounded-md bg-[#dfa43a] px-3 py-1.5 text-sm font-medium text-black hover:bg-[#e8b452]"
        >
          + Add
        </button>
      </div>
      <p className="text-sm text-zinc-500">
        Add your kids, partner, or other family members. We&apos;ll use this to help
        build family-friendly events. Only you (and anyone you choose) can see each person.
      </p>

      {members.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-700 px-4 py-6 text-center text-sm text-zinc-500">
          No family members yet. Hit <span className="text-zinc-300">+ Add</span> to add one.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {members.map((m) => {
            const age = computeAge(m.birthdate);
            return (
              <li key={m.id} className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                {m.photoHref ? (
                  <ImageLightbox
                    src={m.photoHref}
                    alt={m.firstName}
                    className="h-12 w-12 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-sm font-semibold text-zinc-200">
                    {m.firstName.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-zinc-100">
                    <span className="font-semibold">
                      {m.firstName}{m.lastName ? ` ${m.lastName}` : ""}
                    </span>
                    <span className="text-zinc-500">
                      {" · "}{relationshipLabel(m.relationship, m.relationshipOther)}
                      {age != null ? ` · ${age}` : ""}
                    </span>
                  </div>
                  {m.interests.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {m.interests.map((i) => (
                        <span key={i} className="rounded-md border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400">{i}</span>
                      ))}
                    </div>
                  )}
                  <div className="mt-1 text-xs text-zinc-500">Visible to: {visibilityLabel(m)}</div>
                </div>
                <div className="flex shrink-0 gap-2 text-xs">
                  <button type="button" onClick={() => setEditing(m)} className="text-zinc-400 hover:text-white">Edit</button>
                  <button type="button" disabled={busyId === m.id} onClick={() => remove(m.id)} className="text-red-400 hover:text-red-300 disabled:opacity-50">Delete</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {adding && (
        <FamilyMemberForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); void refresh(); }} />
      )}
      {editing && (
        <FamilyMemberForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void refresh(); }} />
      )}
    </section>
  );
}
