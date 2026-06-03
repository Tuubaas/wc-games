import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";

const googleClientId = process.env.GOOGLE_CLIENT_ID ?? process.env.AUTH_GOOGLE_ID;
const googleClientSecret =
  process.env.GOOGLE_CLIENT_SECRET ?? process.env.AUTH_GOOGLE_SECRET;
const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

if (process.env.NODE_ENV === "production") {
  if (!authSecret) throw new Error("AUTH_SECRET is required in production.");
  if (!googleClientId || !googleClientSecret) {
    throw new Error("Google OAuth env vars are required in production.");
  }
}

export const { handlers, auth, signIn, signOut, unstable_update: updateSession } = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: authSecret ?? "dev-only-world-cup-predictor-secret",
  session: { strategy: "jwt" },
  pages: { signIn: "/" },
  providers: googleClientId && googleClientSecret ? [
    Google({
      clientId: googleClientId,
      clientSecret: googleClientSecret
    })
  ] : [],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.username = user.username ?? null;
      }

      if (trigger === "update") {
        const userId = typeof token.id === "string" ? token.id : token.sub;
        if (!userId) return null;

        const refreshedUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, image: true, name: true, username: true }
        });
        if (!refreshedUser) return null;

        token.email = refreshedUser.email ?? token.email;
        token.name = refreshedUser.name ?? token.name;
        token.picture = refreshedUser.image ?? token.picture;
        token.username = refreshedUser.username ?? null;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id ?? token.sub ?? "");
        session.user.username =
          typeof token.username === "string" ? token.username : null;
      }
      return session;
    }
  }
});
