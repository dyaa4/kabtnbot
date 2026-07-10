// XP / leveling curve (MEE6-style). XP is stored cumulatively per member; the
// level is derived from it, so the curve here is the single source of truth.

/** XP required to advance FROM `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return 5 * level * level + 50 * level + 100;
}

/** Total cumulative XP needed to REACH `level` (level 0 = 0 XP). */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let l = 0; l < level; l++) total += xpToNext(l);
  return total;
}

/** Highest fully-reached level for a given cumulative XP. */
export function levelFromXp(xp: number): number {
  let level = 0;
  while (xp >= totalXpForLevel(level + 1)) level++;
  return level;
}

/** Level plus progress within it: how far into the level and how much it needs. */
export function levelProgress(xp: number): { level: number; intoLevel: number; neededForNext: number } {
  const level = levelFromXp(xp);
  const base = totalXpForLevel(level);
  return { level, intoLevel: xp - base, neededForNext: xpToNext(level) };
}
