import { TournamentPickType } from "@prisma/client";
import { Crown, Goal, Lock } from "lucide-react";
import { saveTournamentPickAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatDateTime, isMatchLocked, matchLockTime } from "@/lib/time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/section";

export const dynamic = "force-dynamic";

export default async function PicksPage() {
  const user = await requireUser({ nextPath: "/picks" });
  const [teams, players, picks, firstMatch] = await Promise.all([
    prisma.team.findMany({ orderBy: { name: "asc" } }),
    prisma.player.findMany({
      include: { team: true },
      orderBy: [{ team: { name: "asc" } }, { name: "asc" }]
    }),
    prisma.tournamentPick.findMany({ where: { userId: user.id } }),
    prisma.match.findFirst({ orderBy: { kickoffAt: "asc" } })
  ]);

  const winnerPick = picks.find((pick) => pick.type === TournamentPickType.WINNER);
  const scorerPick = picks.find((pick) => pick.type === TournamentPickType.TOP_SCORER);
  const locked = firstMatch ? isMatchLocked(firstMatch.kickoffAt) : false;
  const lockMoment = firstMatch ? matchLockTime(firstMatch.kickoffAt) : null;

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <PageHeader
        eyebrow="Tournament"
        title="Pre-tournament picks"
        description="Two bets that lock at the first kickoff. Big points if you nail them."
        action={
          locked ? (
            <Badge tone="danger">
              <Lock size={11} />
              Locked
            </Badge>
          ) : lockMoment ? (
            <Badge tone="muted">
              <Lock size={11} />
              Lock: {formatDateTime(lockMoment)}
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
            <Badge tone="gold">+25 pts</Badge>
          </CardHeader>
          <CardBody>
            <p className="mb-5 text-sm text-[--color-muted]">
              Which nation lifts the trophy on July 19?
            </p>
            <form
              action={saveTournamentPickAction.bind(null, TournamentPickType.WINNER)}
              className="space-y-4"
            >
              <Select
                defaultValue={winnerPick?.teamId ?? ""}
                disabled={locked}
                name="teamId"
                required
              >
                <option value="">Choose country</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </Select>
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
            <Badge tone="accent">+15 pts</Badge>
          </CardHeader>
          <CardBody>
            <p className="mb-5 text-sm text-[--color-muted]">
              Pick the Golden Boot winner. Ties split the points.
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
                <Select
                  defaultValue={scorerPick?.playerId ?? ""}
                  disabled={locked}
                  name="playerId"
                  required
                >
                  <option value="">Choose player</option>
                  {players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name} · {player.team.name}
                    </option>
                  ))}
                </Select>
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
