export function assertSafeTestDatabase() {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for database-backed tests.");
  }

  if (process.env.ALLOW_NON_LOCAL_TEST_DB === "true") return;

  const safePattern = /(localhost|127\.0\.0\.1|test|e2e|shadow)/i;
  if (!safePattern.test(databaseUrl)) {
    throw new Error(
      "Refusing to run database tests against a URL that does not look local/test. Set ALLOW_NON_LOCAL_TEST_DB=true for an isolated staging DB."
    );
  }
}
