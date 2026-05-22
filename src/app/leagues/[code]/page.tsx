import { LeagueRole } from "@prisma/client";
import { Crown, LogOut, RefreshCcw, Trash2 } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyInvite } from "@/components/copy-invite";
import { PageHeader } from "@/components/ui/section";

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
  const isOwner = league.createdById === user.id;
  const leaveLabel = isOwner ? "Delete league" : "Leave league";

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <PageHeader
        eyebrow="League"
        title={league.name}
        description={`${league.members.length} ${league.members.length === 1 ? "member" : "members"} · invite code ${league.inviteCode}`}
        action={
          <form action={leaveLeagueAction.bind(null, league.id)}>
            <Button type="submit" variant="danger" size="sm">
              {isOwner ? <Trash2 size={14} /> : <LogOut size={14} />}
              {leaveLabel}
            </Button>
          </form>
        }
      />

      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Crown size={15} className="text-[--color-gold]" />
              <CardTitle>Standings</CardTitle>
            </div>
            <Badge tone="muted">{rows.length} players</Badge>
          </CardHeader>
          <CardBody className="!px-0 !pb-0">
            <div className="grid grid-cols-[40px_1fr_80px] gap-3 px-5 pb-2 text-[10px] uppercase tracking-[0.18em] text-[--color-faint]">
              <span>#</span>
              <span>Player</span>
              <span className="text-right">Points</span>
            </div>
            <div className="divide-y divide-[--color-border] border-t border-[--color-border]">
              {rows.map((row) => {
                const isMe = row.id === user.id;
                return (
                  <Link
                    key={row.id}
                    href={`/users/${row.username}`}
                    className={`grid grid-cols-[40px_1fr_80px] items-center gap-3 px-5 py-3 transition-colors ${
                      isMe
                        ? "bg-[--color-accent-soft]/40"
                        : "hover:bg-[--color-surface-2]"
                    }`}
                  >
                    <span
                      className={`font-mono text-sm ${
                        row.rank === 1
                          ? "text-[--color-gold]"
                          : row.rank <= 3
                          ? "text-[--color-text]"
                          : "text-[--color-faint]"
                      }`}
                    >
                      {String(row.rank).padStart(2, "0")}
                    </span>
                    <span
                      className={`truncate text-sm ${
                        isMe ? "text-[--color-accent] font-medium" : ""
                      }`}
                    >
                      @{row.username}
                    </span>
                    <span className="text-right font-mono text-sm tabular-nums">
                      {row.points}
                    </span>
                  </Link>
                );
              })}
            </div>
          </CardBody>
        </Card>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Invite</CardTitle>
              {isAdmin ? (
                <form action={regenerateInviteAction.bind(null, league.id)}>
                  <Button type="submit" variant="ghost" size="sm">
                    <RefreshCcw size={13} />
                    Rotate
                  </Button>
                </form>
              ) : null}
            </CardHeader>
            <CardBody>
              <p className="mb-3 text-xs text-[--color-muted]">
                Share this link to invite friends.
              </p>
              <CopyInvite path={`/join/${league.inviteCode}`} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Members</CardTitle>
              <Badge tone="muted">{league.members.length}</Badge>
            </CardHeader>
            <CardBody className="space-y-1">
              {league.members.map((member) => {
                const isCreator = member.userId === league.createdById;
                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-[--color-surface-2]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[--color-surface-3] text-[11px] font-semibold uppercase">
                        {(member.user.username ?? "?").slice(0, 2)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm">@{member.user.username}</p>
                        <p className="text-[11px] text-[--color-faint]">
                          {isCreator ? "Owner" : member.role.toLowerCase()}
                        </p>
                      </div>
                    </div>
                    {isAdmin && !isCreator ? (
                      <form
                        action={removeMemberAction.bind(
                          null,
                          league.id,
                          member.userId
                        )}
                      >
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          className="text-[--color-faint] hover:text-[--color-danger]"
                        >
                          Remove
                        </Button>
                      </form>
                    ) : null}
                  </div>
                );
              })}
            </CardBody>
          </Card>
        </aside>
      </div>
    </main>
  );
}
