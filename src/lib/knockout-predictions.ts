import { MatchStage, MatchStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isMatchLocked } from "@/lib/time";

export const KNOCKOUT_PREDICTIONS_REOPENED_SETTING_KEY =
  "knockoutPredictionsReopened";

const KNOCKOUT_STAGES = new Set<MatchStage>([
  MatchStage.ROUND_OF_32,
  MatchStage.ROUND_OF_16,
  MatchStage.QUARTER_FINAL,
  MatchStage.SEMI_FINAL,
  MatchStage.THIRD_PLACE,
  MatchStage.FINAL
]);

export function isKnockoutStage(stage: MatchStage) {
  return KNOCKOUT_STAGES.has(stage);
}

export async function areKnockoutPredictionsReopened() {
  const setting = await prisma.appSetting.findUnique({
    where: { key: KNOCKOUT_PREDICTIONS_REOPENED_SETTING_KEY }
  });
  return setting?.value === "true";
}

export async function setKnockoutPredictionsReopened(reopened: boolean) {
  await prisma.appSetting.upsert({
    where: { key: KNOCKOUT_PREDICTIONS_REOPENED_SETTING_KEY },
    update: { value: String(reopened) },
    create: {
      key: KNOCKOUT_PREDICTIONS_REOPENED_SETTING_KEY,
      value: String(reopened)
    }
  });
}

export async function isPredictionLockedForMatch(match: {
  kickoffAt: Date;
  stage: MatchStage;
  status: MatchStatus;
}) {
  if (
    match.status === MatchStatus.SCHEDULED &&
    isKnockoutStage(match.stage) &&
    (await areKnockoutPredictionsReopened())
  ) {
    return false;
  }

  return isMatchLocked(match.kickoffAt);
}
