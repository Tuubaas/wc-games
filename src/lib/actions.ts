"use server";

import { randomBytes } from "node:crypto";
import {
  LeagueRole,
  LeagueType,
  MatchStage,
  MatchStatus,
  Prisma,
  TournamentPickType
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn, signOut, updateSession } from "@/auth";
import { TOURNAMENT_ID } from "@/lib/config";
import { prisma } from "@/lib/db";
import { safeInternalPath } from "@/lib/redirect";
import {
  freezeClassicGroupPredictionsForUser,
  recalculateAllPoints,
  recalculateMatchPoints,
  recalculateTournamentPoints
} from "@/lib/scoring";
import { requireSiteAdmin, requireUser } from "@/lib/session";
import { isMatchLocked } from "@/lib/time";
import { syncFootballDataResults } from "@/lib/results-sync";

const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,24}$/);

const scoreSchema = z.coerce.number().int().min(0).max(30);

function revalidateScoreViews() {
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/matches");
}

export async function signInWithGoogleAction(formData: FormData) {
  const callbackUrl = safeInternalPath(formData.get("callbackUrl"), "/dashboard");
  await signIn("google", { redirectTo: callbackUrl });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

export async function completeOnboardingAction(formData: FormData) {
  const user = await requireUser({ allowMissingUsername: true, nextPath: "/onboarding" });
  const username = usernameSchema.parse(String(formData.get("username") ?? ""));
  const next = safeInternalPath(formData.get("next"), "/dashboard");

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { username }
    });
    await updateSession({ user: { username } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect(`/onboarding?next=${encodeURIComponent(next)}&error=username-taken`);
    }
    throw error;
  }

  redirect(next);
}

async function createInviteCode() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const inviteCode = randomBytes(4).toString("hex");
    const existing = await prisma.league.findUnique({ where: { inviteCode } });
    if (!existing) return inviteCode;
  }
  return randomBytes(8).toString("hex");
}

export async function createLeagueAction(formData: FormData) {
  const user = await requireUser({ nextPath: "/dashboard" });
  const name = z.string().trim().min(2).max(80).parse(formData.get("name"));
  const type = z
    .nativeEnum(LeagueType)
    .catch(LeagueType.DYNAMIC)
    .parse(formData.get("type"));
  const inviteCode = await createInviteCode();

  const league = await prisma.league.create({
    data: {
      name,
      type,
      inviteCode,
      createdById: user.id,
      members: {
        create: {
          userId: user.id,
          role: LeagueRole.ADMIN
        }
      }
    }
  });

  redirect(`/leagues/${league.inviteCode}`);
}

export async function joinLeagueAction(inviteCode: string) {
  const user = await requireUser({ nextPath: `/join/${inviteCode}` });
  const league = await prisma.league.findUnique({ where: { inviteCode } });
  if (!league) redirect("/dashboard");

  await prisma.leagueMember.upsert({
    where: {
      leagueId_userId: {
        leagueId: league.id,
        userId: user.id
      }
    },
    update: {},
    create: {
      leagueId: league.id,
      userId: user.id
    }
  });

  redirect(`/leagues/${league.inviteCode}`);
}

export async function regenerateInviteAction(leagueId: string) {
  const user = await requireUser({ nextPath: "/dashboard" });
  await requireLeagueAdmin(leagueId, user.id);
  const inviteCode = await createInviteCode();
  const league = await prisma.league.update({
    where: { id: leagueId },
    data: { inviteCode }
  });
  redirect(`/leagues/${league.inviteCode}`);
}

export async function removeMemberAction(leagueId: string, userId: string) {
  const user = await requireUser({ nextPath: "/dashboard" });
  await requireLeagueAdmin(leagueId, user.id);
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league || league.createdById === userId) return;

  await prisma.leagueMember.delete({
    where: { leagueId_userId: { leagueId, userId } }
  });

  revalidatePath(`/leagues/${league.inviteCode}`);
}

export async function leaveLeagueAction(leagueId: string) {
  const user = await requireUser({ nextPath: "/dashboard" });
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) redirect("/dashboard");

  if (league.createdById === user.id) {
    await prisma.league.delete({ where: { id: leagueId } });
  } else {
    await prisma.leagueMember.delete({
      where: { leagueId_userId: { leagueId, userId: user.id } }
    });
  }

  redirect("/dashboard");
}

export async function updateLeagueTypeAction(leagueId: string, formData: FormData) {
  const user = await requireUser({ nextPath: "/dashboard" });
  await requireLeagueAdmin(leagueId, user.id);

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { inviteCode: true }
  });
  if (!league) redirect("/dashboard");
  if (await isGroupStageLockActive()) redirect(`/leagues/${league.inviteCode}`);

  const type = z.nativeEnum(LeagueType).parse(formData.get("type"));
  await prisma.league.update({
    where: { id: leagueId },
    data: { type }
  });

  revalidatePath("/dashboard");
  revalidatePath("/leagues");
  revalidatePath("/matches");
  revalidatePath(`/leagues/${league.inviteCode}`);
}

export async function savePredictionAction(matchId: string, formData: FormData) {
  const user = await requireUser({ nextPath: "/matches" });
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match || !match.homeTeamId || !match.awayTeamId || isMatchLocked(match.kickoffAt)) {
    redirect("/matches");
  }

  if (match.stage === MatchStage.GROUP) {
    await freezeClassicGroupPredictionsForUser(user.id);
    if (await isClassicOnlyGroupStageLocked(user.id)) redirect("/matches");
  }

  const homeGoals = scoreSchema.parse(formData.get("homeGoals"));
  const awayGoals = scoreSchema.parse(formData.get("awayGoals"));

  await prisma.prediction.upsert({
    where: { userId_matchId: { userId: user.id, matchId } },
    update: { homeGoals, awayGoals },
    create: { userId: user.id, matchId, homeGoals, awayGoals }
  });

  revalidatePath("/matches");
  revalidatePath("/dashboard");
}

export async function saveTournamentPickAction(type: TournamentPickType, formData: FormData) {
  const user = await requireUser({ nextPath: "/picks" });
  const locked = await areTournamentPicksLocked();
  if (locked) redirect("/picks");

  const isWinnerPick = type === TournamentPickType.WINNER;
  const isScorerPick = type === TournamentPickType.TOP_SCORER;
  const teamId = String(formData.get("teamId") || "");
  const playerId = String(formData.get("playerId") || "");

  if (isWinnerPick) {
    if (!teamId) redirect("/picks");
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) redirect("/picks");
  }

  if (isScorerPick) {
    if (!playerId) redirect("/picks");
    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) redirect("/picks");
  }

  const pickData = {
    teamId: isWinnerPick ? teamId : null,
    playerId: isScorerPick ? playerId : null
  };

  await prisma.tournamentPick.upsert({
    where: { userId_type: { userId: user.id, type } },
    update: pickData,
    create: {
      userId: user.id,
      type,
      ...pickData
    }
  });

  revalidatePath("/picks");
}

export async function updateMatchResultAction(matchId: string, formData: FormData) {
  await requireSiteAdmin("/admin");
  const status = z.nativeEnum(MatchStatus).parse(formData.get("status"));
  const homeValue = formData.get("homeScore90");
  const awayValue = formData.get("awayScore90");
  const homeScore90 = homeValue === "" ? null : scoreSchema.parse(homeValue);
  const awayScore90 = awayValue === "" ? null : scoreSchema.parse(awayValue);
  if (status === MatchStatus.FINISHED && (homeScore90 === null || awayScore90 === null)) {
    redirect("/admin?error=finished-score-required");
  }

  await prisma.match.update({
    where: { id: matchId },
    data: {
      status,
      homeScore90,
      awayScore90,
      resultSource: status === MatchStatus.FINISHED ? "admin" : null
    }
  });
  await recalculateMatchPoints(matchId);

  revalidateScoreViews();
}

function optionalScore(value: FormDataEntryValue | null) {
  if (value === null || value === "") return null;
  return scoreSchema.parse(value);
}

export async function updateAllMatchResultsAction(formData: FormData) {
  await requireSiteAdmin("/admin");
  const matchIds = z.array(z.string().min(1)).parse(formData.getAll("matchId"));
  const uniqueMatchIds = Array.from(new Set(matchIds));
  const existingMatches = await prisma.match.findMany({
    where: { id: { in: uniqueMatchIds } },
    select: {
      id: true,
      status: true,
      homeScore90: true,
      awayScore90: true
    }
  });
  const existingById = new Map(existingMatches.map((match) => [match.id, match]));
  const updates: Array<{
    awayScore90: number | null;
    homeScore90: number | null;
    id: string;
    status: MatchStatus;
  }> = [];

  for (const matchId of uniqueMatchIds) {
    const existing = existingById.get(matchId);
    if (!existing) continue;

    const status = z.nativeEnum(MatchStatus).parse(formData.get(`status-${matchId}`));
    const homeScore90 = optionalScore(formData.get(`homeScore90-${matchId}`));
    const awayScore90 = optionalScore(formData.get(`awayScore90-${matchId}`));

    if (status === MatchStatus.FINISHED && (homeScore90 === null || awayScore90 === null)) {
      redirect("/admin?error=finished-score-required");
    }

    if (
      existing.status !== status ||
      existing.homeScore90 !== homeScore90 ||
      existing.awayScore90 !== awayScore90
    ) {
      updates.push({ awayScore90, homeScore90, id: matchId, status });
    }
  }

  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((update) =>
        prisma.match.update({
          where: { id: update.id },
          data: {
            status: update.status,
            homeScore90: update.homeScore90,
            awayScore90: update.awayScore90,
            resultSource: update.status === MatchStatus.FINISHED ? "admin" : null
          }
        })
      )
    );

    for (const update of updates) {
      await recalculateMatchPoints(update.id);
    }
  }

  revalidateScoreViews();
}

export async function createTeamAction(formData: FormData) {
  await requireSiteAdmin("/admin");
  const name = z.string().trim().min(2).max(80).parse(formData.get("name"));
  const rawFifaCode = String(formData.get("fifaCode") ?? "").trim().toUpperCase();
  const fifaCode = rawFifaCode
    ? z.string().min(2).max(4).parse(rawFifaCode)
    : null;

  await prisma.team.create({
    data: {
      name,
      fifaCode
    }
  });

  revalidatePath("/admin");
}

export async function createPlayerAction(formData: FormData) {
  await requireSiteAdmin("/admin");
  const name = z.string().trim().min(2).max(100).parse(formData.get("name"));
  const teamId = z.string().min(1).parse(formData.get("teamId"));

  await prisma.player.create({
    data: {
      name,
      teamId
    }
  });

  revalidatePath("/admin");
}

export async function setTournamentWinnerAction(formData: FormData) {
  await requireSiteAdmin("/admin");
  const winnerTeamId = String(formData.get("winnerTeamId") || "");
  await prisma.tournamentResult.upsert({
    where: { id: TOURNAMENT_ID },
    update: { winnerTeamId: winnerTeamId || null },
    create: { id: TOURNAMENT_ID, winnerTeamId: winnerTeamId || null }
  });
  await recalculateTournamentPoints();
  revalidatePath("/admin");
}

export async function addTopScorerResultAction(formData: FormData) {
  await requireSiteAdmin("/admin");
  const playerId = z.string().min(1).parse(formData.get("playerId"));
  await prisma.tournamentResult.upsert({
    where: { id: TOURNAMENT_ID },
    update: {},
    create: { id: TOURNAMENT_ID }
  });
  await prisma.tournamentTopScorerResult.upsert({
    where: {
      tournamentResultId_playerId: {
        tournamentResultId: TOURNAMENT_ID,
        playerId
      }
    },
    update: {},
    create: {
      tournamentResultId: TOURNAMENT_ID,
      playerId
    }
  });
  await recalculateTournamentPoints();
  revalidatePath("/admin");
}

export async function removeTopScorerResultAction(playerId: string) {
  await requireSiteAdmin("/admin");
  await prisma.tournamentTopScorerResult.delete({
    where: {
      tournamentResultId_playerId: {
        tournamentResultId: TOURNAMENT_ID,
        playerId
      }
    }
  });
  await recalculateTournamentPoints();
  revalidatePath("/admin");
}

export async function syncResultsAction() {
  await requireSiteAdmin("/admin");
  await syncFootballDataResults();
  revalidateScoreViews();
}

export async function recalculateAllAction() {
  await requireSiteAdmin("/admin");
  await recalculateAllPoints();
  revalidateScoreViews();
}

async function requireLeagueAdmin(leagueId: string, userId: string) {
  const member = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId } }
  });
  if (member?.role !== LeagueRole.ADMIN) redirect("/dashboard");
}

async function isClassicOnlyGroupStageLocked(userId: string) {
  if (!(await isGroupStageLockActive())) return false;

  const memberships = await prisma.leagueMember.findMany({
    where: { userId },
    select: { league: { select: { type: true } } }
  });
  const hasClassicLeague = memberships.some(
    (membership) => membership.league.type === LeagueType.CLASSIC
  );
  const hasDynamicLeague = memberships.some(
    (membership) => membership.league.type === LeagueType.DYNAMIC
  );

  return hasClassicLeague && !hasDynamicLeague;
}

async function isGroupStageLockActive() {
  const firstGroupMatch = await prisma.match.findFirst({
    where: { stage: MatchStage.GROUP },
    orderBy: { kickoffAt: "asc" },
    select: { kickoffAt: true }
  });
  return firstGroupMatch ? isMatchLocked(firstGroupMatch.kickoffAt) : false;
}

async function areTournamentPicksLocked() {
  const firstMatch = await prisma.match.findFirst({ orderBy: { kickoffAt: "asc" } });
  if (!firstMatch) return false;
  return isMatchLocked(firstMatch.kickoffAt);
}
