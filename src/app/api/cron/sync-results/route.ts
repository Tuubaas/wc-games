import { NextResponse } from "next/server";
import { syncFootballDataResults } from "@/lib/results-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncFootballDataResults();
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
