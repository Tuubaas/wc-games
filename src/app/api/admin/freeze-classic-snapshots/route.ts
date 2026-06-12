import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSiteAdmin } from "@/lib/config";
import { prisma } from "@/lib/db";
import { freezeAllClassicGroupPredictions } from "@/lib/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true }
  });
  if (!user || !isSiteAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await freezeAllClassicGroupPredictions();
  return NextResponse.json(result);
}
