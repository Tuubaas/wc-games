import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isSiteAdmin } from "@/lib/config";
import { prisma } from "@/lib/db";
import { safeInternalPath } from "@/lib/redirect";

type RequireUserOptions = {
  allowMissingUsername?: boolean;
  nextPath?: string;
};

export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return prisma.user.findUnique({ where: { id: session.user.id } });
}

export async function requireUser(options: RequireUserOptions = {}) {
  const session = await auth();
  const nextPath = safeInternalPath(options.nextPath, "/dashboard");
  if (!session?.user?.id) {
    redirect(`/?callbackUrl=${encodeURIComponent(nextPath)}`);
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) redirect(`/?callbackUrl=${encodeURIComponent(nextPath)}`);

  if (!user.username && !options.allowMissingUsername) {
    redirect(`/onboarding?next=${encodeURIComponent(nextPath)}`);
  }

  return user;
}

export async function requireSiteAdmin(nextPath = "/admin") {
  const user = await requireUser({ nextPath });
  if (!isSiteAdmin(user.email)) redirect("/dashboard");
  return user;
}
