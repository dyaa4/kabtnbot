import { describe, it, expect } from 'vitest';
import { renderLobbyEmbed, lobbyButtons, renderLeaderboardEmbed, renderProfileEmbed } from './embeds.js';

const match = {
  _id: { toString: () => 'm1' },
  game: 'فالورانت',
  team_size: 2,
  balance_mode: 'balanced',
  players: ['111', '222'],
  status: 'lobby',
} as never;

describe('lobby rendering', () => {
  it('renders players and capacity', () => {
    const json = renderLobbyEmbed(match).toJSON();
    expect(json.title).toContain('فالورانت');
    expect(json.description).toContain('2/4');
    expect(json.description).toContain('<@111>');
  });

  it('builds three buttons carrying the match id', () => {
    const row = lobbyButtons('m1').toJSON();
    expect(row.components).toHaveLength(3);
    expect((row.components[0] as { custom_id: string }).custom_id).toBe('custom:join:m1');
  });
});

describe('leaderboard/profile rendering', () => {
  const player = {
    guild_id: 'g', user_id: '111', points: 40, wins: 2, losses: 1, last_played: new Date(),
  } as never;

  it('renders ranked rows with medals', () => {
    const json = renderLeaderboardEmbed([player]).toJSON();
    expect(json.description).toContain('🥇');
    expect(json.description).toContain('<@111>');
    expect(json.description).toContain('40');
  });

  it('renders empty leaderboard hint', () => {
    expect(renderLeaderboardEmbed([]).toJSON().description).toBeDefined();
  });

  it('renders profile with win rate', () => {
    const json = renderProfileEmbed('Player', player).toJSON();
    expect(JSON.stringify(json.fields)).toContain('67%'); // 2 of 3
  });
});
