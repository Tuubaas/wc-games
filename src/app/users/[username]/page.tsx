import { TournamentPickType } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatDateTime, isMatchLocked } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function UserProfilePage({
  params
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  await requireUser({ nextPath: `/users/${username}` });

  const [profile, firstMatch] = await Promise.all([
    prisma.user.findUnique({
      where: { username },
      include: {
        predictions: {
          include: {
            match: {
              include: {
                homeTeam: true,
                awayTeam: true
              }
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
  const totalPoints =
    profile.predictions.reduce((sum, prediction) => sum + prediction.points, 0) +
    profile.tournamentPicks.reduce((sum, pick) => sum + pick.points, 0);
  const tournamentPicksLocked = firstMatch ? isMatchLocked(firstMatch.kickoffAt) : false;
  const winnerPick = profile.tournamentPicks.find(
    (pick) => pick.type === TournamentPickType.WINNER
  );
  const scorerPick = profile.tournamentPicks.find(
    (pick) => pick.type === TournamentPickType.TOP_SCORER
  );

  return (
    <main className="page stack">
      <div>
        <p className="eyebrow">Profile</p>
        <h1>{profile.username}</h1>
        <p>
          <span className="score">{totalPoints}</span> pts
        </p>
      </div>

      <section className="grid two">
        <div className="panel stack">
          <h2>Visible match bets</h2>
          {visiblePredictions.map((prediction) => (
            <div className="row" key={prediction.id}>
              <span>
                <strong>
                  {prediction.match.homeTeam?.name ?? "TBD"} vs{" "}
                  {prediction.match.awayTeam?.name ?? "TBD"}
                </strong>
                <br />
                <span className="meta">{formatDateTime(prediction.match.kickoffAt)}</span>
              </span>
              <span>
                <span className="score">
                  {prediction.homeGoals}-{prediction.awayGoals}
                </span>
                <br />
                <span className="meta">{prediction.points} pts</span>
              </span>
            </div>
          ))}
          {visiblePredictions.length === 0 ? <p>No locked bets visible yet.</p> : null}
        </div>

        <aside className="panel stack">
          <h2>Tournament picks</h2>
          {tournamentPicksLocked ? (
            <>
              <div>
                <strong>Winner</strong>
                <p>{winnerPick?.team?.name ?? "No pick"}</p>
              </div>
              <div>
                <strong>Top scorer</strong>
                <p>
                  {scorerPick?.player
                    ? `${scorerPick.player.name} · ${scorerPick.player.team.name}`
                    : "No pick"}
                </p>
              </div>
            </>
          ) : (
            <p>Hidden until lock.</p>
          )}
          <Link className="secondary-button" href="/dashboard">
            Back
          </Link>
        </aside>
      </section>
    </main>
  );
}
