import {
  Calendar,
  Database,
  ListChecks,
  RefreshCcw,
  Save,
  ShieldAlert,
  Trophy
} from "lucide-react";
import { AdminLeagueList } from "@/app/admin/league-list";
import {
  addTopScorerResultAction,
  createPlayerAction,
  createTeamAction,
  freezeClassicSnapshotsAction,
  recalculateAllAction,
  removeTopScorerResultAction,
  setKnockoutPredictionsReopenedAction,
  setTournamentWinnerAction,
  setTournamentPicksReopenedAction,
  syncKnockoutFixturesAction,
  syncResultsAction,
  updateAllMatchResultsAction
} from "@/lib/actions";
import { TOURNAMENT_ID } from "@/lib/config";
import { prisma } from "@/lib/db";
import { areKnockoutPredictionsReopened } from "@/lib/knockout-predictions";
import { getUserTimeZone } from "@/lib/server-time-zone";
import { requireSiteAdmin } from "@/lib/session";
import { formatDateTime, isMatchLocked, matchLockTime } from "@/lib/time";
import { areTournamentPicksReopened } from "@/lib/tournament-picks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, ScoreInput, Select } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/ui/section";
import { TeamFlag } from "@/components/ui/team-flag";

export const dynamic = "force-dynamic";

const MATCH_STATUS_OPTIONS = [
  ["SCHEDULED", "Scheduled"],
  ["IN_PLAY", "In play"],
  ["FINISHED", "Finished"],
  ["POSTPONED", "Postponed"],
  ["CANCELLED", "Cancelled"]
] as const;

export default async function AdminPage({
  searchParams
}: {
  searchParams?: Promise<{
    candidates?: string;
    created?: string;
    freeze?: string;
    knockoutSync?: string;
    sync?: string;
  }>;
}) {
  const params = await searchParams;
  const syncStatus = params?.sync === "ok" || params?.sync === "failed" ? params.sync : null;
  const knockoutSyncStatus =
    params?.knockoutSync === "ok" || params?.knockoutSync === "failed"
      ? params.knockoutSync
      : null;
  const freezeStatus =
    params?.freeze === "ok" || params?.freeze === "skipped" ? params.freeze : null;
  await requireSiteAdmin("/admin");
  const timeZone = await getUserTimeZone();
  const [
    matches,
    teams,
    players,
    tournamentResult,
    logs,
    leagues,
    picksReopened,
    knockoutPredictionsReopened,
    firstGroupMatch
  ] =
    await Promise.all([
      prisma.match.findMany({
        include: { homeTeam: true, awayTeam: true },
        orderBy: { kickoffAt: "asc" }
      }),
      prisma.team.findMany({ orderBy: { name: "asc" } }),
      prisma.player.findMany({
        include: { team: true },
        orderBy: [{ team: { name: "asc" } }, { name: "asc" }]
      }),
      prisma.tournamentResult.findUnique({
        where: { id: TOURNAMENT_ID },
        include: {
          topScorers: { include: { player: { include: { team: true } } } }
        }
      }),
      prisma.resultSyncLog.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
      prisma.league.findMany({
        include: {
          createdBy: { select: { username: true } },
          _count: { select: { members: true } }
        },
        orderBy: { createdAt: "desc" }
      }),
      areTournamentPicksReopened(),
      areKnockoutPredictionsReopened(),
      prisma.match.findFirst({
        where: { stage: "GROUP" },
        orderBy: { kickoffAt: "asc" },
        select: { kickoffAt: true }
      })
    ]);
  const classicSnapshotLockAt = firstGroupMatch
    ? matchLockTime(firstGroupMatch.kickoffAt)
    : null;
  const canFreezeClassicSnapshots = firstGroupMatch
    ? isMatchLocked(firstGroupMatch.kickoffAt)
    : false;
  const topScorers = tournamentResult?.topScorers ?? [];
  const leagueSummaries = leagues.map((league) => ({
    id: league.id,
    name: league.name,
    type: league.type,
    inviteCode: league.inviteCode,
    creatorUsername: league.createdBy.username,
    createdAt: formatDateTime(league.createdAt, timeZone),
    memberCount: league._count.members
  }));

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <PageHeader
        eyebrow="Site admin"
        title={
          <span className="flex items-center gap-3">
            <ShieldAlert size={22} className="text-[--color-accent]" />
            Admin console
          </span>
        }
        description="Sync external results, edit fixtures, and manage tournament outcomes."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <form action={syncResultsAction}>
              <Button type="submit" size="sm">
                <RefreshCcw size={13} />
                Sync now
              </Button>
            </form>
            <form action={recalculateAllAction}>
              <Button type="submit" variant="secondary" size="sm">
                <ListChecks size={13} />
                Recalculate points
              </Button>
            </form>
          </div>
        }
      />

      {syncStatus === "ok" || syncStatus === "failed" ? (
        <div className="mt-6 rounded-md border border-[--color-border] bg-[--color-surface] px-4 py-3">
          <Badge tone={syncStatus === "ok" ? "accent" : "danger"}>
            {syncStatus === "ok" ? "Sync finished" : "Sync failed"}
          </Badge>
          <p className="mt-2 text-sm text-[--color-muted]">
            {syncStatus === "ok"
              ? "Results sync completed. Latest details are in the sync log."
              : "Results sync failed. Check the sync log below for the exact error."}
          </p>
        </div>
      ) : null}

      {knockoutSyncStatus === "ok" || knockoutSyncStatus === "failed" ? (
        <div className="mt-6 rounded-md border border-[--color-border] bg-[--color-surface] px-4 py-3">
          <Badge tone={knockoutSyncStatus === "ok" ? "accent" : "danger"}>
            {knockoutSyncStatus === "ok"
              ? "Knockout fixtures synced"
              : "Knockout sync failed"}
          </Badge>
          <p className="mt-2 text-sm text-[--color-muted]">
            {knockoutSyncStatus === "ok"
              ? "Knockout fixture details were fetched. Latest details are in the sync log."
              : "Knockout fixture sync failed. Check the sync log below for the exact error."}
          </p>
        </div>
      ) : null}

      {freezeStatus ? (
        <div className="mt-6 rounded-md border border-[--color-border] bg-[--color-surface] px-4 py-3">
          <Badge tone={freezeStatus === "ok" ? "accent" : "muted"}>
            {freezeStatus === "ok" ? "Classic snapshots saved" : "Classic freeze skipped"}
          </Badge>
          <p className="mt-2 text-sm text-[--color-muted]">
            {freezeStatus === "ok"
              ? `Created ${params?.created ?? "0"} missing snapshot rows from ${
                  params?.candidates ?? "0"
                } eligible classic prediction rows. Existing snapshots were left unchanged.`
              : "The first group-stage lock is not active yet."}
          </p>
        </div>
      ) : null}

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Trophy size={15} className="text-[--color-gold]" />
              <CardTitle>Tournament result</CardTitle>
            </div>
          </CardHeader>
          <CardBody className="space-y-5">
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-[--color-faint]">
                Winner
              </p>
              <form
                action={setTournamentWinnerAction}
                className="flex flex-col gap-2 sm:flex-row"
              >
                <Select
                  defaultValue={tournamentResult?.winnerTeamId ?? ""}
                  name="winnerTeamId"
                  className="flex-1"
                >
                  <option value="">Select winner</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </Select>
                <Button type="submit" variant="secondary">
                  Save
                </Button>
              </form>
            </div>

            <div>
              <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-[--color-faint]">
                Top scorers
              </p>
              <form
                action={addTopScorerResultAction}
                className="flex flex-col gap-2 sm:flex-row"
              >
                <Select name="playerId" required className="flex-1">
                  <option value="">Add scorer</option>
                  {players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name} · {player.team.name}
                    </option>
                  ))}
                </Select>
                <Button type="submit" variant="secondary">
                  Add
                </Button>
              </form>
              {topScorers.length > 0 ? (
                <div className="mt-3 space-y-1.5">
                  {topScorers.map((item) => (
                    <form
                      key={item.id}
                      action={removeTopScorerResultAction.bind(null, item.playerId)}
                      className="flex items-center justify-between rounded-md bg-[--color-surface-2] px-3 py-2"
                    >
                      <span className="text-sm">
                        {item.player.name}{" "}
                        <span className="text-[--color-muted]">
                          · {item.player.team.name}
                        </span>
                      </span>
                      <Button type="submit" variant="ghost" size="sm" className="text-[--color-faint] hover:text-[--color-danger]">
                        Remove
                      </Button>
                    </form>
                  ))}
                </div>
              ) : null}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tournament picks</CardTitle>
            <Badge tone={picksReopened ? "accent" : "muted"}>
              {picksReopened ? "Open" : "Normal lock"}
            </Badge>
          </CardHeader>
          <CardBody>
            <p className="mb-4 text-sm text-[--color-muted]">
              Override the tournament winner and top scorer lock only.
            </p>
            <form action={setTournamentPicksReopenedAction}>
              <input
                type="hidden"
                name="reopened"
                value={picksReopened ? "false" : "true"}
              />
              <Button type="submit" variant={picksReopened ? "danger" : "secondary"}>
                {picksReopened ? "Close picks" : "Open picks"}
              </Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Knockout fixtures</CardTitle>
            <Badge tone="muted">Football-data</Badge>
          </CardHeader>
          <CardBody>
            <p className="mb-4 text-sm text-[--color-muted]">
              Fetch knockout fixture teams and kickoffs from football-data.
            </p>
            <form action={syncKnockoutFixturesAction}>
              <Button type="submit" variant="secondary">
                <RefreshCcw size={13} />
                Sync knockout games
              </Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Knockout betting</CardTitle>
            <Badge tone={knockoutPredictionsReopened ? "accent" : "muted"}>
              {knockoutPredictionsReopened ? "Open" : "Normal locks"}
            </Badge>
          </CardHeader>
          <CardBody>
            <p className="mb-4 text-sm text-[--color-muted]">
              Let users edit scheduled knockout predictions even if the normal lock
              has passed.
            </p>
            <form action={setKnockoutPredictionsReopenedAction}>
              <input
                type="hidden"
                name="reopened"
                value={knockoutPredictionsReopened ? "false" : "true"}
              />
              <Button
                type="submit"
                variant={knockoutPredictionsReopened ? "danger" : "secondary"}
              >
                {knockoutPredictionsReopened
                  ? "Close knockout betting"
                  : "Open knockout betting"}
              </Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database size={15} className="text-[--color-muted]" />
              <CardTitle>Classic snapshots</CardTitle>
            </div>
            <Badge tone="muted">One-way</Badge>
          </CardHeader>
          <CardBody>
            <p className="mb-4 text-sm text-[--color-muted]">
              Save eligible group-stage predictions for classic leagues. Existing
              snapshots are never overwritten.
            </p>
            {classicSnapshotLockAt ? (
              <p className="mb-4 text-xs text-[--color-faint]">
                Available after {formatDateTime(classicSnapshotLockAt, timeZone)}.
              </p>
            ) : null}
            <form action={freezeClassicSnapshotsAction}>
              <Button
                type="submit"
                variant="secondary"
                disabled={!canFreezeClassicSnapshots}
              >
                Freeze missing snapshots
              </Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database size={15} className="text-[--color-muted]" />
              <CardTitle>Sync log</CardTitle>
            </div>
            <Badge tone="muted">Last 5</Badge>
          </CardHeader>
          <CardBody className="!px-0 !pb-0">
            {logs.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState>No syncs yet.</EmptyState>
              </div>
            ) : (
              <div className="divide-y divide-[--color-border] border-t border-[--color-border]">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between gap-3 px-5 py-3"
                  >
                    <div>
                      <Badge
                        tone={
                          log.status === "ok"
                            ? "accent"
                            : log.status === "skipped"
                            ? "muted"
                            : "danger"
                        }
                      >
                        {log.status}
                      </Badge>
                      <p className="mt-1 text-xs text-[--color-muted]">{log.message}</p>
                    </div>
                    <span className="font-mono text-xs text-[--color-faint]">
                      {formatDateTime(log.createdAt, timeZone)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6">
        <AdminLeagueList leagues={leagueSummaries} />
      </div>

      <form action={updateAllMatchResultsAction} className="mt-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calendar size={15} className="text-[--color-muted]" />
              <CardTitle>Fixtures / results</CardTitle>
            </div>
            <Badge tone="muted">{matches.length} matches</Badge>
          </CardHeader>
          <CardBody className="!px-0 !pb-0">
            <div className="sticky top-[105px] z-20 flex flex-col gap-2 border-y border-[--color-border] bg-[--color-bg]/95 px-5 py-3 backdrop-blur sm:top-14 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-[--color-muted]">
                Edit any fixtures below, then save every changed row at once.
              </p>
              <Button type="submit" size="sm" className="w-full sm:w-auto">
                <Save size={13} />
                Save all changes
              </Button>
            </div>
            <div className="divide-y divide-[--color-border]">
              {matches.map((match) => (
                <div
                  key={match.id}
                  className="grid grid-cols-1 gap-3 px-5 py-3 lg:grid-cols-[1fr_auto] lg:items-center"
                >
                  <input type="hidden" name="matchId" value={match.id} />
                  <div className="flex min-w-0 flex-wrap items-center gap-3">
                    <TeamFlag team={match.homeTeam} size="sm" />
                    <span className="truncate text-sm">
                      {match.homeTeam?.name ?? "TBD"}
                    </span>
                    <span className="text-xs text-[--color-faint]">vs</span>
                    <span className="truncate text-sm">
                      {match.awayTeam?.name ?? "TBD"}
                    </span>
                    <TeamFlag team={match.awayTeam} size="sm" />
                    <span className="font-mono text-xs text-[--color-faint] lg:ml-3">
                      {formatDateTime(match.kickoffAt, timeZone)}
                    </span>
                  </div>
                  <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 sm:flex sm:flex-wrap sm:justify-end">
                    <Select
                      defaultValue={match.status}
                      name={`status-${match.id}`}
                      className="min-w-0 sm:w-36"
                    >
                      {MATCH_STATUS_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                    <ScoreInput
                      aria-label="Home score"
                      defaultValue={match.homeScore90 ?? ""}
                      max={30}
                      min={0}
                      name={`homeScore90-${match.id}`}
                    />
                    <span className="text-[--color-faint]">–</span>
                    <ScoreInput
                      aria-label="Away score"
                      defaultValue={match.awayScore90 ?? ""}
                      max={30}
                      min={0}
                      name={`awayScore90-${match.id}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </form>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Teams</CardTitle>
            <Badge tone="muted">{teams.length}</Badge>
          </CardHeader>
          <CardBody>
            <form
              action={createTeamAction}
              className="flex flex-col gap-2 sm:flex-row"
            >
              <Input name="name" placeholder="Country" required className="flex-1" />
              <Input name="fifaCode" placeholder="Code" className="sm:w-28" />
              <Button type="submit" variant="secondary">
                Add
              </Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Players</CardTitle>
            <Badge tone="muted">{players.length}</Badge>
          </CardHeader>
          <CardBody>
            <form
              action={createPlayerAction}
              className="flex flex-col gap-2 sm:flex-row"
            >
              <Input name="name" placeholder="Player" required className="flex-1" />
              <Select name="teamId" required className="sm:w-44">
                <option value="">Team</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="secondary">
                Add
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
