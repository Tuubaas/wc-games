import { MATCH_LOCK_MINUTES } from "@/lib/config";
import { DEFAULT_TIME_ZONE } from "@/lib/time-zone";

export function matchLockTime(kickoffAt: Date) {
  return new Date(kickoffAt.getTime() - MATCH_LOCK_MINUTES * 60 * 1000);
}

export function isMatchLocked(kickoffAt: Date, now = new Date()) {
  return now >= matchLockTime(kickoffAt);
}

const DISPLAY_LOCALE = "en-GB";
const MATCHDAY_CUTOFF_HOURS = 6;

export function formatDateTime(date: Date, timeZone = DEFAULT_TIME_ZONE) {
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    dateStyle: "medium",
    hour12: false,
    timeStyle: "short",
    timeZone
  }).format(date);
}

export function formatShortDate(date: Date, timeZone = DEFAULT_TIME_ZONE) {
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    month: "short",
    day: "numeric",
    timeZone
  }).format(date);
}

export function formatDayLabel(date: Date, timeZone = DEFAULT_TIME_ZONE) {
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone
  }).format(date);
}

export function formatMatchDayLabel(date: Date, timeZone = DEFAULT_TIME_ZONE) {
  return formatDayLabel(
    new Date(date.getTime() - MATCHDAY_CUTOFF_HOURS * 60 * 60 * 1000),
    timeZone
  );
}

export function formatTime(date: Date, timeZone = DEFAULT_TIME_ZONE) {
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone
  }).format(date);
}
