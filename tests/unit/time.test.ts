import { describe, expect, it } from "vitest";
import {
  formatDateTime,
  formatMatchDayLabel,
  formatTime,
  isMatchLocked,
  matchLockTime
} from "@/lib/time";

describe("match locking", () => {
  const kickoffAt = new Date("2026-06-11T19:00:00.000Z");

  it("locks exactly 30 minutes before kickoff", () => {
    expect(matchLockTime(kickoffAt).toISOString()).toBe("2026-06-11T18:30:00.000Z");
    expect(isMatchLocked(kickoffAt, new Date("2026-06-11T18:29:59.000Z"))).toBe(false);
    expect(isMatchLocked(kickoffAt, new Date("2026-06-11T18:30:00.000Z"))).toBe(true);
  });

  it("formats kickoff times in the user's timezone with a 24-hour clock", () => {
    expect(formatTime(kickoffAt, "UTC")).toBe("19:00");
    expect(formatTime(kickoffAt, "Europe/Stockholm")).toBe("21:00");
    expect(formatDateTime(kickoffAt, "Europe/Stockholm")).toBe("11 Jun 2026, 21:00");
  });

  it("groups early-morning matches into the previous matchday", () => {
    expect(formatMatchDayLabel(new Date("2026-06-11T19:00:00.000Z"), "Europe/Stockholm")).toBe("Thursday 11 June");
    expect(formatMatchDayLabel(new Date("2026-06-12T02:00:00.000Z"), "Europe/Stockholm")).toBe("Thursday 11 June");
    expect(formatMatchDayLabel(new Date("2026-06-12T10:00:00.000Z"), "Europe/Stockholm")).toBe("Friday 12 June");
  });

  it("keeps an evening-to-early-morning slate under one matchday", () => {
    const matchday = "Sunday 14 June";

    expect(formatMatchDayLabel(new Date("2026-06-14T17:00:00.000Z"), "Europe/Stockholm")).toBe(matchday);
    expect(formatMatchDayLabel(new Date("2026-06-14T20:00:00.000Z"), "Europe/Stockholm")).toBe(matchday);
    expect(formatMatchDayLabel(new Date("2026-06-14T23:00:00.000Z"), "Europe/Stockholm")).toBe(matchday);
    expect(formatMatchDayLabel(new Date("2026-06-15T02:00:00.000Z"), "Europe/Stockholm")).toBe(matchday);
  });
});
