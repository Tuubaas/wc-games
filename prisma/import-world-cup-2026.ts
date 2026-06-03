import { loadEnvConfig } from "@next/env";
import { MatchStage, MatchStatus, PrismaClient } from "@prisma/client";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

loadEnvConfig(process.cwd());

const MATCHES_URL =
  "https://api.fifa.com/api/v3/calendar/matches?language=en&count=500&idCompetition=17&idSeason=285023";
const TEAMS_URL =
  "https://cxm-api.fifa.com/fifaplusweb/api/sections/teamsModule/4v5Yng3VdGD9c1cpnOIff1?locale=en&skip=";
const SQUADS_PDF_URL = "https://fdp.fifa.org/assetspublic/ce281/pdf/SquadLists-English.pdf";
const USER_AGENT = "wc-games/1.0 production-data-import";
const execFileAsync = promisify(execFile);

type LocaleText = Array<{ Locale?: string; Description?: string }>;

type FifaTeam = {
  teamName: string;
  teamFlag?: string;
};

type FifaTeamsPayload = {
  teams?: FifaTeam[];
};

type FifaMatchTeam = {
  Abbreviation?: string;
};

type FifaMatch = {
  MatchNumber: number;
  Date: string;
  StageName?: LocaleText;
  GroupName?: LocaleText;
  Home?: FifaMatchTeam | null;
  Away?: FifaMatchTeam | null;
};

type FifaMatchesPayload = {
  Results?: FifaMatch[];
};

type TeamSeed = {
  name: string;
  fifaCode: string;
};

type MatchSeed = {
  matchNumber: number;
  stage: MatchStage;
  groupName?: string;
  kickoffAt: Date;
  homeCode?: string;
  awayCode?: string;
};

type PlayerSeed = {
  teamCode: string;
  name: string;
  position: string;
};

const dryRun = process.argv.includes("--dry-run");

const positionLabels: Record<string, string> = {
  DF: "Defender",
  FW: "Forward",
  GK: "Goalkeeper",
  MF: "Midfielder"
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function text(value?: LocaleText) {
  return value?.find((item) => item.Locale === "en-GB")?.Description ?? value?.[0]?.Description ?? "";
}

function teamCodeFromFlag(team: FifaTeam) {
  const code = team.teamFlag?.split("/").at(-1)?.trim().toUpperCase();
  if (!code || !/^[A-Z]{3}$/.test(code)) {
    throw new Error(`Could not determine FIFA code for ${team.teamName}.`);
  }
  return code;
}

function mapStage(stageName: string, matchNumber: number) {
  const normalized = stageName.toLowerCase();
  if (normalized.includes("round of 32")) return MatchStage.ROUND_OF_32;
  if (normalized.includes("round of 16")) return MatchStage.ROUND_OF_16;
  if (normalized.includes("quarter")) return MatchStage.QUARTER_FINAL;
  if (normalized.includes("semi")) return MatchStage.SEMI_FINAL;
  if (normalized.includes("third") || matchNumber === 103) return MatchStage.THIRD_PLACE;
  if (normalized.includes("final") || matchNumber === 104) return MatchStage.FINAL;
  return MatchStage.GROUP;
}

function groupCode(groupName: string) {
  const match = groupName.match(/^Group\s+([A-L])$/i);
  return match?.[1].toUpperCase();
}

async function getOfficialTeams(): Promise<TeamSeed[]> {
  const teams: TeamSeed[] = [];
  const seen = new Set<string>();

  for (let skip = 0; skip < 48; skip += 8) {
    const payload = await fetchJson<FifaTeamsPayload>(`${TEAMS_URL}${skip}`);
    for (const team of payload.teams ?? []) {
      const fifaCode = teamCodeFromFlag(team);
      if (seen.has(fifaCode)) continue;
      seen.add(fifaCode);
      teams.push({ fifaCode, name: team.teamName });
    }
  }

  if (teams.length !== 48) {
    throw new Error(`Expected 48 teams from FIFA, got ${teams.length}.`);
  }

  return teams.sort((a, b) => a.name.localeCompare(b.name));
}

async function getOfficialMatches(): Promise<MatchSeed[]> {
  const payload = await fetchJson<FifaMatchesPayload>(MATCHES_URL);
  const matches = (payload.Results ?? []).map((match) => {
    const stageName = text(match.StageName);
    const groupName = groupCode(text(match.GroupName));

    return {
      matchNumber: match.MatchNumber,
      stage: mapStage(stageName, match.MatchNumber),
      groupName,
      kickoffAt: new Date(match.Date),
      homeCode: match.Home?.Abbreviation,
      awayCode: match.Away?.Abbreviation
    };
  });

  if (matches.length !== 104) {
    throw new Error(`Expected 104 matches from FIFA, got ${matches.length}.`);
  }

  return matches.sort((a, b) => a.matchNumber - b.matchNumber);
}

function toDisplayCase(value: string) {
  return value
    .toLocaleLowerCase("en")
    .replace(/(^|[\s'-])(\p{L})/gu, (_match, prefix: string, char: string) => {
      return `${prefix}${char.toLocaleUpperCase("en")}`;
    });
}

function formatPlayerName(playerName: string) {
  const trimmedName = playerName.trim();
  const tokens = trimmedName.split(/\s+/);
  const givenNameStart = tokens.findIndex((token) => token !== token.toLocaleUpperCase("en"));

  if (givenNameStart <= 0) {
    return trimmedName;
  }

  const familyName = toDisplayCase(tokens.slice(0, givenNameStart).join(" "));
  const givenNames = tokens.slice(givenNameStart).join(" ");

  return `${givenNames} ${familyName}`;
}

function parseSquadPdfText(pdfText: string): PlayerSeed[] {
  const players: PlayerSeed[] = [];
  const teamCodes = new Set<string>();

  for (const page of pdfText.split("\f")) {
    const lines = page.split(/\r?\n/);
    const teamMatch = lines
      .map((line) => line.trim().match(/^(.+)\s+\(([A-Z]{3})\)$/))
      .find((match): match is RegExpMatchArray => Boolean(match));

    if (!teamMatch) continue;

    const teamCode = teamMatch[2];
    const playerRows = lines.filter((line) => /^\s*\d{1,2}\s+(GK|DF|MF|FW)\s+/.test(line));
    teamCodes.add(teamCode);

    if (playerRows.length !== 26) {
      throw new Error(`Expected 26 players for ${teamCode}, got ${playerRows.length}.`);
    }

    for (const row of playerRows) {
      const columns = row.trim().split(/\s{2,}/);
      if (columns.length !== 9) {
        throw new Error(`Could not parse player row for ${teamCode}: ${row}`);
      }

      const [, positionCode, playerName] = columns;
      players.push({
        teamCode,
        name: formatPlayerName(playerName),
        position: positionLabels[positionCode] ?? positionCode
      });
    }
  }

  if (teamCodes.size !== 48) {
    throw new Error(`Expected squads for 48 teams from FIFA, got ${teamCodes.size}.`);
  }

  if (players.length !== 1248) {
    throw new Error(`Expected 1,248 players from FIFA, got ${players.length}.`);
  }

  return players.sort((a, b) => {
    return a.teamCode.localeCompare(b.teamCode) || a.name.localeCompare(b.name);
  });
}

async function getOfficialPlayers(): Promise<PlayerSeed[]> {
  const tempDir = await mkdtemp(join(tmpdir(), "wc-games-squads-"));
  const pdfPath = join(tempDir, "squads.pdf");
  const textPath = join(tempDir, "squads.txt");

  try {
    await writeFile(pdfPath, await fetchBuffer(SQUADS_PDF_URL));
    await execFileAsync("pdftotext", ["-layout", pdfPath, textPath]);
    return parseSquadPdfText(await readFile(textPath, "utf8"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error("pdftotext is required to import FIFA squad players. Install poppler and retry.");
    }
    throw error;
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

async function importData(teams: TeamSeed[], matches: MatchSeed[], players: PlayerSeed[]) {
  const prisma = new PrismaClient();

  try {
    for (const team of teams) {
      await prisma.team.upsert({
        where: { fifaCode: team.fifaCode },
        update: { name: team.name },
        create: team
      });
    }

    const dbTeams = await prisma.team.findMany({
      where: { fifaCode: { in: teams.map((team) => team.fifaCode) } }
    });
    const teamByCode = new Map(dbTeams.map((team) => [team.fifaCode, team]));

    for (const match of matches) {
      const homeTeam = match.homeCode ? teamByCode.get(match.homeCode) : null;
      const awayTeam = match.awayCode ? teamByCode.get(match.awayCode) : null;
      const matchData = {
        stage: match.stage,
        groupName: match.groupName,
        kickoffAt: match.kickoffAt,
        homeTeamId: homeTeam?.id,
        awayTeamId: awayTeam?.id
      };

      await prisma.match.upsert({
        where: { matchNumber: match.matchNumber },
        update: matchData,
        create: {
          matchNumber: match.matchNumber,
          ...matchData,
          status: MatchStatus.SCHEDULED
        }
      });
    }

    for (const player of players) {
      const team = teamByCode.get(player.teamCode);
      if (!team) {
        throw new Error(`Could not find team ${player.teamCode} for ${player.name}.`);
      }

      await prisma.player.upsert({
        where: {
          teamId_name: {
            teamId: team.id,
            name: player.name
          }
        },
        update: { position: player.position },
        create: {
          name: player.name,
          position: player.position,
          teamId: team.id
        }
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const [teams, matches, players] = await Promise.all([
    getOfficialTeams(),
    getOfficialMatches(),
    getOfficialPlayers()
  ]);

  console.log(`FIFA data ready: ${teams.length} teams, ${matches.length} matches, ${players.length} players.`);
  console.log(`First match: #${matches[0]?.matchNumber} at ${matches[0]?.kickoffAt.toISOString()}`);
  console.log(`Last match: #${matches.at(-1)?.matchNumber} at ${matches.at(-1)?.kickoffAt.toISOString()}`);

  if (dryRun) {
    console.log("Dry run only. No database changes made.");
    return;
  }

  await importData(teams, matches, players);
  console.log("Import complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
