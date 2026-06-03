import { type NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { z } from "zod";
import { prisma } from "@/lib/db";

const authSecret =
  process.env.AUTH_SECRET ??
  process.env.NEXTAUTH_SECRET ??
  "dev-only-world-cup-predictor-secret";
const sessionMaxAgeSeconds = 7 * 24 * 60 * 60;

const loginSchema = z.object({
  email: z.string().email(),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,24}$/),
  name: z.string().trim().min(1).max(80).optional()
});

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.E2E_TEST_SECRET;
  const suppliedSecret = request.headers.get("x-e2e-test-secret");

  if (
    process.env.E2E_TEST_MODE !== "true" ||
    process.env.NODE_ENV === "production" ||
    !expectedSecret ||
    suppliedSecret !== expectedSecret
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const payload = loginSchema.parse(await request.json());
  const expires = new Date(Date.now() + sessionMaxAgeSeconds * 1000);

  const user = await prisma.user.upsert({
    where: { email: payload.email },
    update: {
      username: payload.username,
      name: payload.name ?? payload.username
    },
    create: {
      email: payload.email,
      emailVerified: new Date(),
      username: payload.username,
      name: payload.name ?? payload.username
    }
  });

  const sessionToken = await encode({
    token: {
      id: user.id,
      name: user.name,
      email: user.email,
      picture: user.image,
      sub: user.id,
      username: user.username
    },
    secret: authSecret,
    salt: "authjs.session-token",
    maxAge: sessionMaxAgeSeconds
  });

  const response = NextResponse.json({ ok: true, userId: user.id });
  response.cookies.set("authjs.session-token", sessionToken, {
    expires,
    httpOnly: true,
    path: "/",
    sameSite: "lax"
  });

  return response;
}
