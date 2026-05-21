import {
  MatchStage,
  MatchStatus,
  PrismaClient,
  TournamentPickType
} from "@prisma/client";

const prisma = new PrismaClient();

if (process.env.DEMO_SEED !== "true") {
  throw new Error("Refusing to seed demo data unless DEMO_SEED=true is set.");
}

const teams = [
  { name: "Canada", fifaCode: "CAN" },
  { name: "Mexico", fifaCode: "MEX" },
  { name: "United States", fifaCode: "USA" },
  { name: "Brazil", fifaCode: "BRA" },
  { name: "England", fifaCode: "ENG" },
  { name: "France", fifaCode: "FRA" },
  { name: "Spain", fifaCode: "ESP" },
  { name: "Argentina", fifaCode: "ARG" }
];

const players = [
  ["Jonathan David", "CAN"],
  ["Santiago Gimenez", "MEX"],
  ["Christian Pulisic", "USA"],
  ["Vinicius Junior", "BRA"],
  ["Harry Kane", "ENG"],
  ["Kylian Mbappe", "FRA"],
  ["Alvaro Morata", "ESP"],
  ["Lionel Messi", "ARG"]
] as const;

const demoUsers = [
  { email: "alex.demo@example.test", username: "demo_alex_2026" },
  { email: "samira.demo@example.test", username: "demo_samira_2026" },
  { email: "jamie.demo@example.test", username: "demo_jamie_2026" },
  { email: "mika.demo@example.test", username: "demo_mika_2026" },
  { email: "lina.demo@example.test", username: "demo_lina_2026" }
];

const fixtures = [
  ["CAN", "MEX", "2026-05-14T19:00:00.000Z", "A", 2, 1],
  ["USA", "BRA", "2026-05-15T01:00:00.000Z", "B", 1, 3],
  ["ENG", "FRA", "2026-05-15T19:00:00.000Z", "C", 0, 0],
  ["ESP", "ARG", "2026-05-16T01:00:00.000Z", "D", 2, 2],
  ["FRA", "CAN", "2026-05-16T19:00:00.000Z", "A", 2, 0],
  ["BRA", "ENG", "2026-05-17T01:00:00.000Z", "C", 1, 1],
  ["CAN", "BRA", "2026-06-11T19:00:00.000Z", "A", null, null],
  ["USA", "MEX", "2026-06-12T01:00:00.000Z", "B", null, null],
  ["ENG", "ARG", "2026-06-12T19:00:00.000Z", "C", null, null],
  ["ESP", "FRA", "2026-06-13T01:00:00.000Z", "D", null, null]
] as const;

const predictionSets = [
  [
    [2, 1],
    [1, 2],
    [1, 1],
    [2, 1],
    [2, 0],
    [1, 1],
    [1, 2],
    [2, 1],
    [1, 1],
    [1, 2]
  ],
  [
    [1, 1],
    [0, 3],
    [0, 0],
    [1, 2],
    [1, 0],
    [2, 1],
    [0, 2],
    [1, 1],
    [2, 1],
    [1, 1]
  ],
  [
    [3, 1],
    [1, 3],
    [2, 1],
    [2, 2],
    [3, 0],
    [1, 0],
    [1, 1],
    [2, 0],
    [1, 2],
    [0, 2]
  ],
  [
    [0, 1],
    [1, 1],
    [0, 2],
    [0, 0],
    [2, 1],
    [2, 2],
    [2, 3],
    [1, 2],
    [1, 0],
    [2, 2]
  ],
  [
    [2, 0],
    [2, 3],
    [1, 0],
    [3, 3],
    [1, 1],
    [0, 0],
    [0, 1],
    [3, 1],
    [2, 2],
    [1, 3]
  ]
] as const;

function outcome(homeGoals: number, awayGoals: number) {
  if (homeGoals > awayGoals) return "HOME";
  if (homeGoals < awayGoals) return "AWAY";
  return "DRAW";
}

function scorePrediction(
  homeGoals: number,
  awayGoals: number,
  homeScore90: number | null,
  awayScore90: number | null
) {
  if (homeScore90 === null || awayScore90 === null) return 0;

  let points = 0;
  if (outcome(homeGoals, awayGoals) === outcome(homeScore90, awayScore90)) points += 3;
  if (homeGoals === homeScore90) points += 1;
  if (awayGoals === awayScore90) points += 1;
  if (homeGoals === homeScore90 && awayGoals === awayScore90) points += 3;
  return points;
}

async function main() {
  for (const team of teams) {
    await prisma.team.upsert({
      where: { fifaCode: team.fifaCode },
      update: team,
      create: team
    });
  }

  const allTeams = await prisma.team.findMany();
  const byCode = new Map(allTeams.map((team) => [team.fifaCode, team]));

  for (const [name, fifaCode] of players) {
    const team = byCode.get(fifaCode);
    if (!team) continue;
    await prisma.player.upsert({
      where: { teamId_name: { teamId: team.id, name } },
      update: {},
      create: { name, teamId: team.id }
    });
  }

  const matches = [];
  for (const [index, fixture] of fixtures.entries()) {
    const [home, away, kickoffAt, groupName, homeScore90, awayScore90] = fixture;
    const homeTeam = byCode.get(home);
    const awayTeam = byCode.get(away);
    if (!homeTeam || !awayTeam) continue;
    const externalId = `demo-2026-${index + 1}`;

    const match = await prisma.match.upsert({
      where: { externalId },
      update: {
        kickoffAt: new Date(kickoffAt),
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        groupName,
        homeScore90,
        awayScore90,
        status: homeScore90 === null ? MatchStatus.SCHEDULED : MatchStatus.FINISHED,
        resultSource: homeScore90 === null ? null : "admin"
      },
      create: {
        externalId,
        matchNumber: 9001 + index,
        stage: MatchStage.GROUP,
        groupName,
        kickoffAt: new Date(kickoffAt),
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        homeScore90,
        awayScore90,
        status: homeScore90 === null ? MatchStatus.SCHEDULED : MatchStatus.FINISHED,
        resultSource: homeScore90 === null ? null : "admin"
      }
    });
    matches.push(match);
  }

  const users = [];
  for (const user of demoUsers) {
    const usernameOwner = await prisma.user.findUnique({ where: { username: user.username } });
    if (usernameOwner && usernameOwner.email !== user.email) {
      throw new Error(`Demo username ${user.username} is already used by another account.`);
    }

    users.push(
      await prisma.user.upsert({
        where: { email: user.email },
        update: { username: user.username, name: user.username },
        create: {
          email: user.email,
          username: user.username,
          name: user.username
        }
      })
    );
  }

  const officeLeague = await upsertDemoLeague({
    inviteCode: "demo-office-2026",
    name: "Office League",
    createdById: users[0].id
  });

  const familyLeague = await upsertDemoLeague({
    inviteCode: "demo-family-2026",
    name: "Family League",
    createdById: users[1].id
  });

  for (const [index, user] of users.entries()) {
    await prisma.leagueMember.upsert({
      where: { leagueId_userId: { leagueId: officeLeague.id, userId: user.id } },
      update: { role: index === 0 ? "ADMIN" : "MEMBER" },
      create: {
        leagueId: officeLeague.id,
        userId: user.id,
        role: index === 0 ? "ADMIN" : "MEMBER"
      }
    });

    if (index < 3) {
      await prisma.leagueMember.upsert({
        where: { leagueId_userId: { leagueId: familyLeague.id, userId: user.id } },
        update: { role: index === 1 ? "ADMIN" : "MEMBER" },
        create: {
          leagueId: familyLeague.id,
          userId: user.id,
          role: index === 1 ? "ADMIN" : "MEMBER"
        }
      });
    }
  }

  for (const [userIndex, user] of users.entries()) {
    for (const [matchIndex, match] of matches.entries()) {
      const [homeGoals, awayGoals] = predictionSets[userIndex][matchIndex];
      await prisma.prediction.upsert({
        where: { userId_matchId: { userId: user.id, matchId: match.id } },
        update: {
          homeGoals,
          awayGoals,
          points: scorePrediction(homeGoals, awayGoals, match.homeScore90, match.awayScore90)
        },
        create: {
          userId: user.id,
          matchId: match.id,
          homeGoals,
          awayGoals,
          points: scorePrediction(homeGoals, awayGoals, match.homeScore90, match.awayScore90)
        }
      });
    }
  }

  const allPlayers = await prisma.player.findMany({ include: { team: true } });
  const playerByTeamAndName = new Map(
    allPlayers.map((player) => [`${player.team.fifaCode}:${player.name}`, player])
  );
  const winnerCodes = ["FRA", "BRA", "ARG", "FRA", "ENG"];
  const scorerKeys = [
    "FRA:Kylian Mbappe",
    "BRA:Vinicius Junior",
    "ARG:Lionel Messi",
    "ENG:Harry Kane",
    "FRA:Kylian Mbappe"
  ];

  for (const [index, user] of users.entries()) {
    const winnerTeam = byCode.get(winnerCodes[index]);
    const scorer = playerByTeamAndName.get(scorerKeys[index]);

    if (winnerTeam) {
      await prisma.tournamentPick.upsert({
        where: { userId_type: { userId: user.id, type: TournamentPickType.WINNER } },
        update: {
          teamId: winnerTeam.id,
          playerId: null,
          points: 0
        },
        create: {
          userId: user.id,
          type: TournamentPickType.WINNER,
          teamId: winnerTeam.id,
          points: 0
        }
      });
    }

    if (scorer) {
      await prisma.tournamentPick.upsert({
        where: { userId_type: { userId: user.id, type: TournamentPickType.TOP_SCORER } },
        update: {
          teamId: null,
          playerId: scorer.id,
          points: 0
        },
        create: {
          userId: user.id,
          type: TournamentPickType.TOP_SCORER,
          playerId: scorer.id,
          points: 0
        }
      });
    }
  }

  console.log("Seeded demo data.");
  console.log("Join codes: demo-office-2026, demo-family-2026");
  console.log(`Users: ${users.map((user) => user.username).join(", ")}`);
}

async function upsertDemoLeague(input: {
  inviteCode: string;
  name: string;
  createdById: string;
}) {
  const existing = await prisma.league.findUnique({
    where: { inviteCode: input.inviteCode }
  });

  if (existing && existing.createdById !== input.createdById) {
    throw new Error(`Invite code ${input.inviteCode} already belongs to a non-demo league.`);
  }

  return prisma.league.upsert({
    where: { inviteCode: input.inviteCode },
    update: { name: input.name },
    create: {
      name: input.name,
      inviteCode: input.inviteCode,
      createdById: input.createdById
    }
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    process.exit(1);
  });
