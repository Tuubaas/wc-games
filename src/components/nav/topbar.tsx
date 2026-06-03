"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import {
  BookOpen,
  CalendarRange,
  LayoutDashboard,
  LogOut,
  ShieldAlert,
  Trophy,
  Users
} from "lucide-react";
import { signOutAction } from "@/lib/actions";
import { cn } from "@/lib/cn";
import { TubetsLogo } from "@/components/tubets-logo";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/matches", label: "Matches", icon: CalendarRange },
  { href: "/picks", label: "Picks", icon: Trophy },
  { href: "/leagues", label: "Leagues", icon: Users },
  { href: "/rules", label: "Rules", icon: BookOpen }
] as const;

export function Topbar({
  username,
  isAdmin
}: {
  username: string;
  isAdmin: boolean;
}) {
  const pathname = usePathname() ?? "";

  return (
    <header className="sticky top-0 z-30 border-b border-[--color-border] bg-[--color-bg]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-5">
        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className="group flex items-center gap-2 font-semibold tracking-tight"
          >
            <TubetsLogo className="transition-transform group-hover:rotate-[8deg]" />
            <span className="text-[15px]">Tubets</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  className={cn(
                    "relative flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                    active
                      ? "text-[--color-text]"
                      : "text-[--color-muted] hover:text-[--color-text]"
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-0 -z-0 rounded-md bg-[--color-surface-2]"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  ) : null}
                  <span className="relative z-10 flex items-center gap-2">
                    <Icon size={14} />
                    {item.label}
                  </span>
                </Link>
              );
            })}
            {isAdmin ? (
              <Link
                href="/admin"
                prefetch={false}
                className={cn(
                  "relative flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                  pathname.startsWith("/admin")
                    ? "text-[--color-accent]"
                    : "text-[--color-faint] hover:text-[--color-accent]"
                )}
              >
                <ShieldAlert size={14} />
                Admin
              </Link>
            ) : null}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/users/${username}`}
            prefetch={false}
            className="hidden items-center gap-2 rounded-full border border-[--color-border] bg-[--color-surface] px-3 py-1 text-xs font-medium text-[--color-muted] transition-colors hover:text-[--color-text] sm:flex"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[--color-accent] text-[10px] font-bold text-[--color-accent-fg]">
              {username.slice(0, 1).toUpperCase()}
            </span>
            @{username}
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[--color-faint] transition-colors hover:bg-[--color-surface] hover:text-[--color-text]"
              aria-label="Sign out"
            >
              <LogOut size={15} />
            </button>
          </form>
        </div>
      </div>

      <nav className="flex items-center gap-1 overflow-x-auto border-t border-[--color-border] px-3 py-2 md:hidden">
        {NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors",
                active
                  ? "bg-[--color-surface-2] text-[--color-text]"
                  : "text-[--color-muted]"
              )}
            >
              <Icon size={13} />
              {item.label}
            </Link>
          );
        })}
        {isAdmin ? (
          <Link
            href="/admin"
            prefetch={false}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs",
              pathname.startsWith("/admin")
                ? "text-[--color-accent]"
                : "text-[--color-faint]"
            )}
          >
            <ShieldAlert size={13} />
            Admin
          </Link>
        ) : null}
      </nav>
    </header>
  );
}
