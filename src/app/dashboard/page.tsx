import Link from "next/link";
import { Plus, Trophy } from "lucide-react";
import { createLeagueAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { rankRows } from "@/lib/leaderboard";
import { requireUser } from "@/lib/session";
import { formatDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser({ nextPath: "/dashboard" });
  const [leagues, upcomingMatches, users] = await Promise.all([
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
    })
  ]);

  const leaderboard = rankRows(
    users.map((item) => ({
      id: item.id,
      username: item.username ?? "",
      points:
        item.predictions.reduce((sum, prediction) => sum + prediction.points, 0) +
        item.tournamentPicks.reduce((sum, pick) => sum + pick.points, 0)
    }))
  ).slice(0, 10);

  return (
    <main className="page grid two">
      <section className="stack">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>Hi, {user.username}</h1>
        </div>

        <section className="panel">
          <div className="split">
            <h2>Your leagues</h2>
            <span className="pill">{leagues.length}</span>
          </div>
          <div className="stack">
            {leagues.map((league) => (
              <Link className="row" href={`/leagues/${league.inviteCode}`} key={league.id}>
                <span>
                  <strong>{league.name}</strong>
                  <br />
                  <span className="meta">{league.members.length} members</span>
                </span>
                <span className="secondary-button">Open</span>
              </Link>
            ))}
            {leagues.length === 0 ? <p>No leagues yet.</p> : null}
          </div>
        </section>

        <section className="panel">
          <h2>Create league</h2>
          <form className="form-row" action={createLeagueAction}>
            <input className="field" name="name" placeholder="League name" required />
            <button className="button" type="submit">
              <Plus size={18} />
              Create
            </button>
          </form>
        </section>
      </section>

      <aside className="stack">
        <section className="panel">
          <h2>Next matches</h2>
          <div className="stack">
            {upcomingMatches.map((match) => (
              <Link className="row" href="/matches" key={match.id}>
                <span>
                  <strong>
                    {match.homeTeam?.name ?? "TBD"} vs {match.awayTeam?.name ?? "TBD"}
                  </strong>
                  <br />
                  <span className="meta">{formatDateTime(match.kickoffAt)}</span>
                </span>
              </Link>
            ))}
            {upcomingMatches.length === 0 ? <p>No upcoming matches seeded.</p> : null}
          </div>
        </section>

        <section className="panel">
          <h2>Global top 10</h2>
          <table className="table">
            <tbody>
              {leaderboard.map((row) => (
                <tr key={row.id}>
                  <td className="rank">{row.rank}</td>
                  <td>
                    <Link href={`/users/${row.username}`}>{row.username}</Link>
                  </td>
                  <td className="score">{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {leaderboard.length === 0 ? <p>No points yet.</p> : null}
        </section>

        <Link className="button" href="/picks">
          <Trophy size={18} />
          Tournament picks
        </Link>
      </aside>
    </main>
  );
}
