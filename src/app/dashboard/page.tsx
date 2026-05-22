import Link from "next/link";
import { ArrowRight, ChevronRight, Crown, Plus, Trophy, Users } from "lucide-react";
import { createLeagueAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { rankRows } from "@/lib/leaderboard";
import { requireUser } from "@/lib/session";
import { formatDateTime } from "@/lib/time";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TeamFlag } from "@/components/ui/team-flag";
import { EmptyState, PageHeader, Stat } from "@/components/ui/section";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser({ nextPath: "/dashboard" });
  const [leagues, upcomingMatches, users, myPredictions, myPicks] = await Promise.all([
    prisma.league.findMany({
      where: { members: { some: { userId: user.id } } },
      include: { members: true },
      orderBy: { createdAt: "desc" }
    }),
    prisma.match.findMany({
      where: { kickoffAt: { gte: new Date() } },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { kickoffAt: "asc" },
      take: 5
    }),
    prisma.user.findMany({
      where: { username: { not: null } },
      include: {
        predictions: { select: { points: true } },
        tournamentPicks: { select: { points: true } }
      }
    }),
    prisma.prediction.findMany({ where: { userId: user.id }, select: { points: true } }),
    prisma.tournamentPick.findMany({ where: { userId: user.id }, select: { points: true } })
  ]);

  const myPoints =
    myPredictions.reduce((sum, p) => sum + p.points, 0) +
    myPicks.reduce((sum, p) => sum + p.points, 0);

  const leaderboard = rankRows(
    users.map((item) => ({
      id: item.id,
      username: item.username ?? "",
      points:
        item.predictions.reduce((sum, prediction) => sum + prediction.points, 0) +
        item.tournamentPicks.reduce((sum, pick) => sum + pick.points, 0)
    }))
  );
  const top10 = leaderboard.slice(0, 10);
  const myRow = leaderboard.find((row) => row.id === user.id);

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <PageHeader
        eyebrow="Dashboard"
        title={
          <>
            Good to see you,{" "}
            <span className="text-[--color-muted]">@{user.username}</span>
          </>
        }
        description="Your leagues, the next fixtures, and where you sit on the global table."
        action={
          <LinkButton href="/matches" className="group">
            Predict matches
            <ArrowRight
              size={15}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </LinkButton>
        }
      />

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Stat
          label="Your points"
          value={myPoints}
          hint={myRow ? `Rank #${myRow.rank} of ${leaderboard.length}` : "Unranked"}
        />
        <Stat
          label="Leagues"
          value={leagues.length}
          hint={leagues.length === 1 ? "1 active" : `${leagues.length} active`}
        />
        <Stat
          label="Predictions"
          value={myPredictions.length}
          hint={myPredictions.length === 0 ? "Get started on matches" : "Submitted"}
        />
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users size={15} className="text-[--color-muted]" />
                <CardTitle>Your leagues</CardTitle>
              </div>
              <Badge tone="muted">{leagues.length}</Badge>
            </CardHeader>
            <CardBody className="space-y-2">
              {leagues.length === 0 ? (
                <EmptyState>
                  No leagues yet. Create one below or paste an invite link.
                </EmptyState>
              ) : (
                leagues.map((league) => (
                  <Link
                    key={league.id}
                    href={`/leagues/${league.inviteCode}`}
                    className="group flex items-center justify-between gap-3 rounded-lg border border-transparent bg-[--color-surface-2]/50 px-4 py-3 transition-colors hover:border-[--color-border-strong] hover:bg-[--color-surface-2]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[--color-surface-3] text-sm font-semibold uppercase">
                        {league.name.slice(0, 2)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{league.name}</p>
                        <p className="text-xs text-[--color-muted]">
                          {league.members.length}{" "}
                          {league.members.length === 1 ? "member" : "members"}
                        </p>
                      </div>
                    </div>
                    <ChevronRight
                      size={16}
                      className="text-[--color-faint] transition-transform group-hover:translate-x-0.5 group-hover:text-[--color-text]"
                    />
                  </Link>
                ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Create a league</CardTitle>
            </CardHeader>
            <CardBody>
              <form
                action={createLeagueAction}
                className="flex flex-col gap-2 sm:flex-row"
              >
                <Input
                  name="name"
                  placeholder="e.g. Office Pool 2026"
                  required
                  className="flex-1"
                />
                <Button type="submit" className="sm:w-auto">
                  <Plus size={15} />
                  Create
                </Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Next 5 kickoffs</CardTitle>
              <Link
                href="/matches"
                className="inline-flex items-center gap-1 text-xs text-[--color-muted] hover:text-[--color-text]"
              >
                All matches
                <ChevronRight size={13} />
              </Link>
            </CardHeader>
            <CardBody className="space-y-1">
              {upcomingMatches.length === 0 ? (
                <EmptyState>No upcoming matches.</EmptyState>
              ) : (
                upcomingMatches.map((match) => (
                  <Link
                    key={match.id}
                    href="/matches"
                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-[--color-surface-2]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <TeamFlag team={match.homeTeam} size="sm" />
                      <span className="text-sm font-medium">
                        {match.homeTeam?.name ?? "TBD"}
                      </span>
                      <span className="text-xs text-[--color-faint]">vs</span>
                      <span className="text-sm font-medium">
                        {match.awayTeam?.name ?? "TBD"}
                      </span>
                      <TeamFlag team={match.awayTeam} size="sm" />
                    </div>
                    <span className="shrink-0 font-mono text-xs text-[--color-muted]">
                      {formatDateTime(match.kickoffAt)}
                    </span>
                  </Link>
                ))
              )}
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Crown size={15} className="text-[--color-gold]" />
                <CardTitle>Global table</CardTitle>
              </div>
              <Badge tone="muted">Top 10</Badge>
            </CardHeader>
            <CardBody className="space-y-px">
              {top10.length === 0 ? (
                <EmptyState>No points yet.</EmptyState>
              ) : (
                top10.map((row) => {
                  const isMe = row.id === user.id;
                  return (
                    <Link
                      key={row.id}
                      href={`/users/${row.username}`}
                      className={`flex items-center justify-between gap-2 rounded-md px-2 py-2 transition-colors ${
                        isMe
                          ? "bg-[--color-accent-soft]/60"
                          : "hover:bg-[--color-surface-2]"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-5 font-mono text-xs ${
                            row.rank === 1
                              ? "text-[--color-gold]"
                              : "text-[--color-faint]"
                          }`}
                        >
                          {String(row.rank).padStart(2, "0")}
                        </span>
                        <span
                          className={`truncate text-sm ${
                            isMe ? "text-[--color-accent] font-medium" : ""
                          }`}
                        >
                          @{row.username}
                        </span>
                      </div>
                      <span className="font-mono text-sm tabular-nums">
                        {row.points}
                      </span>
                    </Link>
                  );
                })
              )}
            </CardBody>
          </Card>

          <Link
            href="/picks"
            className="group block overflow-hidden rounded-xl border border-[--color-border] bg-gradient-to-br from-[--color-surface-2] to-[--color-surface] p-5 transition-all hover:border-[--color-accent]/40"
          >
            <div className="flex items-start justify-between">
              <Trophy size={18} className="text-[--color-accent]" />
              <ArrowRight
                size={16}
                className="text-[--color-faint] transition-transform group-hover:translate-x-0.5 group-hover:text-[--color-text]"
              />
            </div>
            <p className="mt-4 text-base font-semibold">Tournament picks</p>
            <p className="mt-1 text-xs text-[--color-muted]">
              Lock in the winner and top scorer before kickoff.
            </p>
          </Link>
        </aside>
      </div>
    </main>
  );
}
