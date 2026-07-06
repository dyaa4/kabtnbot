import type { Client } from 'discord.js';

/**
 * A discord.js Client is an EventEmitter: an 'error' event with no listener
 * throws and kills the process. Gateway hiccups emit these routinely on a
 * long-running bot, so log them instead of dying.
 */
export function registerClientErrorLogging(client: Client): void {
  client.on('error', (err) => console.error('[Client]', err));
  client.on('shardError', (err) => console.error('[Shard]', err));
  client.on('warn', (msg) => console.warn('[Client]', msg));
}

export interface ProcessLike {
  on(event: string, listener: (arg: unknown) => void): unknown;
  exit(code: number): void;
}

/**
 * Node ≥15 terminates on unhandled promise rejections — one missed .catch
 * anywhere must not take down the bot; log and keep running. An uncaught
 * exception leaves undefined state: log it and exit non-zero so the
 * supervisor (docker/systemd/pm2) restarts a clean process.
 */
export function registerProcessSafetyNets(proc: ProcessLike = process): void {
  proc.on('unhandledRejection', (reason: unknown) => {
    console.error('[UnhandledRejection]', reason);
  });
  proc.on('uncaughtException', (err: unknown) => {
    console.error('[UncaughtException]', err);
    proc.exit(1);
  });
}
