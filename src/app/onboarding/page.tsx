import { redirect } from "next/navigation";
import { AtSign, ArrowRight } from "lucide-react";
import { completeOnboardingAction } from "@/lib/actions";
import { safeInternalPath } from "@/lib/redirect";
import { requireUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = safeInternalPath(params.next, "/dashboard");
  const user = await requireUser({ allowMissingUsername: true, nextPath: "/onboarding" });
  if (user.username) redirect(next);

  return (
    <main className="relative isolate min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 grid-bg opacity-50" />
      <div className="pointer-events-none absolute -top-32 left-1/2 -z-10 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-[--color-accent]/15 blur-[140px]" />

      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
        <Card>
          <CardBody className="space-y-6 !px-7 !pb-7 pt-7">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[--color-accent]">
                One last step
              </p>
              <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">
                Choose your handle
              </h1>
              <p className="mt-2 text-sm text-[--color-muted]">
                3–24 characters · lowercase letters, numbers, underscore. Visible on
                leaderboards.
              </p>
            </div>

            {params.error === "username-taken" ? (
              <p className="rounded-md border border-[--color-danger]/40 bg-[--color-danger-soft] px-3 py-2 text-xs text-[--color-danger]">
                That username is taken. Try another.
              </p>
            ) : null}

            <form action={completeOnboardingAction} className="space-y-4">
              <input name="next" type="hidden" value={next} />
              <div className="relative">
                <AtSign
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[--color-faint]"
                />
                <input
                  aria-label="Username"
                  autoFocus
                  className="h-11 w-full rounded-md border border-[--color-border] bg-[--color-surface-2] pl-9 pr-3 text-sm text-[--color-text] placeholder:text-[--color-faint] focus:border-[--color-accent]/60 focus:bg-[--color-surface-3] focus:outline-none"
                  name="username"
                  placeholder="yourhandle"
                  pattern="[a-zA-Z0-9_]{3,24}"
                  required
                />
              </div>
              <Button type="submit" className="group w-full" size="lg">
                Continue
                <ArrowRight
                  size={15}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
