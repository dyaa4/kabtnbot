import { describe, it, expect } from 'vitest';
import { renderLobbyEmbed, lobbyButtons } from './embeds.js';

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
