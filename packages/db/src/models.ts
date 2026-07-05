import mongoose, { Schema } from 'mongoose';
import type { GuildConfig, MatchStatus, BalanceMode, TeamKey } from '@gamebot/shared';

const guildConfigSchema = new Schema(
  {
    guild_id: { type: String, required: true, unique: true },
    config: { type: Object, required: true }, // validated by GuildConfigSchema in the repo layer
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

export interface PlayerDoc {
  guild_id: string;
  user_id: string;
  points: number;
  wins: number;
  losses: number;
  last_played: Date | null;
}

const playerSchema = new Schema<PlayerDoc>(
  {
    guild_id: { type: String, required: true },
    user_id: { type: String, required: true },
    points: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    last_played: { type: Date, default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);
playerSchema.index({ guild_id: 1, user_id: 1 }, { unique: true });
playerSchema.index({ guild_id: 1, points: -1 });

export interface MatchDoc {
  _id: mongoose.Types.ObjectId;
  guild_id: string;
  creator_id: string;
  game: string;
  team_size: number;
  balance_mode: BalanceMode;
  status: MatchStatus;
  players: string[];
  team_a: string[];
  team_b: string[];
  winner: TeamKey | null;
  lobby_channel_id: string;
  lobby_message_id: string | null;
  temp_channel_ids: string[];
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}

const matchSchema = new Schema<MatchDoc>(
  {
    guild_id: { type: String, required: true },
    creator_id: { type: String, required: true },
    game: { type: String, required: true },
    team_size: { type: Number, required: true, min: 1, max: 10 },
    balance_mode: { type: String, enum: ['random', 'balanced'], required: true },
    status: {
      type: String,
      enum: ['lobby', 'in_progress', 'completed', 'cancelled'],
      default: 'lobby',
    },
    players: { type: [String], default: [] },
    team_a: { type: [String], default: [] },
    team_b: { type: [String], default: [] },
    winner: { type: String, enum: ['a', 'b', null], default: null },
    lobby_channel_id: { type: String, required: true },
    lobby_message_id: { type: String, default: null },
    temp_channel_ids: { type: [String], default: [] },
    started_at: { type: Date, default: null },
    completed_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);
matchSchema.index({ guild_id: 1, status: 1 });
// One active (lobby/in_progress) match per guild, enforced at the DB level.
matchSchema.index(
  { guild_id: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['lobby', 'in_progress'] } } },
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

export const GuildConfigModel =
  mongoose.models.GuildConfig ?? mongoose.model('GuildConfig', guildConfigSchema);
export const PlayerModel =
  (mongoose.models.Player as mongoose.Model<PlayerDoc>) ??
  mongoose.model<PlayerDoc>('Player', playerSchema);
export const MatchModel =
  (mongoose.models.Match as mongoose.Model<MatchDoc>) ??
  mongoose.model<MatchDoc>('Match', matchSchema);
export const UsageModel =
  (mongoose.models.Usage as mongoose.Model<UsageDoc>) ??
  mongoose.model<UsageDoc>('Usage', usageSchema);
export const MemberSnapshotModel =
  (mongoose.models.MemberSnapshot as mongoose.Model<MemberSnapshotDoc>) ??
  mongoose.model<MemberSnapshotDoc>('MemberSnapshot', memberSnapshotSchema);

export type { GuildConfig };
