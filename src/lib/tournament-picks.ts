import { prisma } from "@/lib/db";
import { isMatchLocked } from "@/lib/time";

export const TOURNAMENT_PICKS_REOPENED_SETTING_KEY = "tournamentPicksReopened";

export async function areTournamentPicksReopened() {
  const setting = await prisma.appSetting.findUnique({
    where: { key: TOURNAMENT_PICKS_REOPENED_SETTING_KEY }
  });
  return setting?.value === "true";
}

export async function setTournamentPicksReopened(reopened: boolean) {
  await prisma.appSetting.upsert({
    where: { key: TOURNAMENT_PICKS_REOPENED_SETTING_KEY },
    update: { value: String(reopened) },
    create: {
      key: TOURNAMENT_PICKS_REOPENED_SETTING_KEY,
      value: String(reopened)
    }
  });
}

export async function areTournamentPicksLocked() {
  if (await areTournamentPicksReopened()) return false;

  const firstMatch = await prisma.match.findFirst({ orderBy: { kickoffAt: "asc" } });
  if (!firstMatch) return false;
  return isMatchLocked(firstMatch.kickoffAt);
}
