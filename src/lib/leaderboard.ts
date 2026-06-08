import { LeagueType, MatchStage, MatchStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { scoreGroupPlacementBonus } from "@/lib/group-standings";
import { matchLockTime } from "@/lib/time";

type PointRow = {
  id: string;
  username: string;
  points: number;
};

export type RankedRow = PointRow & {
  rank: number;
};

export function rankRows(rows: PointRow[]): RankedRow[] {
  const sorted = [...rows].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return a.username.localeCompare(b.username);
  });

  let currentRank = 0;
  let previousPoints: number | null = null;

  return sorted.map((row, index) => {
    if (previousPoints !== row.points) {
      currentRank = index + 1;
      previousPoints = row.points;
    }

    return { ...row, rank: currentRank };
  });
}

export async function getUserPointTotals(userIds?: string[]) {
  if (userIds?.length === 0) return new Map<string, number>();

  const where = userIds ? { userId: { in: userIds } } : undefined;
  const [predictionTotals, pickTotals] = await Promise.all([
    prisma.prediction.groupBy({
      by: ["userId"],
      _sum: { points: true },
      where
    }),
    getTournamentPickTotals(userIds)
  ]);
  const totals = new Map<string, number>();

  for (const row of predictionTotals) {
    totals.set(row.userId, (totals.get(row.userId) ?? 0) + (row._sum.points ?? 0));
  }

  mergeTotals(totals, pickTotals);
  return totals;
}

type LeagueForTotals = {
  id: string;
  type: LeagueType;
  members: Array<{ userId: string; createdAt: Date }>;
};

export async function getLeaguePointTotals(league: LeagueForTotals) {
  const userIds = league.members.map((member) => member.userId);
  if (userIds.length === 0) return new Map<string, number>();
  if (league.type === LeagueType.DYNAMIC) return getUserPointTotals(userIds);

  const totals = new Map(userIds.map((userId) => [userId, 0]));
  const [
    firstGroupMatch,
    groupMatches,
    groupPredictions,
    classicPredictions,
    nonGroupPredictions,
    pickTotals
  ] = await Promise.all([
    prisma.match.findFirst({
      where: { stage: MatchStage.GROUP },
      orderBy: { kickoffAt: "asc" },
      select: { kickoffAt: true }
    }),
    prisma.match.findMany({
      where: { stage: MatchStage.GROUP },
      select: {
        id: true,
        groupName: true,
        homeTeamId: true,
        awayTeamId: true,
        homeScore90: true,
        awayScore90: true,
        status: true
      },
      orderBy: { kickoffAt: "asc" }
    }),
    prisma.prediction.findMany({
      where: {
        userId: { in: userIds },
        match: { stage: MatchStage.GROUP }
      },
      select: {
        userId: true,
        matchId: true,
        homeGoals: true,
        awayGoals: true,
        points: true,
        updatedAt: true
      }
    }),
    prisma.classicPrediction.findMany({
      where: { leagueId: league.id, userId: { in: userIds } },
      select: {
        userId: true,
        matchId: true,
        homeGoals: true,
        awayGoals: true,
        points: true
      }
    }),
    prisma.prediction.findMany({
      where: {
        userId: { in: userIds },
        match: { stage: { not: MatchStage.GROUP } }
      },
      select: { userId: true, points: true }
    }),
    getTournamentPickTotals(userIds)
  ]);

  for (const prediction of nonGroupPredictions) {
    totals.set(prediction.userId, (totals.get(prediction.userId) ?? 0) + prediction.points);
  }
  mergeTotals(totals, pickTotals);

  if (!firstGroupMatch) return totals;

  const lockTime = matchLockTime(firstGroupMatch.kickoffAt);
  const lockMs = lockTime.getTime();
  const eligibleMembers = league.members.filter(
    (member) => member.createdAt.getTime() <= lockMs
  );
  const groupPredictionsByUserMatch = new Map(
    groupPredictions.map((prediction) => [
      userMatchKey(prediction.userId, prediction.matchId),
      prediction
    ])
  );
  const classicPredictionsByUserMatch = new Map(
    classicPredictions.map((prediction) => [
      userMatchKey(prediction.userId, prediction.matchId),
      prediction
    ])
  );
  const actualScores = groupMatches
    .filter(
      (match) =>
        match.status === MatchStatus.FINISHED &&
        match.homeScore90 !== null &&
        match.awayScore90 !== null
    )
    .map((match) => ({
      matchId: match.id,
      homeGoals: match.homeScore90 as number,
      awayGoals: match.awayScore90 as number
    }));

  for (const member of eligibleMembers) {
    const predictedScores = [];

    for (const match of groupMatches) {
      const key = userMatchKey(member.userId, match.id);
      const classicPrediction = classicPredictionsByUserMatch.get(key);
      const prediction = groupPredictionsByUserMatch.get(key);
      const frozenPrediction =
        classicPrediction ??
        (prediction && prediction.updatedAt.getTime() <= lockMs ? prediction : null);

      if (!frozenPrediction) continue;

      totals.set(
        member.userId,
        (totals.get(member.userId) ?? 0) + frozenPrediction.points
      );
      predictedScores.push({
        matchId: match.id,
        homeGoals: frozenPrediction.homeGoals,
        awayGoals: frozenPrediction.awayGoals
      });
    }

    totals.set(
      member.userId,
      (totals.get(member.userId) ?? 0) +
        scoreGroupPlacementBonus(groupMatches, actualScores, predictedScores)
    );
  }

  return totals;
}

async function getTournamentPickTotals(userIds?: string[]) {
  const where = userIds ? { userId: { in: userIds } } : undefined;
  const pickTotals = await prisma.tournamentPick.groupBy({
    by: ["userId"],
    _sum: { points: true },
    where
  });

  const totals = new Map<string, number>();
  for (const row of pickTotals) {
    totals.set(row.userId, row._sum.points ?? 0);
  }
  return totals;
}

function mergeTotals(target: Map<string, number>, source: Map<string, number>) {
  for (const [userId, points] of source) {
    target.set(userId, (target.get(userId) ?? 0) + points);
  }
}

function userMatchKey(userId: string, matchId: string) {
  return `${userId}:${matchId}`;
}
