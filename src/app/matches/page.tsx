import { Lock } from "lucide-react";
import { savePredictionAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatDateTime, isMatchLocked, matchLockTime } from "@/lib/time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { ScoreInput } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/ui/section";
import { TeamFlag } from "@/components/ui/team-flag";

export const dynamic = "force-dynamic";

const DAY_LABEL = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric"
});
const TIME_LABEL = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit"
});

function statusBadge(status: string) {
  switch (status) {
    case "IN_PLAY":
      return (
        <Badge tone="accent">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[--color-accent] opacity-75 dot-live" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[--color-accent]" />
          </span>
          Live
        </Badge>
      );
    case "FINISHED":
      return <Badge tone="muted">Full time</Badge>;
    case "POSTPONED":
      return <Badge tone="danger">Postponed</Badge>;
    case "CANCELLED":
      return <Badge tone="danger">Cancelled</Badge>;
    default:
      return null;
  }
}

export default async function MatchesPage() {
  const user = await requireUser({ nextPath: "/matches" });
  const matches = await prisma.match.findMany({
    include: {
      homeTeam: true,
      awayTeam: true,
      predictions: { where: { userId: user.id }, take: 1 }
    },
    orderBy: { kickoffAt: "asc" }
  });

  const groups = new Map<string, typeof matches>();
  for (const match of matches) {
    const day = DAY_LABEL.format(match.kickoffAt);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(match);
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <PageHeader
        eyebrow="Predictions"
        title="Matches"
        description="Lock in your scores up to 30 minutes before kickoff. Outcome 3 pts · GD 5 pts · Exact 8 pts."
      />

      {matches.length === 0 ? (
        <div className="mt-10">
          <EmptyState>No matches scheduled yet.</EmptyState>
        </div>
      ) : (
        <div className="mt-10 space-y-10">
          {Array.from(groups.entries()).map(([day, dayMatches]) => (
            <section key={day}>
              <div className="mb-3 flex items-center gap-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[--color-faint]">
                  {day}
                </h2>
                <div className="h-px flex-1 bg-[--color-border]" />
                <span className="text-[11px] text-[--color-faint]">
                  {dayMatches.length} {dayMatches.length === 1 ? "match" : "matches"}
                </span>
              </div>

              <Card>
                <CardBody className="divide-y divide-[--color-border] !px-0 !pb-0">
                  {dayMatches.map((match) => {
                    const prediction = match.predictions[0];
                    const locked = isMatchLocked(match.kickoffAt);
                    const teamsKnown = Boolean(match.homeTeam && match.awayTeam);
                    const disabled = locked || !teamsKnown;
                    const finished = match.status === "FINISHED";
                    const saveAction = savePredictionAction.bind(null, match.id);

                    return (
                      <div
                        key={match.id}
                        className="grid grid-cols-1 gap-4 px-5 py-5 lg:grid-cols-[1fr_auto_auto] lg:items-center"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:gap-5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <TeamFlag team={match.homeTeam} />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">
                                  {match.homeTeam?.name ?? "TBD"}
                                </p>
                                <p className="text-[11px] uppercase tracking-wider text-[--color-faint]">
                                  {match.homeTeam?.fifaCode ?? "—"}
                                </p>
                              </div>
                            </div>
                            <span className="font-mono text-xs text-[--color-faint]">vs</span>
                            <div className="flex items-center gap-2.5 min-w-0 flex-row-reverse sm:flex-row">
                              <TeamFlag team={match.awayTeam} className="sm:order-2" />
                              <div className="min-w-0 text-right sm:text-left sm:order-1">
                                <p className="truncate text-sm font-semibold">
                                  {match.awayTeam?.name ?? "TBD"}
                                </p>
                                <p className="text-[11px] uppercase tracking-wider text-[--color-faint]">
                                  {match.awayTeam?.fifaCode ?? "—"}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-[--color-muted] lg:justify-end">
                          {statusBadge(match.status)}
                          {match.groupName ? (
                            <Badge tone="muted">Group {match.groupName}</Badge>
                          ) : null}
                          <span className="font-mono">
                            {TIME_LABEL.format(match.kickoffAt)}
                          </span>
                          {locked && !finished ? (
                            <span className="inline-flex items-center gap-1 text-[--color-faint]">
                              <Lock size={11} /> locked
                            </span>
                          ) : !locked ? (
                            <span className="text-[--color-faint]">
                              · locks {TIME_LABEL.format(matchLockTime(match.kickoffAt))}
                            </span>
                          ) : null}
                        </div>

                        <form
                          action={saveAction}
                          className="flex items-center justify-end gap-2"
                        >
                          {finished ? (
                            <div className="mr-2 text-right">
                              <p className="text-[10px] uppercase tracking-wider text-[--color-faint]">
                                Full time
                              </p>
                              <p className="font-mono text-base font-semibold text-[--color-text]">
                                {match.homeScore90}–{match.awayScore90}
                              </p>
                            </div>
                          ) : null}
                          <ScoreInput
                            aria-label="Home goals"
                            defaultValue={prediction?.homeGoals ?? ""}
                            disabled={disabled}
                            min={0}
                            max={30}
                            name="homeGoals"
                            required
                          />
                          <span className="text-[--color-faint]">–</span>
                          <ScoreInput
                            aria-label="Away goals"
                            defaultValue={prediction?.awayGoals ?? ""}
                            disabled={disabled}
                            min={0}
                            max={30}
                            name="awayGoals"
                            required
                          />
                          <Button
                            type="submit"
                            variant="secondary"
                            size="sm"
                            disabled={disabled}
                          >
                            {prediction ? "Update" : "Save"}
                          </Button>
                          {prediction && finished ? (
                            <Badge tone={prediction.points > 0 ? "accent" : "muted"}>
                              {prediction.points > 0 ? `+${prediction.points}` : "0"} pts
                            </Badge>
                          ) : null}
                        </form>
                      </div>
                    );
                  })}
                </CardBody>
              </Card>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
