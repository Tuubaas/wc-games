import {
  Match,
  MatchStatus,
  Prediction,
  TournamentPickType
} from "@prisma/client";
import { MATCH_POINTS, TOURNAMENT_ID, TOURNAMENT_PICK_POINTS } from "@/lib/config";
import { prisma } from "@/lib/db";

type Outcome = "HOME" | "DRAW" | "AWAY";

export function getOutcome(homeGoals: number, awayGoals: number): Outcome {
  if (homeGoals > awayGoals) return "HOME";
  if (homeGoals < awayGoals) return "AWAY";
  return "DRAW";
}

export function scoreMatchPrediction(
  prediction: Pick<Prediction, "homeGoals" | "awayGoals">,
  match: Pick<Match, "homeScore90" | "awayScore90" | "status">
) {
  if (
    match.status !== MatchStatus.FINISHED ||
    match.homeScore90 === null ||
    match.awayScore90 === null
  ) {
    return 0;
  }

  let points = 0;
  const predictedOutcome = getOutcome(prediction.homeGoals, prediction.awayGoals);
  const actualOutcome = getOutcome(match.homeScore90, match.awayScore90);

  if (predictedOutcome === actualOutcome) points += MATCH_POINTS.outcome;
  if (prediction.homeGoals === match.homeScore90) points += MATCH_POINTS.homeGoals;
  if (prediction.awayGoals === match.awayScore90) points += MATCH_POINTS.awayGoals;
  if (
    prediction.homeGoals === match.homeScore90 &&
    prediction.awayGoals === match.awayScore90
  ) {
    points += MATCH_POINTS.exactScore;
  }

  return points;
}

export async function recalculateMatchPoints(matchId: string) {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return;

  const predictions = await prisma.prediction.findMany({ where: { matchId } });
  for (const prediction of predictions) {
    await prisma.prediction.update({
      where: { id: prediction.id },
      data: { points: scoreMatchPrediction(prediction, match) }
    });
  }
}

export async function recalculateTournamentPoints() {
  const result = await prisma.tournamentResult.findUnique({
    where: { id: TOURNAMENT_ID },
    include: { topScorers: true }
  });
  const topScorerIds = new Set(result?.topScorers.map((item) => item.playerId) ?? []);

  const picks = await prisma.tournamentPick.findMany();
  for (const pick of picks) {
    const winnerPoints =
      pick.type === TournamentPickType.WINNER &&
      result?.winnerTeamId &&
      pick.teamId === result.winnerTeamId
        ? TOURNAMENT_PICK_POINTS
        : 0;
    const scorerPoints =
      pick.type === TournamentPickType.TOP_SCORER &&
      pick.playerId &&
      topScorerIds.has(pick.playerId)
        ? TOURNAMENT_PICK_POINTS
        : 0;

    await prisma.tournamentPick.update({
      where: { id: pick.id },
      data: { points: winnerPoints + scorerPoints }
    });
  }
}

export async function recalculateAllPoints() {
  const matches = await prisma.match.findMany({ select: { id: true } });
  for (const match of matches) {
    await recalculateMatchPoints(match.id);
  }
  await recalculateTournamentPoints();
}
