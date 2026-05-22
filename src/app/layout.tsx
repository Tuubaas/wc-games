import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { isSiteAdmin } from "@/lib/config";
import { getCurrentUser } from "@/lib/session";
import { Topbar } from "@/components/nav/topbar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"]
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"]
});

export const metadata: Metadata = {
  title: "World Cup 26 — Predictor",
  description: "Private prediction leagues for the World Cup."
};

export default async function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  const showNav = Boolean(user?.username);

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} dark`}>
      <body className="font-sans">
        {showNav ? (
          <Topbar
            username={user!.username as string}
            isAdmin={isSiteAdmin(user!.email)}
          />
        ) : null}
        {children}
      </body>
    </html>
  );
}
