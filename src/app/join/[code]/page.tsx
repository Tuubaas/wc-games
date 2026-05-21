import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { auth } from "@/auth";
import { joinLeagueAction, signInWithGoogleAction } from "@/lib/actions";
import { prisma } from "@/lib/db";

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

  const session = await auth();
  if (!session?.user?.id) {
    return (
      <main className="page">
        <section className="panel stack">
          <p className="eyebrow">Invite</p>
          <h1>{league.name}</h1>
          <p>{league.members.length} members</p>
          <form action={signInWithGoogleAction}>
            <input name="callbackUrl" type="hidden" value={`/join/${code}`} />
            <button className="button" type="submit">
              <ShieldCheck size={18} />
              Continue with Google
            </button>
          </form>
        </section>
      </main>
    );
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user?.username) redirect(`/onboarding?next=${encodeURIComponent(`/join/${code}`)}`);

  const isMember = league.members.some((member) => member.userId === user.id);
  if (isMember) redirect(`/leagues/${league.inviteCode}`);

  return (
    <main className="page">
      <section className="panel stack">
        <p className="eyebrow">Invite</p>
        <h1>{league.name}</h1>
        <p>{league.members.length} members</p>
        <form action={joinLeagueAction.bind(null, code)}>
          <button className="button" type="submit">
            Join league
          </button>
        </form>
      </section>
    </main>
  );
}
