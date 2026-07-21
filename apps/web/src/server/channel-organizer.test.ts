import { describe, it, expect } from 'vitest';
import { extractJson, AiPlanError } from './channel-organizer.js';

describe('extractJson (defensive LLM output parsing)', () => {
  it('parses plain minified JSON', () => {
    expect(extractJson('{"categories":[]}')).toEqual({ categories: [] });
  });

  it('strips ```json code fences', () => {
    expect(extractJson('```json\n{"categories":[{"name":"x","channels":[]}]}\n```')).toEqual({
      categories: [{ name: 'x', channels: [] }],
    });
  });

  it('grabs the first {...} block out of surrounding prose', () => {
    expect(extractJson('Sure! Here you go:\n{"categories":[]}\nHope that helps.')).toEqual({ categories: [] });
  });

  it('throws AiPlanError when there is no JSON object', () => {
    expect(() => extractJson('I could not produce a layout.')).toThrow(AiPlanError);
  });

  it('throws AiPlanError on a malformed JSON block (never leaks a raw SyntaxError)', () => {
    expect(() => extractJson('{"categories": [ }')).toThrow(AiPlanError);
    expect(() => extractJson('')).toThrow(AiPlanError);
  });
});
