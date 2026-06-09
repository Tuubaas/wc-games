import { LeagueType, MatchStage } from "@prisma/client";
import { ChevronDown, Lock } from "lucide-react";
import { savePredictionAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { getUserTimeZone } from "@/lib/server-time-zone";
import { requireUser } from "@/lib/session";
import { formatMatchDayLabel, formatTime, isMatchLocked, matchLockTime } from "@/lib/time";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/section";
import { TeamFlag } from "@/components/ui/team-flag";
import { PredictionForm } from "@/app/matches/prediction-form";
import { SaveAllPredictionsButton } from "@/app/matches/save-all-predictions-button";

export const dynamic = "force-dynamic";

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
  const timeZone = await getUserTimeZone();
  const [matches, leagueMemberships, firstGroupMatch] = await Promise.all([
    prisma.match.findMany({
      include: {
        homeTeam: true,
        awayTeam: true,
        predictions: { where: { userId: user.id }, take: 1 }
      },
      orderBy: { kickoffAt: "asc" }
    }),
    prisma.leagueMember.findMany({
      where: { userId: user.id },
      select: { league: { select: { type: true } } }
    }),
    prisma.match.findFirst({
      where: { stage: MatchStage.GROUP },
      orderBy: { kickoffAt: "asc" }
    })
  ]);
  const classicGroupFrozen = firstGroupMatch
    ? isMatchLocked(firstGroupMatch.kickoffAt)
    : false;
  const hasClassicLeague = leagueMemberships.some(
    (membership) => membership.league.type === LeagueType.CLASSIC
  );
  const hasDynamicLeague = leagueMemberships.some(
    (membership) => membership.league.type === LeagueType.DYNAMIC
  );

  const groups = new Map<string, typeof matches>();
  for (const match of matches) {
    const day = formatMatchDayLabel(match.kickoffAt, timeZone);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(match);
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <PageHeader
        eyebrow="Predictions"
        title="Matches"
        description="Dynamic predictions lock match by match. Classic group-stage scoring freezes before the first kickoff."
        action={<SaveAllPredictionsButton />}
      />

      {matches.length === 0 ? (
        <div className="mt-10">
          <EmptyState>No matches scheduled yet.</EmptyState>
        </div>
      ) : (
        <div className="mt-10 space-y-10">
          {Array.from(groups.entries()).map(([day, dayMatches]) => (
            <details key={day} open className="group">
              <summary className="mb-3 flex cursor-pointer list-none items-center gap-3 rounded-md py-1 outline-none transition-colors hover:text-[--color-text] focus-visible:ring-2 focus-visible:ring-[--color-accent]/50 [&::-webkit-details-marker]:hidden">
                <ChevronDown
                  size={14}
                  className="shrink-0 text-[--color-faint] transition-transform group-open:rotate-180"
                />
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[--color-faint]">
                  {day}
                </h2>
                <div className="h-px flex-1 bg-[--color-border]" />
                <span className="shrink-0 text-[11px] text-[--color-faint]">
                  {dayMatches.length} {dayMatches.length === 1 ? "match" : "matches"}
                </span>
              </summary>

              <Card>
                <CardBody className="divide-y divide-[--color-border] !px-0 !pb-0">
                  {dayMatches.map((match) => {
                    const prediction = match.predictions[0];
                    const locked = isMatchLocked(match.kickoffAt);
                    const classicFrozen =
                      hasClassicLeague &&
                      classicGroupFrozen &&
                      match.stage === MatchStage.GROUP;
                    const teamsKnown = Boolean(match.homeTeam && match.awayTeam);
                    const disabled =
                      locked || !teamsKnown || (classicFrozen && !hasDynamicLeague);
                    const finished = match.status === "FINISHED";
                    const saveAction = savePredictionAction.bind(null, match.id);

                    return (
                      <div
                        key={match.id}
                        data-testid={`match-${match.matchNumber ?? match.id}`}
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
                          {classicFrozen ? <Badge tone="gold">Classic frozen</Badge> : null}
                          <span className="font-mono">
                            {formatTime(match.kickoffAt, timeZone)}
                          </span>
                          {locked && !finished ? (
                            <span className="inline-flex items-center gap-1 text-[--color-faint]">
                              <Lock size={11} /> locked
                            </span>
                          ) : !locked ? (
                            <span className="text-[--color-faint]">
                              · locks {formatTime(matchLockTime(match.kickoffAt), timeZone)}
                            </span>
                          ) : null}
                        </div>

                        <PredictionForm
                          key={`${match.id}:${prediction?.updatedAt.getTime() ?? 0}`}
                          action={saveAction}
                          awayScore90={match.awayScore90}
                          disabled={disabled}
                          draftKey={`tubets:prediction-draft:v1:${user.id}:${match.id}`}
                          finished={finished}
                          hasPrediction={Boolean(prediction)}
                          homeScore90={match.homeScore90}
                          initialAwayGoals={prediction?.awayGoals ?? null}
                          initialHomeGoals={prediction?.homeGoals ?? null}
                          points={prediction?.points ?? null}
                          serverUpdatedAt={prediction?.updatedAt.getTime() ?? 0}
                          testId={`prediction-form-${match.matchNumber ?? match.id}`}
                        />
                      </div>
                    );
                  })}
                </CardBody>
              </Card>
            </details>
          ))}
        </div>
      )}
    </main>
  );
}
