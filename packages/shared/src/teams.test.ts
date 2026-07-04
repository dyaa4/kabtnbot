import { describe, it, expect } from 'vitest';
import { splitTeams } from './teams.js';

const rng = () => 0.5; // deterministic shuffle

describe('splitTeams', () => {
  it('balanced mode snake-distributes by points (A B B A A B)', () => {
    const players = [
      { userId: 'u1', points: 100 },
      { userId: 'u2', points: 80 },
      { userId: 'u3', points: 60 },
      { userId: 'u4', points: 40 },
    ];
    const { teamA, teamB } = splitTeams(players, 'balanced', rng);
    const sum = (t: string[]) =>
      t.reduce((s, id) => s + players.find((p) => p.userId === id)!.points, 0);
    expect(sum(teamA)).toBe(sum(teamB)); // 100+40 === 80+60
    expect(teamA).toHaveLength(2);
    expect(teamB).toHaveLength(2);
  });

  it('random mode alternates and covers everyone with size diff <= 1', () => {
    const players = Array.from({ length: 7 }, (_, i) => ({ userId: `u${i}`, points: 0 }));
    const { teamA, teamB } = splitTeams(players, 'random', rng);
    expect(teamA.length + teamB.length).toBe(7);
    expect(Math.abs(teamA.length - teamB.length)).toBe(1);
    expect(new Set([...teamA, ...teamB]).size).toBe(7);
  });

  it('handles empty input', () => {
    expect(splitTeams([], 'random', rng)).toEqual({ teamA: [], teamB: [] });
  });
});
