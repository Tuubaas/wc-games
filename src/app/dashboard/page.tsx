import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Crown,
  Plus,
  Trophy,
  Users
} from "lucide-react";
import { createLeagueAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { getUserPointTotals, rankRows } from "@/lib/leaderboard";
import { getUserTimeZone } from "@/lib/server-time-zone";
import { requireUser } from "@/lib/session";
import { formatMatchDayLabel, formatTime } from "@/lib/time";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TeamFlag } from "@/components/ui/team-flag";
import { EmptyState, PageHeader, Stat } from "@/components/ui/section";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser({ nextPath: "/dashboard" });
  const timeZone = await getUserTimeZone();
  const [leagues, upcomingMatches, users, myPredictionCount, pointTotals] =
    await Promise.all([
    prisma.league.findMany({
      where: { members: { some: { userId: user.id } } },
      include: { members: true },
      orderBy: { createdAt: "desc" }
    }),
    prisma.match.findMany({
      where: { kickoffAt: { gte: new Date() } },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { kickoffAt: "asc" }
    }),
    prisma.user.findMany({
      where: { username: { not: null } },
      select: { id: true, username: true }
    }),
      prisma.prediction.count({ where: { userId: user.id } }),
      getUserPointTotals()
    ]);

  const myPoints = pointTotals.get(user.id) ?? 0;
  const leaderboard = rankRows(
    users.map((item) => ({
      id: item.id,
      username: item.username ?? "",
      points: pointTotals.get(item.id) ?? 0
    }))
  );
  const top10 = leaderboard.slice(0, 10);
  const myRow = leaderboard.find((row) => row.id === user.id);
  const nextMatchday = upcomingMatches[0]
    ? formatMatchDayLabel(upcomingMatches[0].kickoffAt, timeZone)
    : null;
  const nextMatchdayMatches = nextMatchday
    ? upcomingMatches.filter((match) => {
        return formatMatchDayLabel(match.kickoffAt, timeZone) === nextMatchday;
      })
    : [];

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
        description="The next matchday, your leagues, and where you sit on the global table."
        action={
          <LinkButton href="/matches" prefetch={false} className="group">
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
          value={myPredictionCount}
          hint={myPredictionCount === 0 ? "Get started on matches" : "Submitted"}
        />
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card className="overflow-hidden border-[--color-accent]/35 bg-[--color-surface]/90">
            <div className="h-1 w-full bg-[--color-accent]" />
            <CardHeader>
              <div className="flex items-center gap-2">
                <CalendarDays size={15} className="text-[--color-accent]" />
                <CardTitle>Next matchday</CardTitle>
              </div>
              {nextMatchday ? <Badge tone="accent">{nextMatchday}</Badge> : null}
            </CardHeader>
            <CardBody className="!px-0 !pb-0">
              {nextMatchdayMatches.length === 0 ? (
                <div className="px-5 pb-5">
                  <EmptyState>No upcoming matches.</EmptyState>
                </div>
              ) : (
                <div className="divide-y divide-[--color-border] border-t border-[--color-border]">
                  {nextMatchdayMatches.map((match) => (
                    <Link
                      key={match.id}
                      href="/matches"
                      prefetch={false}
                      className="grid grid-cols-1 gap-3 px-5 py-4 transition-colors hover:bg-[--color-surface-2] sm:grid-cols-[1fr_auto] sm:items-center"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <TeamFlag team={match.homeTeam} size="sm" />
                        <span className="truncate text-sm font-medium">
                          {match.homeTeam?.name ?? "TBD"}
                        </span>
                        <span className="text-xs text-[--color-faint]">vs</span>
                        <span className="truncate text-sm font-medium">
                          {match.awayTeam?.name ?? "TBD"}
                        </span>
                        <TeamFlag team={match.awayTeam} size="sm" />
                      </div>
                      <span className="font-mono text-sm text-[--color-accent] sm:text-right">
                        {formatTime(match.kickoffAt, timeZone)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users size={15} className="text-[--color-muted]" />
                <CardTitle>Your leagues</CardTitle>
              </div>
              <Link
                href="/leagues"
                prefetch={false}
                className="inline-flex items-center gap-1 text-xs text-[--color-muted] hover:text-[--color-text]"
              >
                View all
                <ChevronRight size={13} />
              </Link>
            </CardHeader>
            <CardBody className="space-y-2">
              {leagues.length === 0 ? (
                <EmptyState>No leagues yet. Create one below or paste an invite link.</EmptyState>
              ) : (
                leagues.map((league) => (
                  <Link
                    key={league.id}
                    href={`/leagues/${league.inviteCode}`}
                    prefetch={false}
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
                      prefetch={false}
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
            prefetch={false}
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
