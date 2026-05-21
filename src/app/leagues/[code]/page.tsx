import { LeagueRole } from "@prisma/client";
import { Copy, RefreshCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  leaveLeagueAction,
  regenerateInviteAction,
  removeMemberAction
} from "@/lib/actions";
import { prisma } from "@/lib/db";
import { rankRows } from "@/lib/leaderboard";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LeaguePage({
  params
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const user = await requireUser({ nextPath: `/leagues/${code}` });
  const league = await prisma.league.findUnique({
    where: { inviteCode: code },
    include: {
      members: {
        include: {
          user: {
            include: {
              predictions: { select: { points: true } },
              tournamentPicks: { select: { points: true } }
            }
          }
        },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!league) notFound();

  const currentMember = league.members.find((member) => member.userId === user.id);
  if (!currentMember) redirect("/dashboard");

  const isAdmin = currentMember.role === LeagueRole.ADMIN;
  const rows = rankRows(
    league.members.map((member) => ({
      id: member.user.id,
      username: member.user.username ?? "",
      points:
        member.user.predictions.reduce((sum, prediction) => sum + prediction.points, 0) +
        member.user.tournamentPicks.reduce((sum, pick) => sum + pick.points, 0)
    }))
  );
  const invitePath = `/join/${league.inviteCode}`;

  return (
    <main className="page stack">
      <div className="split">
        <div>
          <p className="eyebrow">League</p>
          <h1>{league.name}</h1>
          <p>{league.members.length} members</p>
        </div>
        <form action={leaveLeagueAction.bind(null, league.id)}>
          <button className="danger-button" type="submit">
            <Trash2 size={16} />
            {league.createdById === user.id ? "Delete" : "Leave"}
          </button>
        </form>
      </div>

      <section className="grid two">
        <div className="panel">
          <h2>Leaderboard</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>User</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
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
        </div>

        <aside className="stack">
          <section className="panel stack">
            <h2>Invite</h2>
            <div className="field inline">
              <Copy size={16} />
              <span>{invitePath}</span>
            </div>
            {isAdmin ? (
              <form action={regenerateInviteAction.bind(null, league.id)}>
                <button className="secondary-button" type="submit">
                  <RefreshCcw size={16} />
                  Regenerate
                </button>
              </form>
            ) : null}
          </section>

          <section className="panel">
            <h2>Members</h2>
            <div className="stack">
              {league.members.map((member) => (
                <div className="row" key={member.id}>
                  <span>
                    <strong>{member.user.username}</strong>
                    <br />
                    <span className="meta">{member.role.toLowerCase()}</span>
                  </span>
                  {isAdmin && member.userId !== league.createdById ? (
                    <form action={removeMemberAction.bind(null, league.id, member.userId)}>
                      <button className="danger-button" type="submit">
                        Remove
                      </button>
                    </form>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
