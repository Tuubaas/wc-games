import {
  LeagueRole,
  LeagueType,
  MatchStage,
  MatchStatus,
  PrismaClient
} from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getLeaguePointTotals } from "@/lib/leaderboard";
import {
  freezeAllClassicGroupPredictions,
  freezeClassicGroupPredictionsForUser,
  recalculateMatchPoints
} from "@/lib/scoring";
import { isMatchLocked, matchLockTime } from "@/lib/time";
import { assertSafeTestDatabase } from "../helpers/test-db";

const runDbTests = process.env.RUN_DB_TESTS === "true";
const runId = `league_types_${Date.now()}`;
const baseMatchNumber = 890000 + Math.floor(Math.random() * 5000);
const snapshotMatchNumber = baseMatchNumber;
const dynamicFirstMatchNumber = baseMatchNumber + 1;
const dynamicSecondMatchNumber = baseMatchNumber + 2;
const classicFallbackMatchNumber = baseMatchNumber + 3;
const adminFreezeMatchNumber = baseMatchNumber + 4;
const teamCodes = [
  `LT${runId.slice(-4)}A`,
  `LT${runId.slice(-4)}B`,
  `LT${runId.slice(-4)}C`,
  `LT${runId.slice(-4)}D`,
  `LT${runId.slice(-4)}E`,
  `LT${runId.slice(-4)}F`,
  `LT${runId.slice(-4)}G`,
  `LT${runId.slice(-4)}H`,
  `LT${runId.slice(-4)}I`,
  `LT${runId.slice(-4)}J`
];

let prisma: PrismaClient;

describe.runIf(runDbTests)("league type scoring", () => {
  beforeAll(async () => {
    assertSafeTestDatabase();
    const db = await import("@/lib/db");
    prisma = db.prisma;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.user.deleteMany({
      where: { email: { endsWith: `.${runId}@example.test` } }
    });
    await prisma.match.deleteMany({
      where: {
        matchNumber: {
          in: [
            snapshotMatchNumber,
            dynamicFirstMatchNumber,
            dynamicSecondMatchNumber,
            classicFallbackMatchNumber,
            adminFreezeMatchNumber
          ]
        }
      }
    });
    await prisma.team.deleteMany({ where: { fifaCode: { in: teamCodes } } });
  });

  it("keeps classic snapshots isolated from later dynamic prediction edits", async () => {
    const [homeTeam, awayTeam, user] = await Promise.all([
      prisma.team.create({
        data: { name: `${runId} Home`, fifaCode: teamCodes[0] }
      }),
      prisma.team.create({
        data: { name: `${runId} Away`, fifaCode: teamCodes[1] }
      }),
      prisma.user.create({
        data: {
          email: `predictor.${runId}@example.test`,
          username: `predictor_${runId}`
        }
      })
    ]);

    const match = await prisma.match.create({
      data: {
        matchNumber: snapshotMatchNumber,
        stage: MatchStage.GROUP,
        kickoffAt: new Date(Date.now() - 60 * 60 * 1000),
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        status: MatchStatus.SCHEDULED
      }
    });
    const firstGroupMatch = await prisma.match.findFirstOrThrow({
      where: { stage: MatchStage.GROUP },
      orderBy: { kickoffAt: "asc" }
    });
    const lockTime = matchLockTime(firstGroupMatch.kickoffAt);
    const beforeLock = new Date(lockTime.getTime() - 60 * 1000);

    const classicLeague = await prisma.league.create({
      data: {
        name: `${runId} Classic`,
        type: LeagueType.CLASSIC,
        inviteCode: `${runId}_classic`,
        createdById: user.id
      }
    });
    const dynamicLeague = await prisma.league.create({
      data: {
        name: `${runId} Dynamic`,
        type: LeagueType.DYNAMIC,
        inviteCode: `${runId}_dynamic`,
        createdById: user.id
      }
    });
    await prisma.leagueMember.createMany({
      data: [
        {
          leagueId: classicLeague.id,
          userId: user.id,
          role: LeagueRole.ADMIN,
          createdAt: beforeLock
        },
        {
          leagueId: dynamicLeague.id,
          userId: user.id,
          role: LeagueRole.ADMIN,
          createdAt: beforeLock
        }
      ]
    });

    await prisma.prediction.create({
      data: {
        userId: user.id,
        matchId: match.id,
        homeGoals: 1,
        awayGoals: 0,
        createdAt: beforeLock,
        updatedAt: beforeLock
      }
    });

    await freezeClassicGroupPredictionsForUser(user.id);

    await prisma.prediction.update({
      where: { userId_matchId: { userId: user.id, matchId: match.id } },
      data: { homeGoals: 3, awayGoals: 0 }
    });
    await prisma.match.update({
      where: { id: match.id },
      data: {
        status: MatchStatus.FINISHED,
        homeScore90: 1,
        awayScore90: 0
      }
    });
    await recalculateMatchPoints(match.id);

    const [classicTotals, dynamicTotals, frozenPrediction] = await Promise.all([
      getLeaguePointTotals({
        id: classicLeague.id,
        type: LeagueType.CLASSIC,
        members: [{ userId: user.id, createdAt: beforeLock }]
      }),
      getLeaguePointTotals({
        id: dynamicLeague.id,
        type: LeagueType.DYNAMIC,
        members: [{ userId: user.id, createdAt: beforeLock }]
      }),
      prisma.classicPrediction.findUniqueOrThrow({
        where: {
          leagueId_userId_matchId: {
            leagueId: classicLeague.id,
            userId: user.id,
            matchId: match.id
          }
        }
      })
    ]);

    expect(frozenPrediction.homeGoals).toBe(1);
    expect(frozenPrediction.awayGoals).toBe(0);
    expect(classicTotals.get(user.id)).toBe(8);
    expect(dynamicTotals.get(user.id)).toBe(4);
  });

  it("lets dynamic members add later match predictions after only betting the first match", async () => {
    const [firstHomeTeam, firstAwayTeam, secondHomeTeam, secondAwayTeam, user] =
      await Promise.all([
        prisma.team.create({
          data: { name: `${runId} First Home`, fifaCode: teamCodes[2] }
        }),
        prisma.team.create({
          data: { name: `${runId} First Away`, fifaCode: teamCodes[3] }
        }),
        prisma.team.create({
          data: { name: `${runId} Second Home`, fifaCode: teamCodes[4] }
        }),
        prisma.team.create({
          data: { name: `${runId} Second Away`, fifaCode: teamCodes[5] }
        }),
        prisma.user.create({
          data: {
            email: `dynamic.${runId}@example.test`,
            username: `dynamic_${runId}`
          }
        })
      ]);

    const [firstMatch, secondMatch] = await Promise.all([
      prisma.match.create({
        data: {
          matchNumber: dynamicFirstMatchNumber,
          stage: MatchStage.GROUP,
          kickoffAt: new Date(Date.now() - 60 * 60 * 1000),
          homeTeamId: firstHomeTeam.id,
          awayTeamId: firstAwayTeam.id,
          status: MatchStatus.SCHEDULED
        }
      }),
      prisma.match.create({
        data: {
          matchNumber: dynamicSecondMatchNumber,
          stage: MatchStage.GROUP,
          kickoffAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
          homeTeamId: secondHomeTeam.id,
          awayTeamId: secondAwayTeam.id,
          status: MatchStatus.SCHEDULED
        }
      })
    ]);

    const league = await prisma.league.create({
      data: {
        name: `${runId} Partial Dynamic`,
        type: LeagueType.DYNAMIC,
        inviteCode: `${runId}_partial_dynamic`,
        createdById: user.id
      }
    });
    const member = await prisma.leagueMember.create({
      data: {
        leagueId: league.id,
        userId: user.id,
        role: LeagueRole.ADMIN
      }
    });

    await prisma.prediction.create({
      data: {
        userId: user.id,
        matchId: firstMatch.id,
        homeGoals: 2,
        awayGoals: 1
      }
    });
    await prisma.match.update({
      where: { id: firstMatch.id },
      data: {
        status: MatchStatus.FINISHED,
        homeScore90: 2,
        awayScore90: 1
      }
    });
    await recalculateMatchPoints(firstMatch.id);

    const beforeLaterBet = await getLeaguePointTotals({
      id: league.id,
      type: LeagueType.DYNAMIC,
      members: [{ userId: user.id, createdAt: member.createdAt }]
    });
    const blankLaterPrediction = await prisma.prediction.findUnique({
      where: { userId_matchId: { userId: user.id, matchId: secondMatch.id } }
    });

    expect(blankLaterPrediction).toBeNull();
    expect(beforeLaterBet.get(user.id)).toBe(8);
    expect(isMatchLocked(secondMatch.kickoffAt)).toBe(false);

    await prisma.prediction.create({
      data: {
        userId: user.id,
        matchId: secondMatch.id,
        homeGoals: 0,
        awayGoals: 0
      }
    });
    await prisma.match.update({
      where: { id: secondMatch.id },
      data: {
        status: MatchStatus.FINISHED,
        homeScore90: 0,
        awayScore90: 0
      }
    });
    await recalculateMatchPoints(secondMatch.id);

    const afterLaterBet = await getLeaguePointTotals({
      id: league.id,
      type: LeagueType.DYNAMIC,
      members: [{ userId: user.id, createdAt: member.createdAt }]
    });

    expect(afterLaterBet.get(user.id)).toBe(16);
  });

  it("keeps classic-only fallback scoring after derived point recalculation changes timestamps", async () => {
    const [homeTeam, awayTeam, user] = await Promise.all([
      prisma.team.create({
        data: { name: `${runId} Fallback Home`, fifaCode: teamCodes[6] }
      }),
      prisma.team.create({
        data: { name: `${runId} Fallback Away`, fifaCode: teamCodes[7] }
      }),
      prisma.user.create({
        data: {
          email: `fallback.${runId}@example.test`,
          username: `fallback_${runId}`
        }
      })
    ]);

    const match = await prisma.match.create({
      data: {
        matchNumber: classicFallbackMatchNumber,
        stage: MatchStage.GROUP,
        kickoffAt: new Date(Date.now() - 60 * 60 * 1000),
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        status: MatchStatus.SCHEDULED
      }
    });
    const firstGroupMatch = await prisma.match.findFirstOrThrow({
      where: { stage: MatchStage.GROUP },
      orderBy: { kickoffAt: "asc" }
    });
    const lockTime = matchLockTime(firstGroupMatch.kickoffAt);
    const beforeLock = new Date(lockTime.getTime() - 60 * 1000);
    const afterLock = new Date(lockTime.getTime() + 60 * 1000);

    const league = await prisma.league.create({
      data: {
        name: `${runId} Classic Fallback`,
        type: LeagueType.CLASSIC,
        inviteCode: `${runId}_classic_fallback`,
        createdById: user.id
      }
    });
    await prisma.leagueMember.create({
      data: {
        leagueId: league.id,
        userId: user.id,
        role: LeagueRole.ADMIN,
        createdAt: afterLock
      }
    });
    await prisma.prediction.create({
      data: {
        userId: user.id,
        matchId: match.id,
        homeGoals: 2,
        awayGoals: 1,
        createdAt: beforeLock,
        updatedAt: afterLock
      }
    });
    await prisma.match.update({
      where: { id: match.id },
      data: {
        status: MatchStatus.FINISHED,
        homeScore90: 2,
        awayScore90: 1
      }
    });
    await recalculateMatchPoints(match.id);

    const totals = await getLeaguePointTotals({
      id: league.id,
      type: LeagueType.CLASSIC,
      members: [{ userId: user.id, createdAt: beforeLock }]
    });

    expect(totals.get(user.id)).toBe(8);
  });

  it("bulk-freezes current classic predictions without overwriting existing snapshots", async () => {
    const [homeTeam, awayTeam, user, changedUser] = await Promise.all([
      prisma.team.create({
        data: { name: `${runId} Freeze Home`, fifaCode: teamCodes[8] }
      }),
      prisma.team.create({
        data: { name: `${runId} Freeze Away`, fifaCode: teamCodes[9] }
      }),
      prisma.user.create({
        data: {
          email: `freeze.${runId}@example.test`,
          username: `freeze_${runId}`
        }
      }),
      prisma.user.create({
        data: {
          email: `changed-freeze.${runId}@example.test`,
          username: `changed_freeze_${runId}`
        }
      })
    ]);

    const match = await prisma.match.create({
      data: {
        matchNumber: adminFreezeMatchNumber,
        stage: MatchStage.GROUP,
        kickoffAt: new Date(Date.now() - 60 * 60 * 1000),
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        status: MatchStatus.SCHEDULED
      }
    });
    const firstGroupMatch = await prisma.match.findFirstOrThrow({
      where: { stage: MatchStage.GROUP },
      orderBy: { kickoffAt: "asc" }
    });
    const lockTime = matchLockTime(firstGroupMatch.kickoffAt);
    const beforeLock = new Date(lockTime.getTime() - 60 * 1000);
    const league = await prisma.league.create({
      data: {
        name: `${runId} Admin Freeze`,
        type: LeagueType.CLASSIC,
        inviteCode: `${runId}_admin_freeze`,
        createdById: user.id
      }
    });
    await prisma.leagueMember.create({
      data: {
        leagueId: league.id,
        userId: user.id,
        role: LeagueRole.ADMIN,
        createdAt: beforeLock
      }
    });
    await prisma.leagueMember.create({
      data: {
        leagueId: league.id,
        userId: changedUser.id,
        role: LeagueRole.MEMBER,
        createdAt: beforeLock
      }
    });
    await prisma.prediction.create({
      data: {
        userId: user.id,
        matchId: match.id,
        homeGoals: 1,
        awayGoals: 0,
        createdAt: beforeLock,
        updatedAt: beforeLock
      }
    });
    await prisma.prediction.create({
      data: {
        userId: changedUser.id,
        matchId: match.id,
        homeGoals: 2,
        awayGoals: 0,
        createdAt: beforeLock,
        updatedAt: beforeLock
      }
    });
    await prisma.prediction.update({
      where: { userId_matchId: { userId: changedUser.id, matchId: match.id } },
      data: { homeGoals: 5, awayGoals: 5 }
    });

    const beforeLockFreeze = await freezeAllClassicGroupPredictions(
      new Date(lockTime.getTime() - 1)
    );
    const firstFreeze = await freezeAllClassicGroupPredictions();
    await prisma.prediction.update({
      where: { userId_matchId: { userId: user.id, matchId: match.id } },
      data: { homeGoals: 4, awayGoals: 4 }
    });
    const secondFreeze = await freezeAllClassicGroupPredictions();

    const [snapshots, frozenPrediction] = await Promise.all([
      prisma.classicPrediction.count({
        where: { leagueId: league.id, userId: user.id, matchId: match.id }
      }),
      prisma.classicPrediction.findUniqueOrThrow({
        where: {
          leagueId_userId_matchId: {
            leagueId: league.id,
            userId: user.id,
            matchId: match.id
          }
        }
      })
    ]);
    const changedSnapshot = await prisma.classicPrediction.findUnique({
      where: {
        leagueId_userId_matchId: {
          leagueId: league.id,
          userId: changedUser.id,
          matchId: match.id
        }
      }
    });

    expect(beforeLockFreeze.skipped).toBe("not-locked");
    expect(firstFreeze.created).toBeGreaterThanOrEqual(1);
    expect(secondFreeze.created).toBe(0);
    expect(snapshots).toBe(1);
    expect(frozenPrediction.homeGoals).toBe(1);
    expect(frozenPrediction.awayGoals).toBe(0);
    expect(changedSnapshot).toBeNull();
  });
});

describe.skipIf(runDbTests)("league type scoring", () => {
  it("is skipped unless RUN_DB_TESTS=true", () => {
    expect(true).toBe(true);
  });
});
