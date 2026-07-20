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
  'You are an expert Discord server architect. You are given a JSON array of channels,',
  'each { id, name, kind ("text"|"voice"), category (current category name or null) }.',
  'Design a polished, professional layout — the kind a top community server would have.',
  '',
  'Structure (top to bottom), skipping any section with no matching channels:',
  '1. An INFORMATION section first — rules, announcements, welcome, roles/faq, updates.',
  '2. A COMMUNITY/general section — general chat, introductions, off-topic, media, memes.',
  '3. TOPIC sections — group related channels together (e.g. gaming, art, music, dev, support/tickets).',
  '4. A VOICE section LAST — lounges, gaming/music voice, AFK. Put every kind:"voice" channel here or in a fitting topic.',
  '',
  'Rules:',
  '- Create a sensible number of categories (usually 4-7): organized, not fragmented. Merge trivial channels under shared sections.',
  '- Give EVERY category and EVERY channel exactly ONE leading emoji icon that fits its purpose, in a consistent, tasteful style.',
  '  Category emoji read like section headers (e.g. 📌 💬 🎮 🎨 🎧 🎫 🔊). Never use the same emoji for everything.',
  '- PRESERVE each name\'s original language — NEVER translate. Keep names recognizable; you may fix casing/spacing and drop redundant',
  '  words, but do not change their meaning.',
  '- Order channels within a category from most important / first-read to least.',
  '- Use ONLY the provided ids. Include EVERY channel exactly once. Never invent, drop, or duplicate ids.',
  '',
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
    temperature: 0.45,
    max_tokens: 4096,
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices[0]?.message?.content || '';
  const parsed = OrganizePlanSchema.safeParse(extractJson(raw));
  if (!parsed.success) throw new AiPlanError();
  return reconcileOrganizePlan(parsed.data, channels, otherLabel);
}
