import { describe, expect, it } from 'vitest';
import { healthResult } from './health.js';

describe('healthResult', () => {
  it('reports 200 + ok:true when healthy', () => {
    const { code, body } = healthResult(true);
    expect(code).toBe(200);
    expect(JSON.parse(body).ok).toBe(true);
  });

  it('reports 503 + ok:false when unhealthy', () => {
    const { code, body } = healthResult(false);
    expect(code).toBe(503);
    expect(JSON.parse(body).ok).toBe(false);
  });
});
