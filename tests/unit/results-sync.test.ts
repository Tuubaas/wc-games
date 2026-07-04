import { MatchStage, MatchStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, recalculateMatchPoints } = vi.hoisted(() => ({
  prisma: {
    match: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn()
    },
    resultSyncLog: {
      create: vi.fn()
    },
    team: {
      findUnique: vi.fn(),
      update: vi.fn()
    }
  },
  recalculateMatchPoints: vi.fn()
}));

vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/lib/scoring", () => ({ recalculateMatchPoints }));

const homeTeam = {
  id: "home-team",
  externalId: null,
  fifaCode: "TST",
  name: "Test Home"
};
const awayTeam = {
  id: "away-team",
  externalId: null,
  fifaCode: "OPP",
  name: "Test Away"
};
const existingMatch = {
  id: "match-1",
  externalId: "990001",
  matchNumber: 1,
  stage: MatchStage.GROUP,
  groupName: "A",
  kickoffAt: new Date("2026-06-11T19:00:00.000Z"),
  homeTeamId: homeTeam.id,
  awayTeamId: awayTeam.id,
  homeScore90: 2,
  awayScore90: 1,
  status: MatchStatus.FINISHED,
  resultSource: "football-data-pending-recalc",
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-12T00:00:00.000Z")
};

function stubFootballDataFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return new Response(
        JSON.stringify({
          filters: { season: 2026 },
          matches: [
            {
              id: 990001,
              utcDate: existingMatch.kickoffAt.toISOString(),
              status: "FINISHED",
              stage: "GROUP_STAGE",
              group: "A",
              homeTeam: { id: 111001, name: homeTeam.name, tla: homeTeam.fifaCode },
              awayTeam: { id: 111002, name: awayTeam.name, tla: awayTeam.fifaCode },
              score: { fullTime: { homeTeam: 2, awayTeam: 1 } }
            }
          ]
        }),
        { status: 200 }
      );
    })
  );
}

describe("syncFootballDataResults", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("FOOTBALL_DATA_TOKEN", "test-token");
    stubFootballDataFetch();
    prisma.team.findUnique.mockImplementation(async ({ where }) => {
      if (where.externalId) return null;
      if (where.fifaCode === homeTeam.fifaCode) return homeTeam;
      if (where.fifaCode === awayTeam.fifaCode) return awayTeam;
      return null;
    });
    prisma.team.update.mockImplementation(async ({ where, data }) => ({
      ...(where.id === homeTeam.id ? homeTeam : awayTeam),
      ...data
    }));
    prisma.match.findMany.mockResolvedValue([]);
    prisma.match.findUnique.mockResolvedValue(existingMatch);
    prisma.match.update.mockImplementation(async ({ data }) => ({
      ...existingMatch,
      ...data
    }));
    prisma.resultSyncLog.create.mockResolvedValue({});
  });

  it("retries point recalculation for a finished result marked as pending", async () => {
    recalculateMatchPoints.mockResolvedValue(undefined);
    const { syncFootballDataResults } = await import("@/lib/results-sync");

    const result = await syncFootballDataResults();

    expect(result.updated).toBe(1);
    expect(recalculateMatchPoints).toHaveBeenCalledWith(existingMatch.id);
  });

  it("marks a saved result for retry if point recalculation fails", async () => {
    recalculateMatchPoints.mockRejectedValue(new Error("recalc failed"));
    const { syncFootballDataResults } = await import("@/lib/results-sync");

    await expect(syncFootballDataResults()).rejects.toThrow("recalc failed");
    expect(prisma.match.update).toHaveBeenLastCalledWith({
      where: { id: existingMatch.id },
      data: { resultSource: "football-data-pending-recalc" }
    });
    expect(prisma.resultSyncLog.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        status: "failed",
        message: expect.stringContaining("recalc failed")
      })
    });
  });

  it("uses regular-time scores when football-data provides them", async () => {
    recalculateMatchPoints.mockResolvedValue(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            filters: { season: 2026 },
            matches: [
              {
                id: 990001,
                utcDate: existingMatch.kickoffAt.toISOString(),
                status: "FINISHED",
                stage: "LAST_16",
                group: null,
                homeTeam: { id: 111001, name: homeTeam.name, tla: homeTeam.fifaCode },
                awayTeam: { id: 111002, name: awayTeam.name, tla: awayTeam.fifaCode },
                score: {
                  regularTime: { homeTeam: 2, awayTeam: 1 },
                  extraTime: { homeTeam: 1, awayTeam: 0 },
                  fullTime: { homeTeam: 3, awayTeam: 1 }
                }
              }
            ]
          }),
          { status: 200 }
        );
      })
    );
    const { syncFootballDataResults } = await import("@/lib/results-sync");

    await syncFootballDataResults();

    expect(prisma.match.update).toHaveBeenCalledWith({
      where: { id: existingMatch.id },
      data: expect.objectContaining({
        homeScore90: 2,
        awayScore90: 1
      })
    });
  });

  it("derives 90-minute scores by subtracting extra time and penalties", async () => {
    recalculateMatchPoints.mockResolvedValue(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            filters: { season: 2026 },
            matches: [
              {
                id: 990001,
                utcDate: existingMatch.kickoffAt.toISOString(),
                status: "FINISHED",
                stage: "LAST_16",
                group: null,
                homeTeam: { id: 111001, name: homeTeam.name, tla: homeTeam.fifaCode },
                awayTeam: { id: 111002, name: awayTeam.name, tla: awayTeam.fifaCode },
                score: {
                  fullTime: { homeTeam: 6, awayTeam: 5 },
                  extraTime: { homeTeam: 1, awayTeam: 1 },
                  penalties: { homeTeam: 3, awayTeam: 2 }
                }
              }
            ]
          }),
          { status: 200 }
        );
      })
    );
    const { syncFootballDataResults } = await import("@/lib/results-sync");

    await syncFootballDataResults();

    expect(prisma.match.update).toHaveBeenCalledWith({
      where: { id: existingMatch.id },
      data: expect.objectContaining({
        homeScore90: 2,
        awayScore90: 2
      })
    });
  });

  it("syncs knockout fixtures without results or point recalculation", async () => {
    recalculateMatchPoints.mockResolvedValue(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            filters: { season: 2026 },
            matches: [
              {
                id: 990001,
                utcDate: existingMatch.kickoffAt.toISOString(),
                status: "FINISHED",
                stage: "LAST_16",
                group: null,
                homeTeam: { id: 111001, name: homeTeam.name, tla: homeTeam.fifaCode },
                awayTeam: { id: 111002, name: awayTeam.name, tla: awayTeam.fifaCode },
                score: { fullTime: { homeTeam: 4, awayTeam: 2 } }
              }
            ]
          }),
          { status: 200 }
        );
      })
    );
    const { syncFootballDataKnockoutFixturesOnly } = await import("@/lib/results-sync");

    const result = await syncFootballDataKnockoutFixturesOnly();

    expect(result.updated).toBe(0);
    expect(recalculateMatchPoints).not.toHaveBeenCalled();
    expect(prisma.match.update).toHaveBeenCalledWith({
      where: { id: existingMatch.id },
      data: {
        externalId: "990001",
        kickoffAt: existingMatch.kickoffAt,
        stage: MatchStage.ROUND_OF_16,
        groupName: undefined,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id
      }
    });
    expect(prisma.resultSyncLog.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        status: "ok",
        message: "Synced 1 knockout fixtures without results."
      })
    });
  });
});
