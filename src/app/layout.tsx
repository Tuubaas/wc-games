import type { Metadata } from "next";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { signOutAction } from "@/lib/actions";
import { getCurrentUser } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "World Cup Predictor",
  description: "Private World Cup prediction leagues."
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link className="brand" href={user?.username ? "/dashboard" : "/"}>
            <Trophy aria-hidden="true" size={22} />
            <span>World Cup Predictor</span>
          </Link>
          {user?.username ? (
            <nav className="nav">
              <Link href="/dashboard">Home</Link>
              <Link href="/matches">Matches</Link>
              <Link href="/picks">Picks</Link>
              <form action={signOutAction}>
                <button className="link-button" type="submit">
                  Sign out
                </button>
              </form>
            </nav>
          ) : null}
        </header>
        {children}
      </body>
    </html>
  );
}
