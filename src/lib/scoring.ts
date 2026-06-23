import {
  LeagueType,
  Match,
  MatchStage,
  MatchStatus,
  Prediction,
  TournamentPickType
} from "@prisma/client";
import { MATCH_POINTS, TOURNAMENT_ID, TOURNAMENT_PICK_POINTS } from "@/lib/config";
import { prisma } from "@/lib/db";
import { isMatchLocked, matchLockTime } from "@/lib/time";

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

  const [predictions, classicPredictions] = await Promise.all([
    prisma.prediction.findMany({ where: { matchId } }),
    prisma.classicPrediction.findMany({ where: { matchId } })
  ]);
  const updates = [
    ...predictions.map((prediction) =>
      prisma.prediction.update({
        where: { id: prediction.id },
        data: {
          points: scoreMatchPrediction(prediction, match),
          updatedAt: prediction.updatedAt
        }
      })
    ),
    ...classicPredictions.map((prediction) =>
      prisma.classicPrediction.update({
        where: { id: prediction.id },
        data: {
          points: scoreMatchPrediction(prediction, match),
          updatedAt: prediction.updatedAt
        }
      })
    )
  ];

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }
}

export async function freezeClassicGroupPredictionsForUser(userId: string) {
  const firstGroupMatch = await prisma.match.findFirst({
    where: { stage: MatchStage.GROUP },
    orderBy: { kickoffAt: "asc" }
  });

  if (!firstGroupMatch || !isMatchLocked(firstGroupMatch.kickoffAt)) return;

  const lockTime = matchLockTime(firstGroupMatch.kickoffAt);
  const [memberships, predictions] = await Promise.all([
    prisma.leagueMember.findMany({
      where: {
        userId,
        createdAt: { lte: lockTime },
        league: { type: LeagueType.CLASSIC }
      },
      select: { leagueId: true }
    }),
    prisma.prediction.findMany({
      where: {
        userId,
        createdAt: { lte: lockTime },
        match: { stage: MatchStage.GROUP }
      },
      include: { match: true }
    })
  ]);

  if (memberships.length === 0 || predictions.length === 0) return;

  await prisma.classicPrediction.createMany({
    data: memberships.flatMap((membership) =>
      predictions.map((prediction) => ({
        leagueId: membership.leagueId,
        userId,
        matchId: prediction.matchId,
        homeGoals: prediction.homeGoals,
        awayGoals: prediction.awayGoals,
        points: scoreMatchPrediction(prediction, prediction.match)
      }))
    ),
    skipDuplicates: true
  });
}

export async function freezeAllClassicGroupPredictions(now = new Date()) {
  const firstGroupMatch = await prisma.match.findFirst({
    where: { stage: MatchStage.GROUP },
    orderBy: { kickoffAt: "asc" }
  });

  if (!firstGroupMatch) {
    return { candidates: 0, created: 0, skipped: "no-group-match" };
  }
  if (!isMatchLocked(firstGroupMatch.kickoffAt, now)) {
    return { candidates: 0, created: 0, skipped: "not-locked" };
  }

  const lockTime = matchLockTime(firstGroupMatch.kickoffAt);
  const [memberships, predictions] = await Promise.all([
    prisma.leagueMember.findMany({
      where: {
        createdAt: { lte: lockTime },
        league: { type: LeagueType.CLASSIC }
      },
      select: { leagueId: true, userId: true }
    }),
    prisma.prediction.findMany({
      where: {
        createdAt: { lte: lockTime },
        match: { stage: MatchStage.GROUP }
      },
      include: { match: true }
    })
  ]);

  if (memberships.length === 0 || predictions.length === 0) {
    return { candidates: 0, created: 0, skipped: null };
  }

  const membershipsByUser = new Map<string, string[]>();
  for (const membership of memberships) {
    const leagueIds = membershipsByUser.get(membership.userId) ?? [];
    leagueIds.push(membership.leagueId);
    membershipsByUser.set(membership.userId, leagueIds);
  }

  const snapshotRows = predictions.flatMap((prediction) => {
    const leagueIds = membershipsByUser.get(prediction.userId) ?? [];
    return leagueIds.map((leagueId) => ({
      leagueId,
      userId: prediction.userId,
      matchId: prediction.matchId,
      homeGoals: prediction.homeGoals,
      awayGoals: prediction.awayGoals,
      points: scoreMatchPrediction(prediction, prediction.match)
    }));
  });

  if (snapshotRows.length === 0) {
    return { candidates: 0, created: 0, skipped: null };
  }

  const result = await prisma.classicPrediction.createMany({
    data: snapshotRows,
    skipDuplicates: true
  });

  return { candidates: snapshotRows.length, created: result.count, skipped: null };
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
