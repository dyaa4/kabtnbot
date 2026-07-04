import type { BalanceMode } from './guild-config.js';

export interface RankedPlayer {
  userId: string;
  points: number;
}

/**
 * Split players into two teams.
 * - random: Fisher-Yates shuffle, then alternate A/B.
 * - balanced: shuffle (tie-break), sort by points desc, snake distribution
 *   (A B B A A B ...) so team point totals stay close.
 */
export function splitTeams(
  players: RankedPlayer[],
  mode: BalanceMode,
  rng: () => number = Math.random,
): { teamA: string[]; teamB: string[] } {
  const pool = [...players];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  if (mode === 'balanced') pool.sort((a, b) => b.points - a.points);

  const teamA: string[] = [];
  const teamB: string[] = [];
  pool.forEach((p, i) => {
    const toA = mode === 'balanced' ? Math.floor((i + 1) / 2) % 2 === 0 : i % 2 === 0;
    (toA ? teamA : teamB).push(p.userId);
  });
  return { teamA, teamB };
}
