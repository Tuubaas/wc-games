import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isSiteAdmin } from "@/lib/config";
import { prisma } from "@/lib/db";
import { safeInternalPath } from "@/lib/redirect";

type RequireUserOptions = {
  allowMissingUsername?: boolean;
  nextPath?: string;
};

export type CurrentUser = {
  id: string;
  email?: string | null;
  username?: string | null;
  name?: string | null;
  image?: string | null;
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;

  return {
    id: session.user.id,
    email: session.user.email ?? null,
    username: session.user.username ?? null,
    name: session.user.name ?? null,
    image: session.user.image ?? null
  };
});

export async function requireUser(options: RequireUserOptions = {}) {
  const nextPath = safeInternalPath(options.nextPath, "/dashboard");
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/?callbackUrl=${encodeURIComponent(nextPath)}`);
  }

  if (!user.username && !options.allowMissingUsername) {
    redirect(`/onboarding?next=${encodeURIComponent(nextPath)}`);
  }

  return user;
}

export async function requireSiteAdmin(nextPath = "/admin") {
  const user = await requireUser({ nextPath });
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true }
  });

  if (!dbUser || !isSiteAdmin(dbUser.email)) redirect("/dashboard");
  return { ...user, email: dbUser.email };
}
