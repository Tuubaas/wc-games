import { MatchStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { scoreMatchPrediction } from "@/lib/scoring";

const finishedMatch = (homeScore90: number, awayScore90: number) => ({
  status: MatchStatus.FINISHED,
  homeScore90,
  awayScore90
});

describe("scoreMatchPrediction", () => {
  it("awards 8 points for an exact score", () => {
    expect(
      scoreMatchPrediction({ homeGoals: 2, awayGoals: 1 }, finishedMatch(2, 1))
    ).toBe(8);
  });

  it("awards outcome points without exact score points", () => {
    expect(
      scoreMatchPrediction({ homeGoals: 3, awayGoals: 1 }, finishedMatch(2, 0))
    ).toBe(3);
  });

  it("awards one point for each correct team score", () => {
    expect(
      scoreMatchPrediction({ homeGoals: 1, awayGoals: 3 }, finishedMatch(1, 1))
    ).toBe(1);
    expect(
      scoreMatchPrediction({ homeGoals: 4, awayGoals: 2 }, finishedMatch(1, 2))
    ).toBe(1);
  });

  it("returns zero before full-time scores are available", () => {
    expect(
      scoreMatchPrediction(
        { homeGoals: 1, awayGoals: 1 },
        { status: MatchStatus.SCHEDULED, homeScore90: null, awayScore90: null }
      )
    ).toBe(0);
  });
});
