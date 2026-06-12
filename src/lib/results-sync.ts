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

async function upsertTeam(team?: FootballDataTeam | null) {
  if (!team?.id || !team.name || team.name === "TBD") return null;
  const externalId = String(team.id);
  const fifaCode = team.tla || undefined;
  const existingByExternalId = await prisma.team.findUnique({ where: { externalId } });
  if (existingByExternalId) {
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
    resultSource: hasFullTimeScore ? "football-data" : undefined
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
      return { match: existing, hasFullTimeScore: false };
    }

    return {
      match: await prisma.match.update({
        where: { id: existing.id },
        data: resultData
      }),
      hasFullTimeScore
    };
  }

  const minuteBefore = new Date(kickoffAt.getTime() - 60_000);
  const minuteAfter = new Date(kickoffAt.getTime() + 60_000);
  const seededMatch = await findSeededDuplicateMatch({
    awayTeamId: awayTeam?.id,
    homeTeamId: homeTeam?.id,
    kickoffAt,
    stage,
    windowEnd: minuteAfter,
    windowStart: minuteBefore
  });

  if (seededMatch) {
    if (seededMatch.resultSource === "admin") {
      return {
        match: await prisma.match.update({
          where: { id: seededMatch.id },
          data: matchData
        }),
        hasFullTimeScore: false
      };
    }

    return {
      match: await prisma.match.update({
        where: { id: seededMatch.id },
        data: resultData
      }),
      hasFullTimeScore
    };
  }

  return {
    match: await prisma.match.create({ data: resultData }),
    hasFullTimeScore
  };
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
      homeTeamId,
      awayTeamId,
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
    (a, b) =>
      Math.abs(a.kickoffAt.getTime() - kickoffAt.getTime()) -
      Math.abs(b.kickoffAt.getTime() - kickoffAt.getTime())
  )[0];
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
    hasFullTimeScore: updateResult && resultData.resultSource === "football-data"
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
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) {
    await createSyncLog("skipped", "FOOTBALL_DATA_TOKEN is not configured.");
    return { updated: 0, skipped: true };
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
    await createSyncLog("failed", message.slice(0, 500));
    throw new Error(`football-data sync failed: ${response.status}`);
  }

  const rawPayload = await response.json();
  const parsedPayload = footballDataPayloadSchema.safeParse(rawPayload);
  if (!parsedPayload.success) {
    const issue = parsedPayload.error.issues[0];
    const detail = issue
      ? `${issue.path.join(".") || "root"}: ${issue.message}`
      : "unknown schema mismatch";
    await createSyncLog(
      "failed",
      `football-data response did not match the expected shape: ${detail}`.slice(
        0,
        500
      )
    );
    throw new Error(`football-data response did not match the expected shape: ${detail}`);
  }

  const payload = parsedPayload.data;
  if (payload.filters?.season && payload.filters.season !== "2026") {
    await createSyncLog("failed", `football-data returned season ${payload.filters.season}.`);
    throw new Error(`football-data returned season ${payload.filters.season}.`);
  }

  let updated = 0;

  for (const item of payload.matches) {
    const { match, hasFullTimeScore } = await upsertMatch(item);

    if (hasFullTimeScore) {
      await recalculateMatchPoints(match.id);
      updated += 1;
    }
  }

  await createSyncLog("ok", `Updated ${updated} finished matches.`);

  return { updated, skipped: false };
}
