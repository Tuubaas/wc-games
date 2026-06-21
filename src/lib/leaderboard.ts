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

type LeagueForProgress = {
  id: string;
  type: LeagueType;
  members: Array<{
    userId: string;
    createdAt: Date;
    user: { username: string | null };
  }>;
};

type ProgressEvent = {
  id: string;
  label: string;
  scores: Record<string, number>;
};

type ProgressMatch = {
  id: string;
  matchNumber: number | null;
  stage: MatchStage;
  groupName: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore90: number | null;
  awayScore90: number | null;
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
    pickTotals,
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
        createdAt: true,
        updatedAt: true,
        userId: true,
        matchId: true,
        homeGoals: true,
        awayGoals: true,
        points: true
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

  for (const member of league.members) {
    const predictedScores = [];

    for (const match of groupMatches) {
      const key = userMatchKey(member.userId, match.id);
      const classicPrediction = classicPredictionsByUserMatch.get(key);
      const prediction = groupPredictionsByUserMatch.get(key);
      const eligibleFallbackPrediction =
        prediction &&
        member.createdAt.getTime() <= lockMs &&
        prediction.createdAt.getTime() <= lockMs &&
        prediction.updatedAt.getTime() <= lockMs;
      const frozenPrediction =
        classicPrediction ??
        (eligibleFallbackPrediction ? prediction : null);

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

export async function getLeagueScoreProgress(league: LeagueForProgress) {
  const userIds = league.members.map((member) => member.userId);
  if (userIds.length === 0) return { events: [], players: [] };

  const players = league.members.map((member) => ({
    id: member.userId,
    username: member.user.username ?? "unknown"
  }));
  const finishedMatchWhere = {
    status: MatchStatus.FINISHED,
    homeScore90: { not: null },
    awayScore90: { not: null }
  };
  const [matches, predictions, pickTotals] = await Promise.all([
    prisma.match.findMany({
      where: finishedMatchWhere,
      select: {
        id: true,
        matchNumber: true,
        stage: true,
        groupName: true,
        homeTeamId: true,
        awayTeamId: true,
        homeScore90: true,
        awayScore90: true,
        kickoffAt: true
      },
      orderBy: [{ kickoffAt: "asc" }, { matchNumber: "asc" }]
    }),
    prisma.prediction.findMany({
      where: { userId: { in: userIds } },
      select: {
        createdAt: true,
        updatedAt: true,
        userId: true,
        matchId: true,
        homeGoals: true,
        awayGoals: true,
        points: true
      }
    }),
    getTournamentPickTotals(userIds)
  ]);
  const totals = new Map(userIds.map((userId) => [userId, 0]));
  const events: ProgressEvent[] = [
    {
      id: "start",
      label: "Start",
      scores: scoresFromTotals(userIds, totals)
    }
  ];

  if (league.type === LeagueType.DYNAMIC) {
    const predictionsByUserMatch = new Map(
      predictions.map((prediction) => [
        userMatchKey(prediction.userId, prediction.matchId),
        prediction
      ])
    );

    for (const match of matches) {
      for (const userId of userIds) {
        const prediction = predictionsByUserMatch.get(userMatchKey(userId, match.id));
        if (prediction) totals.set(userId, (totals.get(userId) ?? 0) + prediction.points);
      }
      events.push(matchProgressEvent(match, userIds, totals));
    }
  } else {
    await addClassicProgressEvents(league, matches, predictions, totals, events);
  }

  mergeTotals(totals, pickTotals);
  if (Array.from(pickTotals.values()).some((points) => points > 0)) {
    events.push({
      id: "tournament-picks",
      label: "Picks",
      scores: scoresFromTotals(userIds, totals)
    });
  }

  return { events, players };
}

async function addClassicProgressEvents(
  league: LeagueForProgress,
  matches: ProgressMatch[],
  predictions: Array<{
    createdAt: Date;
    updatedAt: Date;
    userId: string;
    matchId: string;
    homeGoals: number;
    awayGoals: number;
    points: number;
  }>,
  totals: Map<string, number>,
  events: ProgressEvent[]
) {
  const userIds = league.members.map((member) => member.userId);
  const firstGroupMatch = await prisma.match.findFirst({
    where: { stage: MatchStage.GROUP },
    orderBy: { kickoffAt: "asc" },
    select: { kickoffAt: true }
  });
  const lockMs = firstGroupMatch
    ? matchLockTime(firstGroupMatch.kickoffAt).getTime()
    : Number.POSITIVE_INFINITY;
  const membersByUserId = new Map(
    league.members.map((member) => [member.userId, member])
  );
  const [allGroupMatches, classicPredictions] = await Promise.all([
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
    prisma.classicPrediction.findMany({
      where: { leagueId: league.id, userId: { in: userIds } },
      select: {
        userId: true,
        matchId: true,
        homeGoals: true,
        awayGoals: true,
        points: true
      }
    })
  ]);
  const predictionsByUserMatch = new Map(
    predictions.map((prediction) => [
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
  const predictedGroupScoresByUser = new Map<
    string,
    Array<{ matchId: string; homeGoals: number; awayGoals: number }>
  >();
  const finishedGroupScores: Array<{
    matchId: string;
    homeGoals: number;
    awayGoals: number;
  }> = [];
  let placementBonusAdded = false;

  for (const match of matches) {
    if (
      match.stage === MatchStage.GROUP &&
      match.homeScore90 !== null &&
      match.awayScore90 !== null
    ) {
      finishedGroupScores.push({
        matchId: match.id,
        homeGoals: match.homeScore90,
        awayGoals: match.awayScore90
      });
    }

    for (const userId of userIds) {
      const key = userMatchKey(userId, match.id);
      const prediction = predictionsByUserMatch.get(key);
      const classicPrediction = classicPredictionsByUserMatch.get(key);
      const member = membersByUserId.get(userId);
      const eligibleFallbackPrediction =
        prediction &&
        member &&
        member.createdAt.getTime() <= lockMs &&
        prediction.createdAt.getTime() <= lockMs &&
        prediction.updatedAt.getTime() <= lockMs;
      const frozenPrediction =
        match.stage === MatchStage.GROUP
          ? classicPrediction ??
            (eligibleFallbackPrediction ? prediction : null)
          : prediction;

      if (!frozenPrediction) continue;

      totals.set(userId, (totals.get(userId) ?? 0) + frozenPrediction.points);
      if (match.stage === MatchStage.GROUP) {
        const predictedScores = predictedGroupScoresByUser.get(userId) ?? [];
        predictedScores.push({
          matchId: match.id,
          homeGoals: frozenPrediction.homeGoals,
          awayGoals: frozenPrediction.awayGoals
        });
        predictedGroupScoresByUser.set(userId, predictedScores);
      }
    }

    if (match.stage === MatchStage.GROUP && !placementBonusAdded) {
      const groupBonusByUser = userIds.map((userId) => [
        userId,
        scoreGroupPlacementBonus(
          allGroupMatches,
          finishedGroupScores,
          predictedGroupScoresByUser.get(userId) ?? []
        )
      ] as const);

      if (groupBonusByUser.some(([, bonus]) => bonus > 0)) {
        for (const [userId, bonus] of groupBonusByUser) {
          totals.set(userId, (totals.get(userId) ?? 0) + bonus);
        }
        placementBonusAdded = true;
      }
    }

    events.push(matchProgressEvent(match, userIds, totals));
  }
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

function scoresFromTotals(userIds: string[], totals: Map<string, number>) {
  return Object.fromEntries(userIds.map((userId) => [userId, totals.get(userId) ?? 0]));
}

function matchProgressEvent(
  match: { id: string; matchNumber: number | null },
  userIds: string[],
  totals: Map<string, number>
) {
  return {
    id: match.id,
    label: match.matchNumber ? `M${match.matchNumber}` : "Match",
    scores: scoresFromTotals(userIds, totals)
  };
}
