import { redirect } from "next/navigation";
import { ArrowRight, ChevronRight, Target, Trophy, Users } from "lucide-react";
import { signInWithGoogleAction } from "@/lib/actions";
import { getCurrentUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { TubetsLogo } from "@/components/tubets-logo";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    icon: Target,
    title: "Predict every match",
    body: "Lock in exact scores for all 104 fixtures. Points for outcome, goal difference, and the bullseye."
  },
  {
    icon: Users,
    title: "Private leagues",
    body: "Invite friends with a single code. Climb the table as results land minute by minute."
  },
  {
    icon: Trophy,
    title: "Tournament bets",
    body: "Call the winner and top scorer before kickoff. Bonus points for nailing the bracket."
  }
] as const;

export default async function Home({
  searchParams
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (user) redirect(user.username ? "/dashboard" : "/onboarding");

  return (
    <main className="relative isolate min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 grid-bg opacity-60" />
      <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[--color-accent]/20 blur-[140px]" />
      <div className="pointer-events-none absolute -bottom-40 right-0 -z-10 h-[400px] w-[400px] rounded-full bg-[--color-blue]/10 blur-[120px]" />

      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <TubetsLogo />
          Tubets
        </div>
        <span className="hidden text-xs text-[--color-muted] sm:block">
          North America · Jun 11 – Jul 19, 2026
        </span>
      </header>

      <section className="mx-auto max-w-6xl px-6 pt-20 pb-24 sm:pt-28">
        <div className="inline-flex items-center gap-2 rounded-full border border-[--color-border] bg-[--color-surface]/60 px-3 py-1 text-xs text-[--color-muted] backdrop-blur">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[--color-accent] opacity-75 dot-live" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[--color-accent]" />
          </span>
          Now open · Build your bracket
        </div>

        <h1 className="mt-6 max-w-3xl text-balance text-5xl font-semibold leading-[1.02] tracking-tight sm:text-7xl">
          Predict the tournament.{" "}
          <span className="text-[--color-muted]">Outsmart your friends.</span>
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-[--color-muted] sm:text-lg">
          A private prediction league for the 2026 World Cup. Score every match, call the winner, and watch the table swing live as full-time whistles blow.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <form action={signInWithGoogleAction}>
            <input
              name="callbackUrl"
              type="hidden"
              value={params.callbackUrl ?? "/dashboard"}
            />
            <Button size="lg" type="submit" className="group">
              Continue with Google
              <ArrowRight
                size={16}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </Button>
          </form>
          <a
            href="#how"
            className="inline-flex h-11 items-center gap-1 px-2 text-sm text-[--color-muted] transition-colors hover:text-[--color-text]"
          >
            How it works
            <ChevronRight size={14} />
          </a>
        </div>

        <div className="mt-16 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-[--color-border] bg-[--color-border] sm:max-w-2xl">
          {[
            ["104", "Matches"],
            ["48", "Nations"],
            ["∞", "Banter"]
          ].map(([value, label]) => (
            <div key={label} className="bg-[--color-surface] px-5 py-5">
              <p className="font-mono text-2xl font-semibold tracking-tight">{value}</p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[--color-faint]">
                {label}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="border-t border-[--color-border] bg-[--color-surface]/40">
        <div className="mx-auto grid max-w-6xl gap-px overflow-hidden bg-[--color-border] px-0 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="bg-[--color-bg] p-8">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[--color-border] bg-[--color-surface-2] text-[--color-accent]">
                <Icon size={16} />
              </div>
              <h3 className="mt-5 text-base font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[--color-muted]">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto max-w-6xl border-t border-[--color-border] px-6 py-8 text-xs text-[--color-faint]">
        Tubets · Not affiliated with FIFA
      </footer>
    </main>
  );
}



















