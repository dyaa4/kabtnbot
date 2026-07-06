import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Client } from 'discord.js';
import { registerClientErrorLogging, registerProcessSafetyNets, type ProcessLike } from './resilience.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('registerClientErrorLogging', () => {
  it('consumes client error/shardError events instead of letting them crash', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = new EventEmitter() as unknown as Client;
    registerClientErrorLogging(client);

    // Without a listener, EventEmitter 'error' THROWS — this must not.
    expect(() => (client as unknown as EventEmitter).emit('error', new Error('gateway'))).not.toThrow();
    (client as unknown as EventEmitter).emit('shardError', new Error('shard'));
    (client as unknown as EventEmitter).emit('warn', 'heads up');

    expect(errorSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

describe('registerProcessSafetyNets', () => {
  it('logs unhandled rejections without exiting, exits 1 on uncaught exceptions', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const emitter = new EventEmitter();
    const exit = vi.fn();
    const proc = {
      on: emitter.on.bind(emitter),
      exit,
    } as unknown as ProcessLike;

    registerProcessSafetyNets(proc);

    emitter.emit('unhandledRejection', new Error('missed catch'));
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();

    emitter.emit('uncaughtException', new Error('boom'));
    expect(exit).toHaveBeenCalledWith(1);
  });
});
