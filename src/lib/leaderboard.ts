type PointRow = {
  id: string;
  username: string;
  points: number;
};

export type RankedRow = PointRow & {
  rank: number;
};

export function rankRows(rows: PointRow[]): RankedRow[] {
  const sorted = [...rows].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return a.username.localeCompare(b.username);
  });

  let currentRank = 0;
  let previousPoints: number | null = null;

  return sorted.map((row, index) => {
    if (previousPoints !== row.points) {
      currentRank = index + 1;
      previousPoints = row.points;
    }

    return { ...row, rank: currentRank };
  });
}
