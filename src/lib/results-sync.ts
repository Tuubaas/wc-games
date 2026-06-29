import { MatchStage, MatchStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { recalculateMatchPoints } from "@/lib/scoring";

const footballDataTeamSchema = z
  .object({
    id: z.number().int().nullable().optional(),
    name: z.string().nullable().optional(),
    tla: z.string().nullable().optional()
  })
  .nullable()
  .optional();

const footballDataFullTimeScoreSchema = z
  .object({
    away: z.number().int().nullable().optional(),
    awayTeam: z.number().int().nullable().optional(),
    home: z.number().int().nullable().optional(),
    homeTeam: z.number().int().nullable().optional()
  })
  .nullable()
  .optional();

const footballDataMatchSchema = z.object({
  id: z.number().int(),
  utcDate: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  status: z.string(),
  stage: z.string().nullable().optional(),
  group: z.string().nullable().optional(),
  homeTeam: footballDataTeamSchema,
  awayTeam: footballDataTeamSchema,
  score: z
    .object({
      fullTime: footballDataFullTimeScoreSchema
    })
    .nullable()
    .optional()
});

const footballDataPayloadSchema = z.object({
  filters: z
    .object({
      season: z
        .union([z.string(), z.number()])
        .transform(String)
        .optional()
    })
    .optional(),
  matches: z.array(footballDataMatchSchema).optional().default([])
});

type FootballDataTeam = z.infer<typeof footballDataTeamSchema>;
type FootballDataMatch = z.infer<typeof footballDataMatchSchema>;
type FootballDataFullTimeScore = z.infer<typeof footballDataFullTimeScoreSchema>;

class LoggedSyncError extends Error {}

const FOOTBALL_DATA_TEAM_CODE_ALIASES: Record<string, string> = {
  URY: "URU"
};
const FOOTBALL_DATA_RESULT_SOURCE = "football-data";
const FOOTBALL_DATA_PENDING_RECALC_SOURCE = "football-data-pending-recalc";

function mapStatus(status: string): MatchStatus {
  if (status === "FINISHED") return MatchStatus.FINISHED;
  if (status === "IN_PLAY" || status === "LIVE" || status === "PAUSED") {
    return MatchStatus.IN_PLAY;
  }
  if (status === "POSTPONED" || status === "SUSPENDED") return MatchStatus.POSTPONED;
  if (status === "CANCELLED") return MatchStatus.CANCELLED;
  return MatchStatus.SCHEDULED;
}

function mapStage(stage?: string | null): MatchStage {
  switch (stage) {
    case "LAST_32":
    case "ROUND_OF_32":
      return MatchStage.ROUND_OF_32;
    case "LAST_16":
    case "ROUND_OF_16":
      return MatchStage.ROUND_OF_16;
    case "QUARTER_FINALS":
      return MatchStage.QUARTER_FINAL;
    case "SEMI_FINALS":
      return MatchStage.SEMI_FINAL;
    case "THIRD_PLACE":
      return MatchStage.THIRD_PLACE;
    case "FINAL":
      return MatchStage.FINAL;
    default:
      return MatchStage.GROUP;
  }
}

function fullTimeScore(fullTime: FootballDataFullTimeScore) {
  return {
    away: fullTime?.away ?? fullTime?.awayTeam ?? null,
    home: fullTime?.home ?? fullTime?.homeTeam ?? null
  };
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function normalizeTeamCode(code?: string | null) {
  const normalizedCode = code?.trim().toUpperCase();
  if (!normalizedCode) return undefined;
  return FOOTBALL_DATA_TEAM_CODE_ALIASES[normalizedCode] ?? normalizedCode;
}

async function upsertTeam(team?: FootballDataTeam | null) {
  if (!team?.id || !team.name || team.name === "TBD") return null;
  const externalId = String(team.id);
  const fifaCode = normalizeTeamCode(team.tla);
  const existingByExternalId = await prisma.team.findUnique({ where: { externalId } });
  if (existingByExternalId) {
    if (fifaCode && existingByExternalId.fifaCode !== fifaCode) {
      const existingByCode = await prisma.team.findUnique({ where: { fifaCode } });
      if (existingByCode && existingByCode.id !== existingByExternalId.id) {
        return mergeTeamIntoCanonicalTeam({
          canonicalTeamId: existingByCode.id,
          duplicateTeamId: existingByExternalId.id,
          externalId,
          name: team.name
        });
      }
    }

    return prisma.team.update({
      where: { id: existingByExternalId.id },
      data: {
        name: team.name,
        fifaCode
      }
    });
  }

  if (fifaCode) {
    const existingByCode = await prisma.team.findUnique({ where: { fifaCode } });
    if (existingByCode) {
      return prisma.team.update({
        where: { id: existingByCode.id },
        data: {
          externalId,
          name: team.name
        }
      });
    }
  }

  return prisma.team.upsert({
    where: { externalId },
    update: {
      name: team.name,
      fifaCode
    },
    create: {
      externalId,
      name: team.name,
      fifaCode
    }
  });
}

async function mergeTeamIntoCanonicalTeam({
  canonicalTeamId,
  duplicateTeamId,
  externalId,
  name
}: {
  canonicalTeamId: string;
  duplicateTeamId: string;
  externalId: string;
  name: string;
}) {
  return prisma.$transaction(async (tx) => {
    await Promise.all([
      tx.match.updateMany({
        where: { homeTeamId: duplicateTeamId },
        data: { homeTeamId: canonicalTeamId }
      }),
      tx.match.updateMany({
        where: { awayTeamId: duplicateTeamId },
        data: { awayTeamId: canonicalTeamId }
      }),
      tx.tournamentPick.updateMany({
        where: { teamId: duplicateTeamId },
        data: { teamId: canonicalTeamId }
      }),
      tx.tournamentResult.updateMany({
        where: { winnerTeamId: duplicateTeamId },
        data: { winnerTeamId: canonicalTeamId }
      })
    ]);

    const duplicatePlayers = await tx.player.findMany({
      where: { teamId: duplicateTeamId },
      select: { id: true, name: true, position: true }
    });
    for (const player of duplicatePlayers) {
      const existingPlayer = await tx.player.findUnique({
        where: {
          teamId_name: {
            teamId: canonicalTeamId,
            name: player.name
          }
        }
      });

      if (existingPlayer) {
        await tx.tournamentPick.updateMany({
          where: { playerId: player.id },
          data: { playerId: existingPlayer.id }
        });
        await tx.tournamentTopScorerResult.updateMany({
          where: { playerId: player.id },
          data: { playerId: existingPlayer.id }
        });
        await tx.player.delete({ where: { id: player.id } });
      } else {
        await tx.player.update({
          where: { id: player.id },
          data: { teamId: canonicalTeamId }
        });
      }
    }

    await tx.team.delete({ where: { id: duplicateTeamId } });

    return tx.team.update({
      where: { id: canonicalTeamId },
      data: { externalId, name }
    });
  });
}

async function upsertMatch(item: FootballDataMatch) {
  const externalId = String(item.id);
  const homeTeam = await upsertTeam(item.homeTeam);
  const awayTeam = await upsertTeam(item.awayTeam);
  const status = mapStatus(item.status);
  const kickoffAt = new Date(item.utcDate);
  const stage = mapStage(item.stage);
  const fullTime = fullTimeScore(item.score?.fullTime);
  const hasFullTimeScore =
    status === MatchStatus.FINISHED &&
    typeof fullTime?.home === "number" &&
    typeof fullTime?.away === "number";
  const matchData = {
    externalId,
    kickoffAt,
    stage,
    groupName: item.group ?? undefined,
    homeTeamId: homeTeam?.id,
    awayTeamId: awayTeam?.id
  };
  const resultData = {
    ...matchData,
    status,
    homeScore90: hasFullTimeScore ? fullTime.home : undefined,
    awayScore90: hasFullTimeScore ? fullTime.away : undefined,
    resultSource: hasFullTimeScore ? FOOTBALL_DATA_RESULT_SOURCE : undefined
  };

  const existing = await prisma.match.findUnique({
    where: { externalId }
  });
  if (existing) {
    const seededDuplicate = await findSeededDuplicateMatch({
      awayTeamId: awayTeam?.id,
      existingMatchId: existing.id,
      homeTeamId: homeTeam?.id,
      kickoffAt,
      stage
    });

    if (seededDuplicate) {
      return mergeExternalMatchIntoSeededMatch({
        existingExternalMatchId: existing.id,
        resultData,
        seededMatchId: seededDuplicate.id,
        updateResult: existing.resultSource !== "admin"
      });
    }

    if (existing.resultSource === "admin") {
      return { match: existing, shouldRecalculate: false };
    }

    return {
      match: await prisma.match.update({
        where: { id: existing.id },
        data: resultData
      }),
      shouldRecalculate: hasFullTimeScore && didResultChange(existing, resultData)
    };
  }

  const matchWindowMs =
    stage === MatchStage.GROUP ? 60_000 : 12 * 60 * 60 * 1000;
  const windowStart = new Date(kickoffAt.getTime() - matchWindowMs);
  const windowEnd = new Date(kickoffAt.getTime() + matchWindowMs);
  const seededMatch = await findSeededDuplicateMatch({
    awayTeamId: awayTeam?.id,
    homeTeamId: homeTeam?.id,
    kickoffAt,
    stage,
    windowEnd,
    windowStart
  });

  if (seededMatch) {
    if (seededMatch.resultSource === "admin") {
      return {
        match: await prisma.match.update({
          where: { id: seededMatch.id },
          data: matchData
        }),
        shouldRecalculate: false
      };
    }

    return {
      match: await prisma.match.update({
        where: { id: seededMatch.id },
        data: resultData
      }),
      shouldRecalculate: hasFullTimeScore && didResultChange(seededMatch, resultData)
    };
  }

  return {
    match: await prisma.match.create({ data: resultData }),
    shouldRecalculate: hasFullTimeScore
  };
}

function didResultChange(
  existing: {
    awayScore90: number | null;
    resultSource: string | null;
    homeScore90: number | null;
    status: MatchStatus;
  },
  next: {
    awayScore90?: number | null;
    resultSource?: string;
    homeScore90?: number | null;
    status: MatchStatus;
  }
) {
  return (
    existing.status !== next.status ||
    existing.homeScore90 !== next.homeScore90 ||
    existing.awayScore90 !== next.awayScore90 ||
    existing.resultSource !== next.resultSource
  );
}

async function findSeededDuplicateMatch({
  awayTeamId,
  existingMatchId,
  homeTeamId,
  kickoffAt,
  stage,
  windowEnd,
  windowStart
}: {
  awayTeamId?: string | null;
  existingMatchId?: string;
  homeTeamId?: string | null;
  kickoffAt: Date;
  stage: MatchStage;
  windowEnd?: Date;
  windowStart?: Date;
}) {
  if (!homeTeamId || !awayTeamId) return null;

  const candidates = await prisma.match.findMany({
    where: {
      id: existingMatchId ? { not: existingMatchId } : undefined,
      externalId: null,
      AND: [
        { OR: [{ homeTeamId }, { homeTeamId: null }] },
        { OR: [{ awayTeamId }, { awayTeamId: null }] }
      ],
      stage,
      kickoffAt:
        windowStart && windowEnd
          ? { gte: windowStart, lte: windowEnd }
          : {
              gte: new Date(kickoffAt.getTime() - 7 * 24 * 60 * 60 * 1000),
              lte: new Date(kickoffAt.getTime() + 7 * 24 * 60 * 60 * 1000)
            }
    },
    orderBy: { kickoffAt: "asc" }
  });

  if (candidates.length === 0) return null;
  return candidates.sort(
    (a, b) => candidateScore(b, homeTeamId, awayTeamId, kickoffAt) -
      candidateScore(a, homeTeamId, awayTeamId, kickoffAt)
  )[0];
}

function candidateScore(
  match: {
    awayTeamId: string | null;
    homeTeamId: string | null;
    kickoffAt: Date;
  },
  homeTeamId: string,
  awayTeamId: string,
  kickoffAt: Date
) {
  const sideScore =
    (match.homeTeamId === homeTeamId ? 4 : match.homeTeamId === null ? 1 : 0) +
    (match.awayTeamId === awayTeamId ? 4 : match.awayTeamId === null ? 1 : 0);
  const hoursAway = Math.abs(match.kickoffAt.getTime() - kickoffAt.getTime()) / 3_600_000;
  return sideScore * 100 - hoursAway;
}

async function mergeExternalMatchIntoSeededMatch({
  existingExternalMatchId,
  resultData,
  seededMatchId,
  updateResult
}: {
  existingExternalMatchId: string;
  resultData: {
    awayScore90?: number | null;
    awayTeamId?: string;
    externalId: string;
    groupName?: string;
    homeScore90?: number | null;
    homeTeamId?: string;
    kickoffAt: Date;
    resultSource?: string;
    stage: MatchStage;
    status: MatchStatus;
  };
  seededMatchId: string;
  updateResult: boolean;
}) {
  const match = await prisma.$transaction(async (tx) => {
    const [existingPredictions, existingClassicPredictions] = await Promise.all([
      tx.prediction.findMany({ where: { matchId: existingExternalMatchId } }),
      tx.classicPrediction.findMany({ where: { matchId: existingExternalMatchId } })
    ]);

    for (const prediction of existingPredictions) {
      const duplicatePrediction = await tx.prediction.findUnique({
        where: {
          userId_matchId: {
            userId: prediction.userId,
            matchId: seededMatchId
          }
        }
      });

      if (duplicatePrediction) {
        await tx.prediction.delete({ where: { id: prediction.id } });
      } else {
        await tx.prediction.update({
          where: { id: prediction.id },
          data: { matchId: seededMatchId }
        });
      }
    }

    for (const prediction of existingClassicPredictions) {
      const duplicatePrediction = await tx.classicPrediction.findUnique({
        where: {
          leagueId_userId_matchId: {
            leagueId: prediction.leagueId,
            userId: prediction.userId,
            matchId: seededMatchId
          }
        }
      });

      if (duplicatePrediction) {
        await tx.classicPrediction.delete({ where: { id: prediction.id } });
      } else {
        await tx.classicPrediction.update({
          where: { id: prediction.id },
          data: { matchId: seededMatchId }
        });
      }
    }

    await tx.match.delete({ where: { id: existingExternalMatchId } });

    return tx.match.update({
      where: { id: seededMatchId },
      data: updateResult
        ? resultData
        : {
            externalId: resultData.externalId,
            kickoffAt: resultData.kickoffAt,
            stage: resultData.stage,
            groupName: resultData.groupName,
            homeTeamId: resultData.homeTeamId,
            awayTeamId: resultData.awayTeamId
          }
    });
  });

  return {
    match,
    shouldRecalculate: updateResult && resultData.resultSource === FOOTBALL_DATA_RESULT_SOURCE
  };
}

async function createSyncLog(status: "ok" | "failed" | "skipped", message: string) {
  await prisma.resultSyncLog.create({
    data: {
      source: "football-data",
      status,
      message
    }
  });
}

export async function syncFootballDataResults() {
  return syncFootballDataMatches();
}

export async function syncFootballDataKnockoutFixtures() {
  return syncFootballDataMatches({ knockoutOnly: true });
}

async function syncFootballDataMatches({
  knockoutOnly = false
}: {
  knockoutOnly?: boolean;
} = {}) {
  try {
    const token = process.env.FOOTBALL_DATA_TOKEN;
    if (!token) {
      await createSyncLog("skipped", "FOOTBALL_DATA_TOKEN is not configured.");
      return { failed: 0, fixtures: 0, updated: 0, skipped: true };
    }

    const response = await fetch(
      "https://api.football-data.org/v4/competitions/WC/matches?season=2026",
      {
        headers: { "X-Auth-Token": token },
        cache: "no-store"
      }
    );

    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        `football-data sync failed: ${response.status} ${message.slice(0, 300)}`
      );
    }

    const rawPayload = await response.json();
    const parsedPayload = footballDataPayloadSchema.safeParse(rawPayload);
    if (!parsedPayload.success) {
      const issue = parsedPayload.error.issues[0];
      const detail = issue
        ? `${issue.path.join(".") || "root"}: ${issue.message}`
        : "unknown schema mismatch";
      throw new Error(`football-data response did not match the expected shape: ${detail}`);
    }

    const payload = parsedPayload.data;
    if (payload.filters?.season && payload.filters.season !== "2026") {
      throw new Error(`football-data returned season ${payload.filters.season}.`);
    }

    let failed = 0;
    let fixtures = 0;
    let updated = 0;
    const failureDetails: string[] = [];

    const matches = knockoutOnly
      ? payload.matches.filter((item) => mapStage(item.stage) !== MatchStage.GROUP)
      : payload.matches;

    for (const item of matches) {
      try {
        const { match, shouldRecalculate } = await upsertMatch(item);
        fixtures += 1;

        if (shouldRecalculate) {
          try {
            await recalculateMatchPoints(match.id);
          } catch (error) {
            await markMatchForRecalculation(match.id);
            throw error;
          }
          updated += 1;
        }
      } catch (error) {
        failed += 1;
        if (failureDetails.length < 3) {
          failureDetails.push(`${item.id}: ${errorMessage(error)}`);
        }
      }
    }

    const scope = knockoutOnly ? "knockout fixtures" : "fixtures";
    const message =
      failed > 0
        ? `Synced ${fixtures} ${scope}, updated ${updated} finished matches, failed ${failed}: ${failureDetails.join(" | ")}`
        : `Synced ${fixtures} ${scope} and updated ${updated} finished matches.`;

    await createSyncLog(failed > 0 ? "failed" : "ok", message.slice(0, 500));

    if (failed > 0) {
      throw new LoggedSyncError(message);
    }

    return { failed, fixtures, updated, skipped: false };
  } catch (error) {
    if (!(error instanceof LoggedSyncError)) {
      const message = errorMessage(error).slice(0, 500);
      await createSyncLog("failed", message);
    }
    throw error;
  }
}

async function markMatchForRecalculation(matchId: string) {
  await prisma.match.update({
    where: { id: matchId },
    data: { resultSource: FOOTBALL_DATA_PENDING_RECALC_SOURCE }
  });
}
