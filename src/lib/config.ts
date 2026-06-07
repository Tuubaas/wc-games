export const TOURNAMENT_ID = "world-cup-2026";
export const MATCH_LOCK_MINUTES = 30;
export const MATCH_POINTS = {
  outcome: 3,
  homeGoals: 1,
  awayGoals: 1,
  exactScore: 3
};
export const GROUP_PLACEMENT_POINTS = 1;
export const TOURNAMENT_PICK_POINTS = 5;

export function isSiteAdmin(email?: string | null) {
  if (!email) return false;
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}
