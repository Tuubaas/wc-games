import { redirect } from "next/navigation";
import { completeOnboardingAction } from "@/lib/actions";
import { safeInternalPath } from "@/lib/redirect";
import { requireUser } from "@/lib/session";

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
    <main className="page">
      <section className="panel stack">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Pick a username</h1>
          <p>3-24 chars. Lowercase letters, numbers, underscore.</p>
          {params.error === "username-taken" ? (
            <p className="error">That username is taken.</p>
          ) : null}
        </div>
        <form className="form-row" action={completeOnboardingAction}>
          <input name="next" type="hidden" value={next} />
          <input
            aria-label="Username"
            className="field"
            name="username"
            pattern="[a-zA-Z0-9_]{3,24}"
            required
          />
          <button className="button" type="submit">
            Continue
          </button>
        </form>
      </section>
    </main>
  );
}
