import Link from "next/link";
import { LeagueType } from "@prisma/client";
import { ArrowRight, Plus, Users } from "lucide-react";
import { createLeagueAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/ui/section";

export const dynamic = "force-dynamic";

export default async function LeaguesPage() {
  const user = await requireUser({ nextPath: "/leagues" });
  const leagues = await prisma.league.findMany({
    where: { members: { some: { userId: user.id } } },
    include: { members: true },
    orderBy: { createdAt: "desc" }
  });

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <PageHeader
        eyebrow="Leagues"
        title="Your leagues"
        description="All private tables you have joined."
      />

      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users size={15} className="text-[--color-muted]" />
              <CardTitle>League list</CardTitle>
            </div>
            <Badge tone="muted">{leagues.length}</Badge>
          </CardHeader>
          <CardBody className="!px-0 !pb-0">
            {leagues.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState>No leagues yet.</EmptyState>
              </div>
            ) : (
              <div className="divide-y divide-[--color-border] border-t border-[--color-border]">
                {leagues.map((league) => (
                  <Link
                    key={league.id}
                    href={`/leagues/${league.inviteCode}`}
                    prefetch={false}
                    className="group flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-[--color-surface-2]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[--color-surface-3] text-sm font-semibold uppercase">
                        {league.name.slice(0, 2)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{league.name}</p>
                        <p className="text-xs text-[--color-muted]">
                          {league.members.length}{" "}
                          {league.members.length === 1 ? "member" : "members"} ·{" "}
                          {league.type === LeagueType.CLASSIC ? "Classic" : "Dynamic"}
                        </p>
                      </div>
                    </div>
                    <ArrowRight
                      size={15}
                      className="shrink-0 text-[--color-faint] transition-transform group-hover:translate-x-0.5 group-hover:text-[--color-text]"
                    />
                  </Link>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Create a league</CardTitle>
          </CardHeader>
          <CardBody>
            <form action={createLeagueAction} className="space-y-3">
              <Input name="name" placeholder="e.g. Office Pool 2026" required />
              <Select
                name="type"
                defaultValue={LeagueType.DYNAMIC}
                aria-label="League type"
              >
                <option value={LeagueType.DYNAMIC}>Dynamic</option>
                <option value={LeagueType.CLASSIC}>Classic</option>
              </Select>
              <Button type="submit" className="w-full">
                <Plus size={15} />
                Create
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
