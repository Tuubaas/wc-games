import { savePredictionAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatDateTime, isMatchLocked, matchLockTime } from "@/lib/time";

export const dynamic = "force-dynamic";

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

  return (
    <main className="page stack">
      <div>
        <p className="eyebrow">Predictions</p>
        <h1>Matches</h1>
      </div>

      <section className="panel">
        <div className="stack">
          {matches.map((match) => {
            const prediction = match.predictions[0];
            const locked = isMatchLocked(match.kickoffAt);
            const saveAction = savePredictionAction.bind(null, match.id);
            const teamsKnown = Boolean(match.homeTeam && match.awayTeam);
            const disabled = locked || !teamsKnown;

            return (
              <div className="row" key={match.id}>
                <div>
                  <strong>
                    {match.homeTeam?.name ?? "TBD"} vs {match.awayTeam?.name ?? "TBD"}
                  </strong>
                  <br />
                  <span className="meta">
                    {formatDateTime(match.kickoffAt)} · locks{" "}
                    {formatDateTime(matchLockTime(match.kickoffAt))}
                  </span>
                  {match.status === "FINISHED" ? (
                    <>
                      <br />
                      <span className="score">
                        FT {match.homeScore90}-{match.awayScore90}
                      </span>
                    </>
                  ) : null}
                </div>

                <form className="score-form" action={saveAction}>
                  <input
                    aria-label="Home goals"
                    className="score-input"
                    defaultValue={prediction?.homeGoals ?? ""}
                    disabled={disabled}
                    min={0}
                    max={30}
                    name="homeGoals"
                    required
                    type="number"
                  />
                  <span>-</span>
                  <input
                    aria-label="Away goals"
                    className="score-input"
                    defaultValue={prediction?.awayGoals ?? ""}
                    disabled={disabled}
                    min={0}
                    max={30}
                    name="awayGoals"
                    required
                    type="number"
                  />
                  <button className="secondary-button" disabled={disabled} type="submit">
                    Save
                  </button>
                  {prediction ? <span className="pill">{prediction.points} pts</span> : null}
                </form>
              </div>
            );
          })}
          {matches.length === 0 ? <p>No matches seeded.</p> : null}
        </div>
      </section>
    </main>
  );
}
