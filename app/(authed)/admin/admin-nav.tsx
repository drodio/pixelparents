"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin", label: "Parents" },
  { href: "/admin/children", label: "Children" },
  { href: "/admin/api-requests", label: "API Requests" },
  { href: "/admin/reports", label: "Reports" },
];

export default function AdminNav({ openReports = 0 }: { openReports?: number }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {items.map((it) => {
        const active =
          it.href === "/admin" ? path === "/admin" : path.startsWith(it.href);
        const badge = it.href === "/admin/reports" && openReports > 0 ? openReports : null;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-white/10 font-semibold text-white"
                : "text-white/60 hover:bg-white/5 hover:text-white"
            }`}
          >
            <span>{it.label}</span>
            {badge !== null && (
              <span className="ml-auto rounded-full border border-yellow-500/40 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-300">
                {badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
