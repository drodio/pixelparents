"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ApprovalStatus } from "@/lib/approval";
import { VerifiedBadge } from "@/components/verified-badge";
import {
  IconGrid,
  IconHome,
  IconUsers,
  IconGlobe,
  IconCode,
  IconSettings,
} from "@/components/icons";

type NavItem = {
  href: string;
  label: string;
  Icon: (p: { className?: string }) => React.ReactElement;
  // `external` items open in a new tab — used for the public /developers docs,
  // which live outside the (authed) shell, so we never make the sidebar vanish.
  external?: boolean;
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", Icon: IconGrid },
  { href: "/family", label: "Family", Icon: IconHome },
  { href: "/directory", label: "Directory", Icon: IconUsers },
  { href: "/community", label: "Community", Icon: IconGlobe },
  { href: "/developers", label: "Developers", Icon: IconCode, external: true },
];

// Persistent app shell: an icon rail on mobile that expands to a labelled
// sidebar on md+. Account + verification status live pinned at the bottom.
export function DashboardShell({
  children,
  firstName,
  email,
  status,
  isAdmin = false,
}: {
  children: React.ReactNode;
  firstName: string | null;
  email: string | null;
  status: ApprovalStatus | null;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const initial = (firstName?.[0] ?? email?.[0] ?? "?").toUpperCase();
  const items: NavItem[] = isAdmin
    ? [...NAV, { href: "/admin", label: "Admin", Icon: IconSettings }]
    : NAV;

  return (
    <div className="min-h-dvh bg-black text-white">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-16 flex-col border-r border-white/10 bg-zinc-950/80 backdrop-blur md:w-60">
        <Link
          href="/dashboard"
          className="flex h-16 items-center gap-2.5 px-3 md:px-5"
          aria-label="Pixel Parents dashboard"
        >
          <Image
            src="/images/pixel-mascot.png"
            alt=""
            width={72}
            height={72}
            className="h-9 w-9 rounded-lg object-cover"
          />
          <span className="hidden text-base font-semibold tracking-tight md:inline">
            Pixel Parents
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-1 px-2 py-3 md:px-3">
          {items.map(({ href, label, Icon, external }) => {
            const active =
              !external && (pathname === href || (pathname?.startsWith(`${href}/`) ?? false));
            return (
              <Link
                key={href}
                href={href}
                title={label}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-amber-400/15 text-amber-300"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="hidden md:inline">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-2 md:p-3">
          <div className="mb-2 hidden md:block">
            <VerifiedBadge status={status} />
          </div>
          <div className="mb-2 flex justify-center md:hidden">
            <VerifiedBadge status={status} compact />
          </div>
          <Link
            href="/account"
            title="Account settings"
            className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-white/5"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-400/20 text-sm font-semibold text-amber-300">
              {initial}
            </span>
            <span className="hidden min-w-0 flex-1 md:block">
              <span className="block truncate font-medium text-white">
                {firstName ?? "Account"}
              </span>
              <span className="block truncate text-xs text-white/55">{email ?? "Settings"}</span>
            </span>
            <IconSettings className="hidden h-4 w-4 shrink-0 text-white/40 md:block" />
          </Link>
        </div>
      </aside>

      <div className="pl-16 md:pl-60">
        <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10">{children}</div>
      </div>
    </div>
  );
}
