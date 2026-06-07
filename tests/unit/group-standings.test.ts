import { describe, expect, it } from "vitest";
import { scoreGroupPlacementBonus } from "@/lib/group-standings";

const matches = [
  { id: "m1", groupName: "A", homeTeamId: "A", awayTeamId: "B" },
  { id: "m2", groupName: "A", homeTeamId: "C", awayTeamId: "D" },
  { id: "m3", groupName: "A", homeTeamId: "A", awayTeamId: "C" },
  { id: "m4", groupName: "A", homeTeamId: "B", awayTeamId: "D" },
  { id: "m5", groupName: "A", homeTeamId: "A", awayTeamId: "D" },
  { id: "m6", groupName: "A", homeTeamId: "B", awayTeamId: "C" }
];

const actualScores = [
  { matchId: "m1", homeGoals: 1, awayGoals: 0 },
  { matchId: "m2", homeGoals: 2, awayGoals: 0 },
  { matchId: "m3", homeGoals: 0, awayGoals: 2 },
  { matchId: "m4", homeGoals: 1, awayGoals: 0 },
  { matchId: "m5", homeGoals: 3, awayGoals: 0 },
  { matchId: "m6", homeGoals: 0, awayGoals: 0 }
];

describe("scoreGroupPlacementBonus", () => {
  it("awards one point per correctly placed team", () => {
    expect(scoreGroupPlacementBonus(matches, actualScores, actualScores)).toBe(4);
  });

  it("awards only teams in the correct final position", () => {
    expect(
      scoreGroupPlacementBonus(matches, actualScores, [
        { matchId: "m1", homeGoals: 1, awayGoals: 0 },
        { matchId: "m2", homeGoals: 2, awayGoals: 0 },
        { matchId: "m3", homeGoals: 3, awayGoals: 0 },
        { matchId: "m4", homeGoals: 1, awayGoals: 0 },
        { matchId: "m5", homeGoals: 3, awayGoals: 0 },
        { matchId: "m6", homeGoals: 0, awayGoals: 0 }
      ])
    ).toBe(1);
  });

  it("does not award a group bonus from incomplete predictions", () => {
    expect(scoreGroupPlacementBonus(matches, actualScores, actualScores.slice(0, -1))).toBe(
      0
    );
  });

  it("does not award bonuses before actual group standings are complete", () => {
    expect(scoreGroupPlacementBonus(matches, actualScores.slice(0, -1), actualScores)).toBe(
      0
    );
  });
});
