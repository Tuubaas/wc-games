import { expect, test, type Page } from "@playwright/test";
import { MatchStage, MatchStatus, PrismaClient } from "@prisma/client";
import { assertSafeTestDatabase } from "../helpers/test-db";

test.describe.configure({ mode: "serial" });

const prisma = new PrismaClient();
const suffix = Date.now().toString(36).slice(-8);
const owner = {
  email: `owner.${suffix}@example.test`,
  username: `owner_${suffix}`
};
const joiner = {
  email: `joiner.${suffix}@example.test`,
  username: `joiner_${suffix}`
};
const leagueName = `E2E League ${suffix}`;
const unlockedMatchNumber = 870000 + Math.floor(Math.random() * 5000);
const lockedMatchNumber = unlockedMatchNumber + 1;
const codeSuffix = suffix.toUpperCase();
const teamCodes = [`${codeSuffix}A`, `${codeSuffix}B`, `${codeSuffix}C`, `${codeSuffix}D`];
const e2eTestSecret = process.env.E2E_TEST_SECRET ?? "e2e-test-secret";

async function login(page: Page, user: { email: string; username: string }) {
  const response = await page.request.post("/api/test/login", {
    data: user,
    headers: { "x-e2e-test-secret": e2eTestSecret }
  });
  expect(response.ok()).toBe(true);
}

test.beforeAll(async () => {
  assertSafeTestDatabase();
  const [home, away, lockedHome, lockedAway] = await Promise.all([
    prisma.team.create({
      data: { name: `E2E Home ${suffix}`, fifaCode: teamCodes[0] }
    }),
    prisma.team.create({
      data: { name: `E2E Away ${suffix}`, fifaCode: teamCodes[1] }
    }),
    prisma.team.create({
      data: { name: `E2E Locked Home ${suffix}`, fifaCode: teamCodes[2] }
    }),
    prisma.team.create({
      data: { name: `E2E Locked Away ${suffix}`, fifaCode: teamCodes[3] }
    })
  ]);

  await prisma.match.createMany({
    data: [
      {
        matchNumber: unlockedMatchNumber,
        stage: MatchStage.GROUP,
        groupName: "T",
        kickoffAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        homeTeamId: home.id,
        awayTeamId: away.id,
        status: MatchStatus.SCHEDULED
      },
      {
        matchNumber: lockedMatchNumber,
        stage: MatchStage.GROUP,
        groupName: "T",
        kickoffAt: new Date(Date.now() + 20 * 60 * 1000),
        homeTeamId: lockedHome.id,
        awayTeamId: lockedAway.id,
        status: MatchStatus.SCHEDULED
      }
    ]
  });
  await prisma.player.create({
    data: { name: `E2E Striker ${suffix}`, teamId: lockedHome.id }
  });
});

test.afterAll(async () => {
  await prisma.user.deleteMany({
    where: { email: { in: [owner.email, joiner.email] } }
  });
  await prisma.match.deleteMany({
    where: { matchNumber: { in: [unlockedMatchNumber, lockedMatchNumber] } }
  });
  await prisma.team.deleteMany({
    where: { fifaCode: { in: teamCodes } }
  });
  await prisma.$disconnect();
});

test("signup/login, predictions, leagues, joining, leaderboard, and freeze", async ({ page }) => {
  await login(page, owner);
  await page.goto("/dashboard");
  await expect(page.getByText(`@${owner.username}`).first()).toBeVisible();

  await page.goto("/matches");
  const predictionForm = page.getByTestId(`prediction-form-${unlockedMatchNumber}`);
  await predictionForm.getByLabel("Home goals").fill("2");
  await predictionForm.getByLabel("Away goals").fill("1");
  await predictionForm.getByRole("button", { name: "Save" }).click();
  await expect(predictionForm.getByRole("button", { name: "Update" })).toBeVisible();

  await predictionForm.getByLabel("Home goals").fill("3");
  await predictionForm.getByLabel("Away goals").fill("1");
  await predictionForm.getByRole("button", { name: "Update" }).click();
  await expect(predictionForm.getByLabel("Home goals")).toHaveValue("3");
  await expect(predictionForm.getByLabel("Away goals")).toHaveValue("1");

  const lockedForm = page.getByTestId(`prediction-form-${lockedMatchNumber}`);
  await expect(lockedForm.getByLabel("Home goals")).toBeDisabled();
  await expect(lockedForm.getByRole("button", { name: "Save" })).toBeDisabled();

  await page.goto("/picks");
  await expect(page.getByText("Locked").first()).toBeVisible();
  await expect(page.getByPlaceholder("Search countries")).toBeDisabled();
  await expect(page.getByPlaceholder("Search players")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Lock in" }).first()).toBeDisabled();
  await expect(page.getByRole("button", { name: "Lock in" }).nth(1)).toBeDisabled();

  await page.goto("/dashboard");
  await expect(page.getByText("Submitted")).toBeVisible();
  await page.getByPlaceholder("e.g. Office Pool 2026").fill(leagueName);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: leagueName })).toBeVisible();
  await expect(page.getByText(`@${owner.username}`).first()).toBeVisible();

  const inviteCode = new URL(page.url()).pathname.split("/").at(-1);
  expect(inviteCode).toBeTruthy();

  await login(page, joiner);
  await page.goto(`/join/${inviteCode}`);
  await expect(page.getByRole("heading", { name: `Join ${leagueName}` })).toBeVisible();
  await page.getByRole("button", { name: "Join league" }).click();
  await expect(page.getByRole("heading", { name: leagueName })).toBeVisible();
  await expect(page.getByText(`@${joiner.username}`).first()).toBeVisible();
  await expect(page.getByText(`@${owner.username}`).first()).toBeVisible();
  await expect(page.getByText("2 players")).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByText(leagueName)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Global table" })).toBeVisible();
});
