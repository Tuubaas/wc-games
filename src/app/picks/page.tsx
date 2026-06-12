import { TournamentPickType } from "@prisma/client";
import { Crown, Goal, Lock } from "lucide-react";
import { saveTournamentPickAction } from "@/lib/actions";
import { TOURNAMENT_PICK_POINTS } from "@/lib/config";
import { prisma } from "@/lib/db";
import { getUserTimeZone } from "@/lib/server-time-zone";
import { requireUser } from "@/lib/session";
import { formatDateTime, isMatchLocked, matchLockTime } from "@/lib/time";
import { areTournamentPicksReopened } from "@/lib/tournament-picks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchSelect } from "@/components/search-select";
import { PageHeader } from "@/components/ui/section";

export const dynamic = "force-dynamic";

export default async function PicksPage() {
  const user = await requireUser({ nextPath: "/picks" });
  const timeZone = await getUserTimeZone();
  const [teams, players, picks, firstMatch, picksReopened] = await Promise.all([
    prisma.team.findMany({ orderBy: { name: "asc" } }),
    prisma.player.findMany({
      include: { team: true },
      orderBy: [{ team: { name: "asc" } }, { name: "asc" }]
    }),
    prisma.tournamentPick.findMany({ where: { userId: user.id } }),
    prisma.match.findFirst({ orderBy: { kickoffAt: "asc" } }),
    areTournamentPicksReopened()
  ]);

  const winnerPick = picks.find((pick) => pick.type === TournamentPickType.WINNER);
  const scorerPick = picks.find((pick) => pick.type === TournamentPickType.TOP_SCORER);
  const naturallyLocked = firstMatch ? isMatchLocked(firstMatch.kickoffAt) : false;
  const locked = naturallyLocked && !picksReopened;
  const lockMoment = firstMatch ? matchLockTime(firstMatch.kickoffAt) : null;
  const teamOptions = teams.map((team) => ({
    value: team.id,
    label: team.name,
    meta: team.fifaCode ?? undefined
  }));
  const playerOptions = players.map((player) => ({
    value: player.id,
    label: player.name,
    meta: player.team.name
  }));

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <PageHeader
        eyebrow="Tournament"
        title="Pre-tournament picks"
        description="Two bets that lock at the first kickoff. Big points if you nail them."
        action={
          picksReopened ? (
            <Badge tone="accent">Open by admin</Badge>
          ) : locked ? (
            <Badge tone="danger">
              <Lock size={11} />
              Locked
            </Badge>
          ) : lockMoment ? (
            <Badge tone="muted">
              <Lock size={11} />
              Lock: {formatDateTime(lockMoment, timeZone)}
            </Badge>
          ) : null
        }
      />

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="h-1 w-full bg-[--color-gold]" />
          <CardHeader>
            <div className="flex items-center gap-2">
              <Crown size={16} className="text-[--color-gold]" />
              <CardTitle>Tournament winner</CardTitle>
            </div>
            <Badge tone="gold">+{TOURNAMENT_PICK_POINTS} pts</Badge>
          </CardHeader>
          <CardBody>
            <p className="mb-5 text-sm text-[--color-muted]">
              Which nation lifts the trophy on July 19?
            </p>
            <form
              action={saveTournamentPickAction.bind(null, TournamentPickType.WINNER)}
              className="space-y-4"
            >
              <SearchSelect
                defaultValue={winnerPick?.teamId ?? ""}
                disabled={locked}
                name="teamId"
                options={teamOptions}
                placeholder="Search countries"
              />
              <div className="flex items-center justify-between">
                <Button type="submit" disabled={locked}>
                  {winnerPick ? "Update pick" : "Lock in"}
                </Button>
                {winnerPick ? (
                  <Badge tone={winnerPick.points > 0 ? "accent" : "muted"}>
                    {winnerPick.points > 0 ? `+${winnerPick.points}` : "0"} pts
                  </Badge>
                ) : null}
              </div>
            </form>
          </CardBody>
        </Card>

        <Card className="overflow-hidden">
          <div className="h-1 w-full bg-[--color-accent]" />
          <CardHeader>
            <div className="flex items-center gap-2">
              <Goal size={16} className="text-[--color-accent]" />
              <CardTitle>Top scorer</CardTitle>
            </div>
            <Badge tone="accent">+{TOURNAMENT_PICK_POINTS} pts</Badge>
          </CardHeader>
          <CardBody>
            <p className="mb-5 text-sm text-[--color-muted]">
              Pick the Golden Boot winner. If players tie, every correct pick scores.
            </p>
            {players.length === 0 ? (
              <p className="text-sm text-[--color-muted]">
                Opens when the player list is seeded.
              </p>
            ) : (
              <form
                action={saveTournamentPickAction.bind(
                  null,
                  TournamentPickType.TOP_SCORER
                )}
                className="space-y-4"
              >
                <SearchSelect
                  defaultValue={scorerPick?.playerId ?? ""}
                  disabled={locked}
                  name="playerId"
                  options={playerOptions}
                  placeholder="Search players"
                />
                <div className="flex items-center justify-between">
                  <Button type="submit" disabled={locked}>
                    {scorerPick ? "Update pick" : "Lock in"}
                  </Button>
                  {scorerPick ? (
                    <Badge tone={scorerPick.points > 0 ? "accent" : "muted"}>
                      {scorerPick.points > 0 ? `+${scorerPick.points}` : "0"} pts
                    </Badge>
                  ) : null}
                </div>
              </form>
            )}
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
