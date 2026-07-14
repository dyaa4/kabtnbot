import mongoose, { Schema } from 'mongoose';
import type { GuildConfig } from '@gamebot/shared';

const guildConfigSchema = new Schema(
  {
    guild_id: { type: String, required: true, unique: true },
    config: { type: Object, required: true }, // validated by GuildConfigSchema in the repo layer
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

export interface UsageDoc {
  guild_id: string;
  date: string; // UTC YYYY-MM-DD
  listen_seconds: number;
  ai_questions: number;
  created_at: Date;
}

const usageSchema = new Schema<UsageDoc>(
  {
    guild_id: { type: String, required: true },
    date: { type: String, required: true },
    listen_seconds: { type: Number, default: 0 },
    ai_questions: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now, expires: '90d' },
  },
);
usageSchema.index({ guild_id: 1, date: 1 }, { unique: true });

export interface MemberSnapshotDoc {
  guild_id: string;
  date: string; // UTC YYYY-MM-DD
  member_count: number;
  created_at: Date;
}

const memberSnapshotSchema = new Schema<MemberSnapshotDoc>(
  {
    guild_id: { type: String, required: true },
    date: { type: String, required: true },
    member_count: { type: Number, required: true },
    created_at: { type: Date, default: Date.now, expires: '400d' },
  },
);
memberSnapshotSchema.index({ guild_id: 1, date: 1 }, { unique: true });

export interface ActivityDailyDoc {
  guild_id: string;
  user_id: string;
  date: string; // UTC YYYY-MM-DD
  messages: number;
  voice_seconds: number;
  reactions: number;
  created_at: Date;
}

const activityDailySchema = new Schema<ActivityDailyDoc>({
  guild_id: { type: String, required: true },
  user_id: { type: String, required: true },
  date: { type: String, required: true },
  messages: { type: Number, default: 0 },
  voice_seconds: { type: Number, default: 0 },
  reactions: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now, expires: '120d' },
});
activityDailySchema.index({ guild_id: 1, user_id: 1, date: 1 }, { unique: true });
activityDailySchema.index({ guild_id: 1, date: 1 });

export interface VoiceSessionDoc {
  guild_id: string;
  user_id: string;
  channel_id: string;
  joined_at: Date;
  left_at: Date | null;
  created_at: Date;
}

const voiceSessionSchema = new Schema<VoiceSessionDoc>({
  guild_id: { type: String, required: true },
  user_id: { type: String, required: true },
  channel_id: { type: String, required: true },
  joined_at: { type: Date, required: true },
  left_at: { type: Date, default: null },
  created_at: { type: Date, default: Date.now, expires: '90d' },
});
voiceSessionSchema.index({ guild_id: 1, joined_at: -1 });
voiceSessionSchema.index({ guild_id: 1, user_id: 1, left_at: 1 });

export const VoiceSessionModel =
  (mongoose.models.VoiceSession as mongoose.Model<VoiceSessionDoc>) ??
  mongoose.model<VoiceSessionDoc>('VoiceSession', voiceSessionSchema);

export interface KvDoc {
  key: string;
  value: string;
}

const kvSchema = new Schema<KvDoc>({
  key: { type: String, required: true, unique: true },
  value: { type: String, required: true },
});

export const KvModel = (mongoose.models.Kv as mongoose.Model<KvDoc>) ?? mongoose.model<KvDoc>('Kv', kvSchema);

// Per-USER premium: a user links their own guilds and premium features run on
// linked guilds. Free accounts may link 1 guild, premium accounts 3.
export interface UserAccountDoc {
  user_id: string;
  premium_active: boolean;
  linked_guild_ids: string[];
  updated_at: Date;
}

const userAccountSchema = new Schema<UserAccountDoc>({
  user_id: { type: String, required: true, unique: true },
  premium_active: { type: Boolean, default: false },
  linked_guild_ids: { type: [String], default: [] },
  updated_at: { type: Date, default: Date.now },
});
// "is this guild linked by anyone" is the hot premium-gate lookup.
userAccountSchema.index({ linked_guild_ids: 1 });

export const UserAccountModel =
  (mongoose.models.UserAccount as mongoose.Model<UserAccountDoc>) ??
  mongoose.model<UserAccountDoc>('UserAccount', userAccountSchema);

// Env-gated bot features, reported with each heartbeat so the dashboard can
// explain WHY a feature shows no data (e.g. chat log without ENABLE_CHAT_LOG).
export interface BotFeatures {
  chat_log: boolean;
  text_commands: boolean;
  text_protection: boolean;
  summary: boolean;
}

export interface BotStatusDoc {
  key: string; // singleton: 'bot'
  last_seen: Date;
  guild_count: number;
  features?: BotFeatures;
}

const botStatusSchema = new Schema<BotStatusDoc>({
  key: { type: String, required: true, unique: true },
  last_seen: { type: Date, required: true },
  guild_count: { type: Number, default: 0 },
  features: { type: Object, default: undefined },
});

export const BotStatusModel =
  (mongoose.models.BotStatus as mongoose.Model<BotStatusDoc>) ??
  mongoose.model<BotStatusDoc>('BotStatus', botStatusSchema);

export type GuildAssetKind = 'welcome_banner';

export interface GuildAssetDoc {
  guild_id: string;
  kind: GuildAssetKind;
  content_type: string;
  data: Buffer;
  created_at: Date;
  updated_at: Date;
}

const guildAssetSchema = new Schema<GuildAssetDoc>(
  {
    guild_id: { type: String, required: true },
    kind: { type: String, required: true },
    content_type: { type: String, required: true },
    data: { type: Buffer, required: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);
guildAssetSchema.index({ guild_id: 1, kind: 1 }, { unique: true });

export const GuildAssetModel =
  (mongoose.models.GuildAsset as mongoose.Model<GuildAssetDoc>) ??
  mongoose.model<GuildAssetDoc>('GuildAsset', guildAssetSchema);

export const ActivityDailyModel =
  (mongoose.models.ActivityDaily as mongoose.Model<ActivityDailyDoc>) ??
  mongoose.model<ActivityDailyDoc>('ActivityDaily', activityDailySchema);

export const GuildConfigModel =
  mongoose.models.GuildConfig ?? mongoose.model('GuildConfig', guildConfigSchema);
export const UsageModel =
  (mongoose.models.Usage as mongoose.Model<UsageDoc>) ??
  mongoose.model<UsageDoc>('Usage', usageSchema);
export const MemberSnapshotModel =
  (mongoose.models.MemberSnapshot as mongoose.Model<MemberSnapshotDoc>) ??
  mongoose.model<MemberSnapshotDoc>('MemberSnapshot', memberSnapshotSchema);

// Chat log (premium): recent channel messages with content, auto-deleted
// after 7 days (TTL) — mirrors the voice log's short-retention design.
export interface ChatMessageDoc {
  guild_id: string;
  user_id: string;
  channel_id: string;
  message_id: string;
  content: string;
  created_at: Date;
}

const chatMessageSchema = new Schema<ChatMessageDoc>({
  guild_id: { type: String, required: true },
  user_id: { type: String, required: true },
  channel_id: { type: String, required: true },
  message_id: { type: String, required: true },
  content: { type: String, required: true },
  created_at: { type: Date, default: Date.now, expires: '7d' },
});
chatMessageSchema.index({ guild_id: 1, created_at: -1 });

export const ChatMessageModel =
  (mongoose.models.ChatMessage as mongoose.Model<ChatMessageDoc>) ??
  mongoose.model<ChatMessageDoc>('ChatMessage', chatMessageSchema);

// Per-guild command-flow editor data (custom commands + built-in overrides),
// one doc per guild. The blob is validated by GuildCommandFlowsSchema in the
// repo layer, same split as GuildConfig.
export interface CommandFlowsDoc {
  guild_id: string;
  data: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

const commandFlowsSchema = new Schema<CommandFlowsDoc>(
  {
    guild_id: { type: String, required: true, unique: true },
    data: { type: Object, required: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

export const CommandFlowsModel =
  (mongoose.models.CommandFlows as mongoose.Model<CommandFlowsDoc>) ??
  mongoose.model<CommandFlowsDoc>('CommandFlows', commandFlowsSchema);

// Last-run bookkeeping for scheduled command flows, one doc per guild+flow.
// Persisted (not in-memory) so a bot redeploy can't reset long intervals.
export interface ScheduleRunDoc {
  guild_id: string;
  flow_id: string;
  last_run_at: Date;
}

const scheduleRunSchema = new Schema<ScheduleRunDoc>({
  guild_id: { type: String, required: true },
  flow_id: { type: String, required: true },
  last_run_at: { type: Date, required: true },
});
scheduleRunSchema.index({ guild_id: 1, flow_id: 1 }, { unique: true });

export const ScheduleRunModel =
  (mongoose.models.ScheduleRun as mongoose.Model<ScheduleRunDoc>) ??
  mongoose.model<ScheduleRunDoc>('ScheduleRun', scheduleRunSchema);

// Owner-facing directory of every guild the bot is in, plus a block flag the
// super-admin panel toggles (a blocked guild is left and refused on rejoin).
export interface GuildDirectoryDoc {
  guild_id: string;
  name: string;
  member_count: number;
  blocked: boolean;
  joined_at: Date;
  left_at: Date | null;
}

const guildDirectorySchema = new Schema<GuildDirectoryDoc>({
  guild_id: { type: String, required: true, unique: true },
  name: { type: String, default: '' },
  member_count: { type: Number, default: 0 },
  blocked: { type: Boolean, default: false },
  joined_at: { type: Date, default: Date.now },
  left_at: { type: Date, default: null },
});

export const GuildDirectoryModel =
  (mongoose.models.GuildDirectory as mongoose.Model<GuildDirectoryDoc>) ??
  mongoose.model<GuildDirectoryDoc>('GuildDirectory', guildDirectorySchema);

export type { GuildConfig };
