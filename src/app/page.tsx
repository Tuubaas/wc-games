import { redirect } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { auth } from "@/auth";
import { signInWithGoogleAction } from "@/lib/actions";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const params = await searchParams;
  const session = await auth();
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    redirect(user?.username ? "/dashboard" : "/onboarding");
  }

  return (
    <main className="public-page">
      <section className="hero">
        <div className="hero-content">
          <div className="eyebrow">Prediction leagues</div>
          <h1>World Cup Predictor</h1>
          <p>
            Create private leagues, predict every score, and climb the table when
            results land after full time.
          </p>
          <form action={signInWithGoogleAction}>
            <input
              name="callbackUrl"
              type="hidden"
              value={params.callbackUrl ?? "/dashboard"}
            />
            <button className="button" type="submit">
              <ShieldCheck size={18} />
              Continue with Google
              <ArrowRight size={18} />
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
