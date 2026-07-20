import { describe, it, expect } from 'vitest';
import { fillMember } from './executor.js';

describe('fillMember', () => {
  it('replaces every {member} with the display name', () => {
    expect(fillMember('hi {member}, welcome {member}', 'Sara')).toBe('hi Sara, welcome Sara');
  });

  it('inserts a name containing $ replacement patterns verbatim (not as regex substitution)', () => {
    // String.replaceAll(str, str) would treat these specially and garble the DM.
    expect(fillMember('yo {member}', 'Fo$&o')).toBe('yo Fo$&o');
    expect(fillMember('yo {member}', '$1$2$$')).toBe('yo $1$2$$');
    expect(fillMember('{member}', "a$'b$`c")).toBe("a$'b$`c");
  });

  it('leaves text without the placeholder untouched', () => {
    expect(fillMember('no placeholder here', 'Sara')).toBe('no placeholder here');
  });
});
