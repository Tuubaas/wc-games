import { LeagueType } from "@prisma/client";
import { redirect } from "next/navigation";
import { ArrowRight, ShieldCheck, Users } from "lucide-react";
import { joinLeagueAction, signInWithGoogleAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function JoinLeaguePage({
  params
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const league = await prisma.league.findUnique({
    where: { inviteCode: code },
    include: { members: true }
  });
  if (!league) redirect("/");

  const user = await getCurrentUser();

  if (user) {
    if (!user.username) redirect(`/onboarding?next=${encodeURIComponent(`/join/${code}`)}`);
    const isMember = league.members.some((member) => member.userId === user.id);
    if (isMember) redirect(`/leagues/${league.inviteCode}`);
  }

  return (
    <main className="relative isolate min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 grid-bg opacity-50" />
      <div className="pointer-events-none absolute -top-32 left-1/2 -z-10 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-[--color-accent]/15 blur-[140px]" />

      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
        <Card>
          <CardBody className="!px-7 !pb-7 pt-7 space-y-6">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[--color-accent]">
                You&apos;ve been invited
              </p>
              <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">
                Join {league.name}
              </h1>
              <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-[--color-muted]">
                <Users size={13} />
                {league.members.length}{" "}
                {league.members.length === 1 ? "member already in" : "members already in"} ·{" "}
                {league.type === LeagueType.CLASSIC ? "Classic" : "Dynamic"}
              </p>
            </div>

            {user ? (
              <form action={joinLeagueAction.bind(null, code)}>
                <Button type="submit" size="lg" className="group w-full">
                  Join league
                  <ArrowRight
                    size={15}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </Button>
              </form>
            ) : (
              <form action={signInWithGoogleAction}>
                <input name="callbackUrl" type="hidden" value={`/join/${code}`} />
                <Button type="submit" size="lg" className="w-full">
                  <ShieldCheck size={15} />
                  Continue with Google
                </Button>
              </form>
            )}
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
