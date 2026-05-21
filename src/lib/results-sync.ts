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
      fullTime: z
        .object({
          home: z.number().int().nullable().optional(),
          away: z.number().int().nullable().optional()
        })
        .nullable()
        .optional()
    })
    .nullable()
    .optional()
});

const footballDataPayloadSchema = z.object({
  filters: z
    .object({
      season: z.string().optional()
    })
    .optional(),
  matches: z.array(footballDataMatchSchema).optional().default([])
});

type FootballDataTeam = z.infer<typeof footballDataTeamSchema>;
type FootballDataMatch = z.infer<typeof footballDataMatchSchema>;

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
  const fullTime = item.score?.fullTime;
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
  const seededMatch =
    homeTeam && awayTeam
      ? await prisma.match.findFirst({
          where: {
            externalId: null,
            homeTeamId: homeTeam.id,
            awayTeamId: awayTeam.id,
            kickoffAt: { gte: minuteBefore, lte: minuteAfter }
          }
        })
      : null;

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
    await createSyncLog("failed", "football-data response did not match the expected shape.");
    throw new Error("football-data response did not match the expected shape.");
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
