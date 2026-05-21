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

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: authSecret ?? "dev-only-world-cup-predictor-secret",
  session: { strategy: "database" },
  pages: { signIn: "/" },
  providers: googleClientId && googleClientSecret ? [
    Google({
      clientId: googleClientId,
      clientSecret: googleClientSecret
    })
  ] : [],
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.username = user.username;
      }
      return session;
    }
  }
});
