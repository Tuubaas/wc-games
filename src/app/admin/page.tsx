import {
  addTopScorerResultAction,
  createPlayerAction,
  createTeamAction,
  recalculateAllAction,
  removeTopScorerResultAction,
  setTournamentWinnerAction,
  syncResultsAction,
  updateMatchResultAction
} from "@/lib/actions";
import { TOURNAMENT_ID } from "@/lib/config";
import { prisma } from "@/lib/db";
import { requireSiteAdmin } from "@/lib/session";
import { formatDateTime } from "@/lib/time";

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
  const [matches, teams, players, tournamentResult, logs] = await Promise.all([
    prisma.match.findMany({
      include: { homeTeam: true, awayTeam: true },
      orderBy: { kickoffAt: "asc" }
    }),
    prisma.team.findMany({ orderBy: { name: "asc" } }),
    prisma.player.findMany({ include: { team: true }, orderBy: [{ team: { name: "asc" } }, { name: "asc" }] }),
    prisma.tournamentResult.findUnique({
      where: { id: TOURNAMENT_ID },
      include: { topScorers: { include: { player: { include: { team: true } } } } }
    }),
    prisma.resultSyncLog.findMany({ orderBy: { createdAt: "desc" }, take: 5 })
  ]);
  const topScorers = tournamentResult?.topScorers ?? [];

  return (
    <main className="page stack">
      <div>
        <p className="eyebrow">Site owner</p>
        <h1>Admin</h1>
      </div>

      <section className="panel split">
        <form action={syncResultsAction}>
          <button className="button" type="submit">
            Sync now
          </button>
        </form>
        <form action={recalculateAllAction}>
          <button className="secondary-button" type="submit">
            Recalculate points
          </button>
        </form>
      </section>

      <section className="panel stack">
        <h2>Tournament result</h2>
        <form className="tiny-form" action={setTournamentWinnerAction}>
          <select className="field" defaultValue={tournamentResult?.winnerTeamId ?? ""} name="winnerTeamId">
            <option value="">Winner</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          <button className="secondary-button" type="submit">
            Save
          </button>
        </form>
        <form className="tiny-form" action={addTopScorerResultAction}>
          <select className="field" name="playerId" required>
            <option value="">Top scorer</option>
            {players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name} · {player.team.name}
              </option>
            ))}
          </select>
          <button className="secondary-button" type="submit">
            Add
          </button>
        </form>
        <div className="stack">
          {topScorers.map((item) => (
            <form className="row" action={removeTopScorerResultAction.bind(null, item.playerId)} key={item.id}>
              <span>
                {item.player.name} · {item.player.team.name}
              </span>
              <button className="danger-button" type="submit">
                Remove
              </button>
            </form>
          ))}
        </div>
      </section>

      <section className="panel stack">
        <h2>Fixtures/results</h2>
        <div className="admin-grid">
          {matches.map((match) => (
            <form className="row" action={updateMatchResultAction.bind(null, match.id)} key={match.id}>
              <span>
                <strong>
                  {match.homeTeam?.name ?? "TBD"} vs {match.awayTeam?.name ?? "TBD"}
                </strong>
                <br />
                <span className="meta">{formatDateTime(match.kickoffAt)}</span>
              </span>
              <span className="tiny-form">
                <select className="field" defaultValue={match.status} name="status">
                  {MATCH_STATUS_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Home score"
                  className="score-input"
                  defaultValue={match.homeScore90 ?? ""}
                  max={30}
                  min={0}
                  name="homeScore90"
                  type="number"
                />
                <input
                  aria-label="Away score"
                  className="score-input"
                  defaultValue={match.awayScore90 ?? ""}
                  max={30}
                  min={0}
                  name="awayScore90"
                  type="number"
                />
                <button className="secondary-button" type="submit">
                  Save
                </button>
              </span>
            </form>
          ))}
        </div>
      </section>

      <section className="grid two">
        <div className="panel stack">
          <h2>Teams</h2>
          <form className="tiny-form" action={createTeamAction}>
            <input className="field" name="name" placeholder="Country" required />
            <input className="field" name="fifaCode" placeholder="Code" />
            <button className="secondary-button" type="submit">
              Add
            </button>
          </form>
          <p>{teams.length} teams</p>
        </div>

        <div className="panel stack">
          <h2>Players</h2>
          <form className="tiny-form" action={createPlayerAction}>
            <input className="field" name="name" placeholder="Player" required />
            <select className="field" name="teamId" required>
              <option value="">Team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
            <button className="secondary-button" type="submit">
              Add
            </button>
          </form>
          <p>{players.length} players</p>
        </div>
      </section>

      <section className="panel">
        <h2>Sync log</h2>
        <div className="stack">
          {logs.map((log) => (
            <div className="row" key={log.id}>
              <span>
                <strong>{log.status}</strong>
                <br />
                <span className="meta">{formatDateTime(log.createdAt)}</span>
              </span>
              <span>{log.message}</span>
            </div>
          ))}
          {logs.length === 0 ? <p>No syncs yet.</p> : null}
        </div>
      </section>
    </main>
  );
}
