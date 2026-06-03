# World Cup Predictor

Next.js MVP for private World Cup prediction leagues.

## Stack

- Next.js App Router
- Auth.js / Google login
- Prisma
- Neon Postgres on Vercel
- football-data.org result sync, with admin override

## Local Setup

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:push
npm run seed:demo
npm run dev
```

Set `ADMIN_EMAILS` to comma-separated site-owner emails. Default admin: `tuubbaas@gmail.com`.

## Demo Data

`npm run seed:demo` creates namespaced demo users, demo-only matches, predictions, tournament picks, and two leagues:

- `demo-office-2026`
- `demo-family-2026`

Join from `/join/demo-office-2026` or `/join/demo-family-2026` after login.

## Verification

Run the fast logic tests:

```bash
npm test
```

Run database-backed sync tests against a local or isolated test database:

```bash
RUN_DB_TESTS=true DATABASE_URL="postgresql://..." npm run test:db
```

Run browser flow tests:

```bash
E2E_TEST_MODE=true DATABASE_URL="postgresql://..." npm run test:e2e
```

Database and browser tests refuse to run against URLs that do not look local/test unless `ALLOW_NON_LOCAL_TEST_DB=true` is set.

## Import Real World Cup Data

Use the FIFA import to load the 48 teams, 104 matches, and official 1,248-player final squad list into the configured database.
The player import reads FIFA's official squad PDF and requires `pdftotext` from Poppler.

```bash
npm run import:worldcup -- --dry-run
DATABASE_URL="postgresql://..." npm run import:worldcup
```

The import is idempotent. It upserts teams by FIFA code, matches by match number, and players by team/name. It does not overwrite match results or manual corrections.

## Deploy

1. Create a Vercel project.
2. Add Neon Postgres from Vercel Marketplace.
3. Add env vars from `.env.example`.
4. Add Google OAuth redirect URI:
   `https://YOUR_DOMAIN/api/auth/callback/google`
5. Deploy.

`npm run build` runs `prisma migrate deploy` before `next build`, so Vercel applies checked-in migrations.
The daily cron calls `/api/cron/sync-results`. Use the admin screen for `Sync now` and manual corrections.
Set `CRON_SECRET`; the cron route fails closed without it.
