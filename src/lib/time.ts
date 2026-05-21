import { MATCH_LOCK_MINUTES } from "@/lib/config";

export function matchLockTime(kickoffAt: Date) {
  return new Date(kickoffAt.getTime() - MATCH_LOCK_MINUTES * 60 * 1000);
}

export function isMatchLocked(kickoffAt: Date, now = new Date()) {
  return now >= matchLockTime(kickoffAt);
}

export function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(date);
}
