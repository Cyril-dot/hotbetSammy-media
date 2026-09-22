// Shared admin-match crest catalog. The same team name and side always resolve
// to the same crest for every user, browser, homepage, sportsbook, and details page.
export const HOME_ADMIN_CRESTS = Array.from({ length: 20 }, (_, index) =>
  `/admin-logos/team-home-${String(index + 1).padStart(2, "0")}.png`,
) as readonly string[];

export const AWAY_ADMIN_CRESTS = Array.from({ length: 20 }, (_, index) =>
  `/admin-logos/team-away-${String(index + 1).padStart(2, "0")}.png`,
) as readonly string[];

export const DEFAULT_ADMIN_CREST = HOME_ADMIN_CRESTS[0];

export function adminCrestFor(team: unknown, side: "home" | "away", salt = ""): string {
  const value = String(team ?? "").trim().toLowerCase();
  if (!value) return side === "home" ? DEFAULT_ADMIN_CREST : AWAY_ADMIN_CRESTS[0];
  let hash = 0;
  const key = `${value}:${salt}`;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  const catalog = side === "home" ? HOME_ADMIN_CRESTS : AWAY_ADMIN_CRESTS;
  return catalog[hash % catalog.length];
}
