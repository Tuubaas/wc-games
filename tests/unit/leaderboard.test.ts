import { describe, expect, it } from "vitest";
import { rankRows } from "@/lib/leaderboard";

describe("rankRows", () => {
  it("uses competition ranking and alphabetical tie sorting", () => {
    expect(
      rankRows([
        { id: "3", username: "zoe", points: 7 },
        { id: "1", username: "alex", points: 10 },
        { id: "2", username: "bea", points: 10 },
        { id: "4", username: "mika", points: 5 }
      ])
    ).toEqual([
      { id: "1", username: "alex", points: 10, rank: 1 },
      { id: "2", username: "bea", points: 10, rank: 1 },
      { id: "3", username: "zoe", points: 7, rank: 3 },
      { id: "4", username: "mika", points: 5, rank: 4 }
    ]);
  });
});
