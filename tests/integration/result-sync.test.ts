import { MatchStage, MatchStatus, PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { assertSafeTestDatabase } from "../helpers/test-db";

const runDbTests = process.env.RUN_DB_TESTS === "true";
const runId = `vitest_${Date.now()}`;
const testStartedAt = new Date();
const testMatchNumber = 880000 + Math.floor(Math.random() * 5000);
const aliasMatchNumber = testMatchNumber + 1;
const knockoutMatchNumber = testMatchNumber + 2;

let prisma: PrismaClient;
let syncFootballDataResults: typeof import("@/lib/results-sync").syncFootballDataResults;
let syncFootballDataKnockoutFixtures: typeof import("@/lib/results-sync").syncFootballDataKnockoutFixtures;

describe.runIf(runDbTests)("football-data result sync", () => {
  beforeAll(async () => {
    assertSafeTestDatabase();
    process.env.FOOTBALL_DATA_TOKEN = "test-token";
    const db = await import("@/lib/db");
    const sync = await import("@/lib/results-sync");
    prisma = db.prisma;
    syncFootballDataResults = sync.syncFootballDataResults;
    syncFootballDataKnockoutFixtures = sync.syncFootballDataKnockoutFixtures;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.prediction.deleteMany({
      where: { user: { email: { endsWith: `.${runId}@example.test` } } }
    });
    await prisma.session.deleteMany({
      where: { user: { email: { endsWith: `.${runId}@example.test` } } }
    });
    await prisma.user.deleteMany({
      where: { email: { endsWith: `.${runId}@example.test` } }
    });
    await prisma.match.deleteMany({
      where: {
        OR: [
          { externalId: { startsWith: runId } },
          { matchNumber: { in: [testMatchNumber, aliasMatchNumber, knockoutMatchNumber] } }
        ]
      }
    });
    await prisma.team.deleteMany({
      where: { fifaCode: { in: ["TST", "OPP", "URU", "KSA", "URY", "K32", "R32"] } }
    });
    await prisma.resultSyncLog.deleteMany({
      where: { createdAt: { gte: testStartedAt } }
    });
  });

  it("updates seeded matches, recalculates prediction points, and protects admin corrections", async () => {
    const homeTeam = await prisma.team.upsert({
      where: { fifaCode: "TST" },
      update: { name: `${runId} Home`, externalId: null },
      create: { name: `${runId} Home`, fifaCode: "TST" }
    });
    const awayTeam = await prisma.team.upsert({
      where: { fifaCode: "OPP" },
      update: { name: `${runId} Away`, externalId: null },
      create: { name: `${runId} Away`, fifaCode: "OPP" }
    });
    const user = await prisma.user.create({
      data: {
        email: `predictor.${runId}@example.test`,
        username: `predictor_${runId}`,
        name: "Predictor"
      }
    });
    const kickoffAt = new Date("2026-06-11T19:00:00.000Z");
    const match = await prisma.match.create({
      data: {
        matchNumber: testMatchNumber,
        stage: MatchStage.GROUP,
        groupName: "A",
        kickoffAt,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        status: MatchStatus.SCHEDULED
      }
    });
    await prisma.prediction.create({
      data: {
        userId: user.id,
        matchId: match.id,
        homeGoals: 2,
        awayGoals: 1
      }
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            filters: { season: 2026 },
            matches: [
              {
                id: 990001,
                utcDate: kickoffAt.toISOString(),
                status: "FINISHED",
                stage: "GROUP_STAGE",
                group: "A",
                homeTeam: { id: 111001, name: `${runId} Home`, tla: "TST" },
                awayTeam: { id: 111002, name: `${runId} Away`, tla: "OPP" },
                score: { fullTime: { homeTeam: 2, awayTeam: 1 } }
              }
            ]
          }),
          { status: 200 }
        );
      })
    );

    const firstSync = await syncFootballDataResults();
    expect(firstSync.updated).toBe(1);

    const updatedMatch = await prisma.match.findUniqueOrThrow({
      where: { id: match.id }
    });
    expect(updatedMatch.externalId).toBe("990001");
    expect(updatedMatch.status).toBe(MatchStatus.FINISHED);
    expect(updatedMatch.homeScore90).toBe(2);
    expect(updatedMatch.awayScore90).toBe(1);

    const prediction = await prisma.prediction.findUniqueOrThrow({
      where: { userId_matchId: { userId: user.id, matchId: match.id } }
    });
    expect(prediction.points).toBe(8);

    const unchangedSync = await syncFootballDataResults();
    expect(unchangedSync.updated).toBe(0);

    await prisma.match.update({
      where: { id: match.id },
      data: {
        homeScore90: 0,
        awayScore90: 0,
        resultSource: "admin"
      }
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            filters: { season: 2026 },
            matches: [
              {
                id: 990001,
                utcDate: kickoffAt.toISOString(),
                status: "FINISHED",
                stage: "GROUP_STAGE",
                group: "A",
                homeTeam: { id: 111001, name: `${runId} Home`, tla: "TST" },
                awayTeam: { id: 111002, name: `${runId} Away`, tla: "OPP" },
                score: { fullTime: { homeTeam: 4, awayTeam: 4 } }
              }
            ]
          }),
          { status: 200 }
        );
      })
    );

    await syncFootballDataResults();

    const protectedMatch = await prisma.match.findUniqueOrThrow({
      where: { id: match.id }
    });
    expect(protectedMatch.homeScore90).toBe(0);
    expect(protectedMatch.awayScore90).toBe(0);
    expect(protectedMatch.resultSource).toBe("admin");
  });

  it("normalizes football-data team aliases and merges duplicate fixtures", async () => {
    const [uruguay, saudiArabia] = await Promise.all([
      prisma.team.upsert({
        where: { fifaCode: "URU" },
        update: { name: `${runId} Uruguay`, externalId: null },
        create: { name: `${runId} Uruguay`, fifaCode: "URU" }
      }),
      prisma.team.upsert({
        where: { fifaCode: "KSA" },
        update: { name: `${runId} Saudi Arabia`, externalId: null },
        create: { name: `${runId} Saudi Arabia`, fifaCode: "KSA" }
      })
    ]);
    const seededKickoffAt = new Date("2026-06-12T19:00:00.000Z");
    await prisma.match.create({
      data: {
        matchNumber: aliasMatchNumber,
        stage: MatchStage.GROUP,
        groupName: "H",
        kickoffAt: seededKickoffAt,
        homeTeamId: saudiArabia.id,
        awayTeamId: uruguay.id,
        status: MatchStatus.SCHEDULED
      }
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            filters: { season: 2026 },
            matches: [
              {
                id: 990002,
                utcDate: new Date("2026-06-13T19:00:00.000Z").toISOString(),
                status: "SCHEDULED",
                stage: "GROUP_STAGE",
                group: "H",
                homeTeam: { id: 222001, name: `${runId} Saudi Arabia`, tla: "KSA" },
                awayTeam: { id: 222002, name: `${runId} Uruguay`, tla: "URY" },
                score: { fullTime: { homeTeam: null, awayTeam: null } }
              }
            ]
          }),
          { status: 200 }
        );
      })
    );

    await syncFootballDataResults();

    const [matches, canonicalUruguay, duplicateUruguay] = await Promise.all([
      prisma.match.findMany({
        where: {
          OR: [
            { matchNumber: aliasMatchNumber },
            { externalId: "990002" }
          ]
        },
        include: { awayTeam: true }
      }),
      prisma.team.findUnique({ where: { fifaCode: "URU" } }),
      prisma.team.findUnique({ where: { fifaCode: "URY" } })
    ]);

    expect(matches).toHaveLength(1);
    expect(matches[0].externalId).toBe("990002");
    expect(matches[0].awayTeam?.fifaCode).toBe("URU");
    expect(canonicalUruguay?.externalId).toBe("222002");
    expect(duplicateUruguay).toBeNull();
  });

  it("fills seeded knockout fixture slots when teams become known", async () => {
    const knockoutTeam = await prisma.team.upsert({
      where: { fifaCode: "K32" },
      update: { name: `${runId} Knockout`, externalId: null },
      create: { name: `${runId} Knockout`, fifaCode: "K32" }
    });
    await prisma.match.create({
      data: {
        matchNumber: knockoutMatchNumber,
        stage: MatchStage.ROUND_OF_32,
        kickoffAt: new Date("2026-06-28T17:00:00.000Z"),
        homeTeamId: knockoutTeam.id,
        status: MatchStatus.SCHEDULED
      }
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            filters: { season: 2026 },
            matches: [
              {
                id: 990003,
                utcDate: new Date("2026-06-28T19:00:00.000Z").toISOString(),
                status: "SCHEDULED",
                stage: "LAST_32",
                group: null,
                homeTeam: { id: 333001, name: `${runId} Knockout`, tla: "K32" },
                awayTeam: { id: 333002, name: `${runId} Rival`, tla: "R32" },
                score: { fullTime: { homeTeam: null, awayTeam: null } }
              }
            ]
          }),
          { status: 200 }
        );
      })
    );

    await syncFootballDataKnockoutFixtures();

    const matches = await prisma.match.findMany({
      where: {
        OR: [{ matchNumber: knockoutMatchNumber }, { externalId: "990003" }]
      },
      include: { homeTeam: true, awayTeam: true }
    });

    expect(matches).toHaveLength(1);
    expect(matches[0].matchNumber).toBe(knockoutMatchNumber);
    expect(matches[0].externalId).toBe("990003");
    expect(matches[0].stage).toBe(MatchStage.ROUND_OF_32);
    expect(matches[0].homeTeam?.fifaCode).toBe("K32");
    expect(matches[0].awayTeam?.fifaCode).toBe("R32");
  });
});

describe.skipIf(runDbTests)("football-data result sync", () => {
  it("is skipped unless RUN_DB_TESTS=true", () => {
    expect(true).toBe(true);
  });
});
