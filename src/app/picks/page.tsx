import { TournamentPickType } from "@prisma/client";
import { saveTournamentPickAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatDateTime, isMatchLocked, matchLockTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function PicksPage() {
  const user = await requireUser({ nextPath: "/picks" });
  const [teams, players, picks, firstMatch] = await Promise.all([
    prisma.team.findMany({ orderBy: { name: "asc" } }),
    prisma.player.findMany({ include: { team: true }, orderBy: [{ team: { name: "asc" } }, { name: "asc" }] }),
    prisma.tournamentPick.findMany({ where: { userId: user.id } }),
    prisma.match.findFirst({ orderBy: { kickoffAt: "asc" } })
  ]);

  const winnerPick = picks.find((pick) => pick.type === TournamentPickType.WINNER);
  const scorerPick = picks.find((pick) => pick.type === TournamentPickType.TOP_SCORER);
  const locked = firstMatch ? isMatchLocked(firstMatch.kickoffAt) : false;
  const lockCopy = firstMatch ? formatDateTime(matchLockTime(firstMatch.kickoffAt)) : "not set";

  return (
    <main className="page stack">
      <div>
        <p className="eyebrow">Tournament</p>
        <h1>Picks</h1>
        <p>Lock: {lockCopy}</p>
      </div>

      <section className="grid two">
        <div className="panel stack">
          <h2>Winner</h2>
          <form className="stack" action={saveTournamentPickAction.bind(null, TournamentPickType.WINNER)}>
            <select
              className="field"
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
            </select>
            <button className="button" disabled={locked} type="submit">
              Save winner
            </button>
            {winnerPick ? <span className="pill">{winnerPick.points} pts</span> : null}
          </form>
        </div>

        <div className="panel stack">
          <h2>Top scorer</h2>
          {players.length === 0 ? (
            <p>Opens when player list is seeded.</p>
          ) : (
            <form className="stack" action={saveTournamentPickAction.bind(null, TournamentPickType.TOP_SCORER)}>
              <select
                className="field"
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
              </select>
              <button className="button" disabled={locked} type="submit">
                Save scorer
              </button>
              {scorerPick ? <span className="pill">{scorerPick.points} pts</span> : null}
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
