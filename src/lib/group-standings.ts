type GroupMatch = {
  id: string;
  groupName: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
};

type MatchScore = {
  matchId: string;
  homeGoals: number;
  awayGoals: number;
};

type StandingEntry = {
  teamId: string;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
};

type ResolvedScore = {
  homeGoals: number;
  awayGoals: number;
};

export function scoreGroupPlacementBonus(
  matches: GroupMatch[],
  actualScores: MatchScore[],
  predictedScores: MatchScore[]
) {
  const actualPlacements = buildPlacementsByGroup(matches, actualScores);
  const groupCount = new Set(matches.map((match) => match.groupName).filter(Boolean))
    .size;

  if (groupCount === 0 || actualPlacements.size !== groupCount) return 0;

  const predictedPlacements = buildPlacementsByGroup(matches, predictedScores);
  let points = 0;

  for (const [groupName, actualGroup] of actualPlacements) {
    const predictedGroup = predictedPlacements.get(groupName);
    if (!predictedGroup) continue;

    for (const [teamId, actualPlacement] of actualGroup) {
      if (predictedGroup.get(teamId) === actualPlacement) points += 1;
    }
  }

  return points;
}

function buildPlacementsByGroup(matches: GroupMatch[], scores: MatchScore[]) {
  const scoresByMatchId = new Map(
    scores.map((score) => [
      score.matchId,
      { homeGoals: score.homeGoals, awayGoals: score.awayGoals }
    ])
  );
  const groups = new Map<string, GroupMatch[]>();

  for (const match of matches) {
    if (!match.groupName) continue;
    const group = groups.get(match.groupName) ?? [];
    group.push(match);
    groups.set(match.groupName, group);
  }

  const placements = new Map<string, Map<string, number>>();
  for (const [groupName, groupMatches] of groups) {
    const groupPlacement = buildGroupPlacements(groupMatches, scoresByMatchId);
    if (groupPlacement) placements.set(groupName, groupPlacement);
  }

  return placements;
}

function buildGroupPlacements(
  matches: GroupMatch[],
  scoresByMatchId: Map<string, ResolvedScore>
) {
  const entries = new Map<string, StandingEntry>();

  for (const match of matches) {
    if (!match.homeTeamId || !match.awayTeamId) return null;
    const score = scoresByMatchId.get(match.id);
    if (!score) return null;

    const home = getEntry(entries, match.homeTeamId);
    const away = getEntry(entries, match.awayTeamId);
    home.goalsFor += score.homeGoals;
    home.goalsAgainst += score.awayGoals;
    away.goalsFor += score.awayGoals;
    away.goalsAgainst += score.homeGoals;

    if (score.homeGoals > score.awayGoals) {
      home.points += 3;
    } else if (score.homeGoals < score.awayGoals) {
      away.points += 3;
    } else {
      home.points += 1;
      away.points += 1;
    }
  }

  const sorted = sortEntries(Array.from(entries.values()), matches, scoresByMatchId);
  return new Map(sorted.map((entry, index) => [entry.teamId, index + 1]));
}

function getEntry(entries: Map<string, StandingEntry>, teamId: string) {
  const existing = entries.get(teamId);
  if (existing) return existing;

  const entry = { teamId, points: 0, goalsFor: 0, goalsAgainst: 0 };
  entries.set(teamId, entry);
  return entry;
}

function sortEntries(
  entries: StandingEntry[],
  matches: GroupMatch[],
  scoresByMatchId: Map<string, ResolvedScore>
) {
  const basicGroups = new Map<string, StandingEntry[]>();
  const basicSorted = [...entries].sort(compareBasic);

  for (const entry of basicSorted) {
    const key = `${entry.points}:${goalDifference(entry)}:${entry.goalsFor}`;
    const group = basicGroups.get(key) ?? [];
    group.push(entry);
    basicGroups.set(key, group);
  }

  return Array.from(basicGroups.values()).flatMap((group) => {
    if (group.length === 1) return group;
    const tiedIds = new Set(group.map((entry) => entry.teamId));
    const headToHead = buildHeadToHeadEntries(tiedIds, matches, scoresByMatchId);

    return [...group].sort((a, b) => {
      const h2hA = headToHead.get(a.teamId) ?? emptyEntry(a.teamId);
      const h2hB = headToHead.get(b.teamId) ?? emptyEntry(b.teamId);
      const headToHeadOrder = compareBasic(h2hA, h2hB);
      if (headToHeadOrder !== 0) return headToHeadOrder;
      return a.teamId.localeCompare(b.teamId);
    });
  });
}

function buildHeadToHeadEntries(
  tiedTeamIds: Set<string>,
  matches: GroupMatch[],
  scoresByMatchId: Map<string, ResolvedScore>
) {
  const entries = new Map<string, StandingEntry>();
  for (const teamId of tiedTeamIds) entries.set(teamId, emptyEntry(teamId));

  for (const match of matches) {
    if (
      !match.homeTeamId ||
      !match.awayTeamId ||
      !tiedTeamIds.has(match.homeTeamId) ||
      !tiedTeamIds.has(match.awayTeamId)
    ) {
      continue;
    }

    const score = scoresByMatchId.get(match.id);
    if (!score) continue;

    const home = getEntry(entries, match.homeTeamId);
    const away = getEntry(entries, match.awayTeamId);
    home.goalsFor += score.homeGoals;
    home.goalsAgainst += score.awayGoals;
    away.goalsFor += score.awayGoals;
    away.goalsAgainst += score.homeGoals;

    if (score.homeGoals > score.awayGoals) {
      home.points += 3;
    } else if (score.homeGoals < score.awayGoals) {
      away.points += 3;
    } else {
      home.points += 1;
      away.points += 1;
    }
  }

  return entries;
}

function compareBasic(a: StandingEntry, b: StandingEntry) {
  if (b.points !== a.points) return b.points - a.points;
  if (goalDifference(b) !== goalDifference(a)) {
    return goalDifference(b) - goalDifference(a);
  }
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  return 0;
}

function goalDifference(entry: StandingEntry) {
  return entry.goalsFor - entry.goalsAgainst;
}

function emptyEntry(teamId: string): StandingEntry {
  return { teamId, points: 0, goalsFor: 0, goalsAgainst: 0 };
}
