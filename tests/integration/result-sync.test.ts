import { MatchStage, MatchStatus, PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { assertSafeTestDatabase } from "../helpers/test-db";

const runDbTests = process.env.RUN_DB_TESTS === "true";
const runId = `vitest_${Date.now()}`;
const testStartedAt = new Date();
const testMatchNumber = 880000 + Math.floor(Math.random() * 5000);

let prisma: PrismaClient;
let syncFootballDataResults: typeof import("@/lib/results-sync").syncFootballDataResults;

describe.runIf(runDbTests)("football-data result sync", () => {
  beforeAll(async () => {
    assertSafeTestDatabase();
    process.env.FOOTBALL_DATA_TOKEN = "test-token";
    const db = await import("@/lib/db");
    const sync = await import("@/lib/results-sync");
    prisma = db.prisma;
    syncFootballDataResults = sync.syncFootballDataResults;
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
        OR: [{ externalId: { startsWith: runId } }, { matchNumber: testMatchNumber }]
      }
    });
    await prisma.team.deleteMany({
      where: { fifaCode: { in: ["TST", "OPP"] } }
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

    await syncFootballDataResults();

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
});

describe.skipIf(runDbTests)("football-data result sync", () => {
  it("is skipped unless RUN_DB_TESTS=true", () => {
    expect(true).toBe(true);
  });
});
