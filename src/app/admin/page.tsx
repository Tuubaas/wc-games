import {
  Calendar,
  Database,
  ListChecks,
  RefreshCcw,
  Save,
  ShieldAlert,
  Trophy
} from "lucide-react";
import {
  addTopScorerResultAction,
  createPlayerAction,
  createTeamAction,
  recalculateAllAction,
  removeTopScorerResultAction,
  setTournamentWinnerAction,
  syncResultsAction,
  updateAllMatchResultsAction
} from "@/lib/actions";
import { TOURNAMENT_ID } from "@/lib/config";
import { prisma } from "@/lib/db";
import { getUserTimeZone } from "@/lib/server-time-zone";
import { requireSiteAdmin } from "@/lib/session";
import { formatDateTime } from "@/lib/time";
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

export default async function AdminPage() {
  await requireSiteAdmin("/admin");
  const timeZone = await getUserTimeZone();
  const [matches, teams, players, tournamentResult, logs] = await Promise.all([
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
      include: { topScorers: { include: { player: { include: { team: true } } } } }
    }),
    prisma.resultSyncLog.findMany({ orderBy: { createdAt: "desc" }, take: 5 })
  ]);
  const topScorers = tournamentResult?.topScorers ?? [];

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
                      <Badge tone={log.status === "OK" ? "accent" : "danger"}>
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
