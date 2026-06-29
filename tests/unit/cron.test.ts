import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import vercelConfig from "../../vercel.json";

const { syncFootballDataResults } = vi.hoisted(() => ({
  syncFootballDataResults: vi.fn()
}));

vi.mock("@/lib/results-sync", () => ({
  syncFootballDataResults
}));

describe("daily result sync cron", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    syncFootballDataResults.mockResolvedValue({
      failed: 0,
      fixtures: 4,
      updated: 2,
      skipped: false
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("is scheduled for 05:00 UTC every day", () => {
    expect(vercelConfig.crons).toContainEqual({
      path: "/api/cron/sync-results",
      schedule: "0 5 * * *"
    });
  });

  it("rejects requests without the cron secret", async () => {
    const { GET } = await import("@/app/api/cron/sync-results/route");
    const response = await GET(new Request("https://example.test/api/cron/sync-results"));

    expect(response.status).toBe(401);
    expect(syncFootballDataResults).not.toHaveBeenCalled();
  });

  it("runs the football-data sync for authorized cron requests", async () => {
    const { GET } = await import("@/app/api/cron/sync-results/route");
    const response = await GET(
      new Request("https://example.test/api/cron/sync-results", {
        headers: { authorization: "Bearer test-cron-secret" }
      })
    );

    await expect(response.json()).resolves.toEqual({
      failed: 0,
      fixtures: 4,
      updated: 2,
      skipped: false
    });
    expect(response.status).toBe(200);
    expect(syncFootballDataResults).toHaveBeenCalledOnce();
  });

  it("returns sync errors as JSON", async () => {
    syncFootballDataResults.mockRejectedValue(new Error("football-data exploded"));
    const { GET } = await import("@/app/api/cron/sync-results/route");
    const response = await GET(
      new Request("https://example.test/api/cron/sync-results", {
        headers: { authorization: "Bearer test-cron-secret" }
      })
    );

    await expect(response.json()).resolves.toEqual({ error: "Sync failed" });
    expect(response.status).toBe(500);
  });
});
