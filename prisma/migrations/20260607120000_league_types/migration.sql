-- CreateEnum
CREATE TYPE "LeagueType" AS ENUM ('CLASSIC', 'DYNAMIC');

-- AlterTable
ALTER TABLE "League" ADD COLUMN "type" "LeagueType" NOT NULL DEFAULT 'DYNAMIC';

-- CreateTable
CREATE TABLE "ClassicPrediction" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "homeGoals" INTEGER NOT NULL,
    "awayGoals" INTEGER NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassicPrediction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassicPrediction_userId_idx" ON "ClassicPrediction"("userId");

-- CreateIndex
CREATE INDEX "ClassicPrediction_matchId_idx" ON "ClassicPrediction"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassicPrediction_leagueId_userId_matchId_key" ON "ClassicPrediction"("leagueId", "userId", "matchId");

-- AddForeignKey
ALTER TABLE "ClassicPrediction" ADD CONSTRAINT "ClassicPrediction_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassicPrediction" ADD CONSTRAINT "ClassicPrediction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassicPrediction" ADD CONSTRAINT "ClassicPrediction_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
