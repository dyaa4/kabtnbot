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

export type { GuildConfig };
