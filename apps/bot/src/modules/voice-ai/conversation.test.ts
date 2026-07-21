import { describe, expect, it } from 'vitest';
import { Conversation } from './conversation.js';

const T = 6000; // 6s idle timeout

describe('Conversation — active-user lock', () => {
  it('the first wake word engages that user; only they are active', () => {
    const c = new Conversation(T);
    expect(c.onWakeWord('a')).toBe('engaged');
    expect(c.activeUser).toBe('a');
    expect(c.phase).toBe('listening');
    expect(c.isActive('a')).toBe(true);
    expect(c.isActive('b')).toBe(false);
  });

  it('a wake word from someone else is queued, never an instant takeover', () => {
    const c = new Conversation(T);
    c.onWakeWord('a');
    expect(c.onWakeWord('b')).toBe('queued');
    expect(c.activeUser).toBe('a'); // unchanged
    expect(c.queued).toEqual(['b']);
    expect(c.onWakeWord('b')).toBe('queued'); // not duplicated
    expect(c.queued).toEqual(['b']);
  });

  it('the active user re-saying the wake word stays active (disarms the timer)', () => {
    const c = new Conversation(T);
    c.onWakeWord('a');
    c.onResponseEnd(1000); // timer armed
    expect(c.idleDeadline).toBe(1000 + T);
    expect(c.onWakeWord('a')).toBe('already-active');
    expect(c.idleDeadline).toBeNull();
  });
});

describe('Conversation — phases', () => {
  it('walks idle → listening → thinking → speaking → listening', () => {
    const c = new Conversation(T);
    expect(c.phase).toBe('idle');
    c.onWakeWord('a');
    expect(c.phase).toBe('listening');
    c.onActiveUtterance();
    expect(c.phase).toBe('thinking');
    c.onResponseStart();
    expect(c.phase).toBe('speaking');
    c.onResponseEnd(0);
    expect(c.phase).toBe('listening');
  });
});

describe('Conversation — dynamic timeout', () => {
  it('arms only after an answer, not while listening/thinking/speaking', () => {
    const c = new Conversation(T);
    c.onWakeWord('a');
    expect(c.idleDeadline).toBeNull(); // listening, no timer
    c.onActiveUtterance();
    expect(c.idleDeadline).toBeNull(); // thinking
    c.onResponseStart();
    expect(c.idleDeadline).toBeNull(); // speaking
    c.onResponseEnd(1000);
    expect(c.idleDeadline).toBe(1000 + T); // armed now
  });

  it('active-user speech resets the timer', () => {
    const c = new Conversation(T);
    c.onWakeWord('a');
    c.onResponseEnd(1000);
    c.onActiveSpeech(3000);
    expect(c.idleDeadline).toBe(3000 + T);
  });

  it('does not end before the timeout, ends exactly at it', () => {
    const c = new Conversation(T);
    c.onWakeWord('a');
    c.onResponseEnd(1000);
    expect(c.tick(1000 + T - 1)).toEqual({ ended: null, promoted: null });
    expect(c.activeUser).toBe('a');
    expect(c.tick(1000 + T)).toEqual({ ended: 'a', promoted: null });
    expect(c.activeUser).toBeNull();
    expect(c.phase).toBe('idle');
  });
});

describe('Conversation — queue handoff', () => {
  it('promotes the next queued user when the conversation ends', () => {
    const c = new Conversation(T);
    c.onWakeWord('a');
    c.onWakeWord('b');
    c.onWakeWord('c');
    c.onResponseEnd(1000);
    const r = c.tick(1000 + T);
    expect(r).toEqual({ ended: 'a', promoted: 'b' });
    expect(c.activeUser).toBe('b');
    expect(c.queued).toEqual(['c']);
    expect(c.phase).toBe('listening');
  });

  it('a leaving active user hands off immediately; a leaving queued user is just removed', () => {
    const c = new Conversation(T);
    c.onWakeWord('a');
    c.onWakeWord('b');
    c.onWakeWord('c');
    // queued user leaves
    expect(c.onUserLeft('c', 500)).toEqual({ ended: null, promoted: null });
    expect(c.queued).toEqual(['b']);
    // active user leaves → promote b
    expect(c.onUserLeft('a', 500)).toEqual({ ended: 'a', promoted: 'b' });
    expect(c.activeUser).toBe('b');
  });

  it('ends to idle when the queue is empty', () => {
    const c = new Conversation(T);
    c.onWakeWord('a');
    expect(c.end(0)).toEqual({ ended: 'a', promoted: null });
    expect(c.activeUser).toBeNull();
    expect(c.phase).toBe('idle');
  });
});

describe('Conversation — timeout disabled (0)', () => {
  it('is single-shot when the timeout is 0: the conversation ends right after each answer', () => {
    const c = new Conversation(0);
    c.onWakeWord('a');
    c.onResponseEnd(1000);
    expect(c.idleDeadline).toBe(1000); // no lingering window
    expect(c.tick(1000)).toEqual({ ended: 'a', promoted: null });
    expect(c.activeUser).toBeNull(); // back to needing the wake word every time
  });
});
