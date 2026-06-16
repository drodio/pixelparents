"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Pills } from "./pills";
import { TableWrap, thCls, tdCls } from "./ui";
import { PencilIcon } from "./icons";
import { DeleteChildButton } from "./delete-child-button";
import { compare, SortHeader, type Dir } from "./sortable";

export type ChildTableRow = {
  id: string;
  firstName: string;
  grade: string | null;
  interests: string[] | null;
  notes: string | null;
  signupId: string;
  parentId: string | null;
  parentName: string | null;
};

export function ChildrenTable({ rows }: { rows: ChildTableRow[] }) {
  const [sortKey, setSortKey] = useState("child");
  const [dir, setDir] = useState<Dir>("asc");
  const onSort = (k: string) => {
    if (k === sortKey) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(k);
      setDir("asc");
    }
  };

  function val(r: ChildTableRow, k: string): string | number | null {
    switch (k) {
      case "child": return r.firstName.toLowerCase();
      case "parent": return r.parentName?.toLowerCase() ?? null;
      case "grade": return r.grade;
      case "interests": return r.interests?.length ?? 0;
      case "notes": return r.notes;
      default: return null;
    }
  }

  const sorted = useMemo(
    () => [...rows].sort((a, b) => compare(val(a, sortKey), val(b, sortKey), dir)),
    [rows, sortKey, dir],
  );

  const hp = { sortKey, dir, onSort, className: thCls };

  return (
    <TableWrap>
      <thead>
        <tr>
          <SortHeader label="Child" k="child" {...hp} />
          <SortHeader label="Parent" k="parent" {...hp} />
          <SortHeader label="Grade" k="grade" {...hp} />
          <SortHeader label="Interests" k="interests" {...hp} />
          <SortHeader label="Notes" k="notes" {...hp} />
          <th className={thCls}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((k) => (
          <tr
            key={k.id}
            id={`c-${k.id}`}
            className="border-t border-white/10 odd:bg-white/[0.02] hover:bg-white/[0.05] target:bg-emerald-500/10"
          >
            <th scope="row" className={`${tdCls} whitespace-nowrap text-left font-bold text-white`}>
              {k.firstName}
            </th>
            <td className={`${tdCls} whitespace-nowrap`}>
              {k.parentId ? (
                <Link href={`/admin#p-${k.parentId}`} className="text-amber-400 hover:underline">
                  {k.parentName}
                </Link>
              ) : (
                "—"
              )}
            </td>
            <td className={`${tdCls} whitespace-nowrap text-white/80`}>{k.grade ?? "—"}</td>
            <td className={tdCls}>
              <Pills values={k.interests} />
            </td>
            <td className={`${tdCls} max-w-md text-white/80`}>{k.notes || "—"}</td>
            <td className={`${tdCls} whitespace-nowrap`}>
              <div className="flex items-center gap-1">
                <Link
                  href={`/signup/thanks?id=${k.signupId}&admin=1`}
                  title="Edit child(ren) details"
                  className="rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <PencilIcon />
                </Link>
                <DeleteChildButton id={k.id} name={k.firstName} />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}
