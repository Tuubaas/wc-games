import { TournamentPickType } from "@prisma/client";
import { Crown, Eye, EyeOff } from "lucide-react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { isMatchLocked } from "@/lib/time";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { EmptyState, PageHeader, Stat } from "@/components/ui/section";
import { TeamFlag } from "@/components/ui/team-flag";

export const dynamic = "force-dynamic";

export default async function UserProfilePage({
  params
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const viewer = await requireUser({ nextPath: `/users/${username}` });

  const [profile, firstMatch] = await Promise.all([
    prisma.user.findUnique({
      where: { username },
      include: {
        predictions: {
          include: {
            match: {
              include: { homeTeam: true, awayTeam: true }
            }
          },
          orderBy: { match: { kickoffAt: "asc" } }
        },
        tournamentPicks: {
          include: {
            team: true,
            player: { include: { team: true } }
          }
        }
      }
    }),
    prisma.match.findFirst({ orderBy: { kickoffAt: "asc" } })
  ]);

  if (!profile?.username) notFound();

  const visiblePredictions = profile.predictions.filter((prediction) =>
    isMatchLocked(prediction.match.kickoffAt)
  );
  const matchPoints = profile.predictions.reduce((sum, p) => sum + p.points, 0);
  const pickPoints = profile.tournamentPicks.reduce((sum, p) => sum + p.points, 0);
  const totalPoints = matchPoints + pickPoints;

  const tournamentPicksLocked = firstMatch ? isMatchLocked(firstMatch.kickoffAt) : false;
  const winnerPick = profile.tournamentPicks.find(
    (pick) => pick.type === TournamentPickType.WINNER
  );
  const scorerPick = profile.tournamentPicks.find(
    (pick) => pick.type === TournamentPickType.TOP_SCORER
  );
  const isSelf = viewer.id === profile.id;

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <PageHeader
        eyebrow={isSelf ? "Your profile" : "Profile"}
        title={
          <span className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[--color-accent] text-base font-bold text-[--color-accent-fg]">
              {profile.username.slice(0, 1).toUpperCase()}
            </span>
            @{profile.username}
          </span>
        }
        action={<LinkButton href="/dashboard" variant="secondary" size="sm">Back to dashboard</LinkButton>}
      />

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Total points" value={totalPoints} />
        <Stat label="From matches" value={matchPoints} />
        <Stat label="From tournament" value={pickPoints} />
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Match predictions</CardTitle>
            <Badge tone="muted">
              <Eye size={11} />
              Visible after lock
            </Badge>
          </CardHeader>
          <CardBody className="!px-0 !pb-0">
            {visiblePredictions.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState>No locked predictions to show yet.</EmptyState>
              </div>
            ) : (
              <div className="divide-y divide-[--color-border] border-t border-[--color-border]">
                {visiblePredictions.map((prediction) => (
                  <div
                    key={prediction.id}
                    className="flex items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <TeamFlag team={prediction.match.homeTeam} size="sm" />
                      <span className="text-sm">
                        {prediction.match.homeTeam?.name ?? "TBD"}
                      </span>
                      <span className="text-xs text-[--color-faint]">vs</span>
                      <span className="text-sm">
                        {prediction.match.awayTeam?.name ?? "TBD"}
                      </span>
                      <TeamFlag team={prediction.match.awayTeam} size="sm" />
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm">
                        {prediction.homeGoals}–{prediction.awayGoals}
                      </span>
                      <Badge tone={prediction.points > 0 ? "accent" : "muted"}>
                        {prediction.points > 0 ? `+${prediction.points}` : "0"} pts
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Crown size={14} className="text-[--color-gold]" />
                <CardTitle>Tournament picks</CardTitle>
              </div>
              {tournamentPicksLocked ? (
                <Badge tone="muted">
                  <Eye size={11} />
                  Revealed
                </Badge>
              ) : (
                <Badge tone="muted">
                  <EyeOff size={11} />
                  Hidden
                </Badge>
              )}
            </CardHeader>
            <CardBody className="space-y-4">
              {tournamentPicksLocked || isSelf ? (
                <>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[--color-faint]">
                      Winner
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {winnerPick?.team?.name ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[--color-faint]">
                      Top scorer
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {scorerPick?.player ? (
                        <>
                          {scorerPick.player.name}{" "}
                          <span className="text-[--color-muted]">
                            · {scorerPick.player.team.name}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-[--color-muted]">
                  Hidden until the tournament locks.
                </p>
              )}
            </CardBody>
          </Card>
        </aside>
      </div>
    </main>
  );
}
