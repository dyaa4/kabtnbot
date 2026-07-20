import Groq from 'groq-sdk';
import {
  ORGANIZABLE_TYPES,
  CATEGORY_TYPE,
  OrganizePlanSchema,
  reconcileOrganizePlan,
  isVoiceType,
  type GuildChannelLite,
  type OrganizePlan,
} from '@gamebot/shared';
import { config } from './config.js';

// Thrown when the model returns something we can't turn into a valid plan — the
// route maps it to a friendly 502 so the user just retries.
export class AiPlanError extends Error {
  constructor() {
    super('AI_BAD_OUTPUT');
  }
}

let groq: Groq | null = null;
function client(): Groq {
  return (groq ??= new Groq({ apiKey: config.GROQ_API_KEY }));
}

export function isOrganizerConfigured(): boolean {
  return Boolean(config.GROQ_API_KEY);
}

// Defensive extraction: strip code fences, grab the first {...} block, JSON.parse.
// Mirrors the bot's intent parser — never trust the model to return clean JSON.
function extractJson(raw: string): unknown {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new AiPlanError();
  try {
    return JSON.parse(match[0]);
  } catch {
    throw new AiPlanError();
  }
}

const SYSTEM_PROMPT = [
  'You reorganize a Discord server. You are given a JSON array of channels, each',
  '{ id, name, kind ("text"|"voice"), category (current category name or null) }.',
  'Produce a clean, logical layout grouped into a SMALL number of categories (aim 3-7).',
  'Hard rules:',
  '- PRESERVE the original language of every name. DO NOT translate anything.',
  '- Add exactly ONE leading emoji as an icon to every category name AND every channel name,',
  '  chosen to fit its purpose. Keep the rest of the name recognizable (light tidy-up only).',
  '- Put voice channels (kind:"voice") in fitting categories too.',
  '- Use ONLY the provided ids. Include EVERY channel exactly once, never invent ids.',
  '- Order sensibly: info/rules/announcements first, then general chat, then topic channels, then voice.',
  'Reply with ONLY minified JSON, no prose, in this exact shape:',
  '{"categories":[{"name":"<emoji + category>","channels":[{"id":"<id>","name":"<emoji + name>"}]}]}',
].join('\n');

/**
 * Ask the model for a tidy layout, then harden it against the real guild
 * (existing ids only, every channel placed once) via reconcileOrganizePlan.
 * Preview only — performs no Discord writes.
 */
export async function generateOrganizePlan(
  channels: GuildChannelLite[],
  otherLabel: string,
): Promise<OrganizePlan> {
  const catNames = new Map(channels.filter((c) => c.type === CATEGORY_TYPE).map((c) => [c.id, c.name]));
  const organizable = channels.filter((c) => (ORGANIZABLE_TYPES as readonly number[]).includes(c.type));
  const input = organizable.map((c) => ({
    id: c.id,
    name: c.name,
    kind: isVoiceType(c.type) ? 'voice' : 'text',
    category: c.parent_id ? catNames.get(c.parent_id) ?? null : null,
  }));

  const completion = await client().chat.completions.create({
    model: config.GROQ_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(input) },
    ],
    temperature: 0.3,
    max_tokens: 4096,
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices[0]?.message?.content || '';
  const parsed = OrganizePlanSchema.safeParse(extractJson(raw));
  if (!parsed.success) throw new AiPlanError();
  return reconcileOrganizePlan(parsed.data, channels, otherLabel);
}
