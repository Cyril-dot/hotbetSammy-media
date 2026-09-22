// ─────────────────────────────────────────────────────────────────────────────
// avatars.ts — profile picture fallback.
//
// We never have real uploaded profile photos, so instead of a generic person
// silhouette icon (or relying on the user's name initial, which looks broken
// whenever the name is missing/still loading) every account gets a fun emoji
// avatar. It's chosen deterministically from a seed (user id, or email as a
// fallback) so the same person always gets the same avatar rather than a new
// random one on every render/reload.
// ─────────────────────────────────────────────────────────────────────────────

export const AVATAR_EMOJIS = [
  "🦁", "🐯", "🐼", "🦊", "🐵", "🐶", "🐱", "🦉",
  "🐧", "🦄", "🐺", "🦅", "🐳", "🐨", "🦖", "🐙",
  "🐬", "🦈", "🐝", "🦋", "🐢", "🦩", "🦓", "🐲",
  "🦥", "🦦", "🐿️", "🦔", "🐴", "🦌", "🐹", "🦜",
];

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

/** Deterministic emoji avatar for a given seed (user id, email, or any stable identifier). */
export function emojiForSeed(seed: string): string {
  const clean = seed?.trim() || "guest";
  return AVATAR_EMOJIS[hashSeed(clean) % AVATAR_EMOJIS.length];
}

/** A genuinely random emoji avatar — use only when there is no stable identity to seed from at all. */
export function randomEmoji(): string {
  return AVATAR_EMOJIS[Math.floor(Math.random() * AVATAR_EMOJIS.length)];
}
