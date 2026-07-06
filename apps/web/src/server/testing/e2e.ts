import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb } from '@gamebot/db';
import type { Express } from 'express';
import { buildApp } from '../app.js';
import { FakeDiscordRest } from './fake-rest.js';
import { clearAccessCache } from '../guild-access.js';

/**
 * End-to-end harness for backend journeys: a real Express app (real routing,
 * middleware, auth guards and error handling) on top of a real in-memory
 * MongoDB, with Discord faked. Auth is exercised through the genuine OAuth
 * callback rather than a signed-cookie shortcut, so a journey covers the
 * whole stack from login to persistence.
 */

const MANAGE_GUILD = String(1 << 5);

let mongod: MongoMemoryServer | undefined;

/** Call in beforeAll — boots a shared in-memory MongoDB and connects to it. */
export async function startDb(): Promise<void> {
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri());
}

/** Call in afterAll — disconnects and stops the in-memory MongoDB. */
export async function stopDb(): Promise<void> {
  await disconnectDb();
  await mongod?.stop();
  mongod = undefined;
}

export interface ScenarioOptions {
  /** OAuth access token the fake Discord issues; the whole scenario keys off it. */
  token?: string;
  /** The signed-in user. */
  user?: { id: string; username: string; avatar: string | null };
  /** Guilds visible to the user; permissions default to Manage Guild (admin). */
  guilds?: { id: string; name: string; icon?: string | null; permissions?: string; botPresent?: boolean }[];
}

export interface Scenario {
  app: Express;
  rest: FakeDiscordRest;
  token: string;
  user: { id: string; username: string; avatar: string | null };
}

/**
 * Build an app + pre-seeded fake Discord for a signed-in admin over one guild.
 * Defaults give a manageable guild "g1" the bot is a member of.
 */
export function scenario(opts: ScenarioOptions = {}): Scenario {
  clearAccessCache();
  const token = opts.token ?? 'at-e2e';
  const user = opts.user ?? { id: 'u1', username: 'dyaak', avatar: null };
  const guilds = opts.guilds ?? [{ id: 'g1', name: 'ARAB GAMERS', permissions: MANAGE_GUILD, botPresent: true }];

  const rest = new FakeDiscordRest();
  // The OAuth callback exchanges the code for this token; getMe(token) and
  // getMyGuilds(token) then key off it.
  rest.exchangeToken = token;
  rest.users.set(token, user);
  rest.userGuilds.set(
    token,
    guilds.map((g) => ({ id: g.id, name: g.name, icon: g.icon ?? null, permissions: g.permissions ?? MANAGE_GUILD })),
  );
  for (const g of guilds) {
    if (g.botPresent !== false) rest.botGuilds.add(g.id);
    rest.guildNames.set(g.id, g.name);
  }

  return { app: buildApp({ rest }), rest, token, user };
}

export type Agent = ReturnType<typeof request.agent>;

/**
 * Drive the real Discord OAuth flow end-to-end and return a cookie-persisting
 * agent that is authenticated for subsequent requests:
 *   GET /auth/discord  -> issues the gb_state cookie + redirect carrying state
 *   GET /auth/callback -> validates state, exchanges the code, sets gb_session
 * FakeDiscordRest.exchangeCode always returns the scenario token, so the
 * resulting session encrypts exactly that token and guild access resolves.
 */
export async function login(app: Express): Promise<Agent> {
  const agent = request.agent(app);
  const start = await agent.get('/auth/discord');
  if (start.status !== 302) throw new Error(`/auth/discord expected 302, got ${start.status}`);
  const state = new URL(start.headers.location).searchParams.get('state');
  if (!state) throw new Error('no state in authorize redirect');

  const cb = await agent.get(`/auth/callback?code=any-code&state=${state}`);
  if (cb.status !== 302 || cb.headers.location !== '/app') {
    throw new Error(`/auth/callback expected 302 -> /app, got ${cb.status} -> ${cb.headers.location}`);
  }
  return agent;
}
