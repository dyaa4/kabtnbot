import { AttachmentBuilder } from 'discord.js';
import { getGuildAsset, getGuildConfigRead, type GuildConfig } from '@gamebot/db';
import { formatWelcome, renderWelcomeImage } from './welcome-image.js';
import { t } from './strings.js';

/** Structural subset of GuildMember so tests can pass a plain object. */
export interface WelcomeMember {
  id: string;
  displayName: string;
  guild: { id: string; name: string; memberCount: number };
  displayAvatarURL(opts: { extension: 'png'; size: number }): string;
}

export interface WelcomePayload {
  content: string;
  files: AttachmentBuilder[];
}

/**
 * Build the welcome message (text + rendered banner) for a member. Shared by
 * the guildMemberAdd event and the /welcome-test preview command. Image
 * failures degrade gracefully to a text-only payload.
 */
export async function buildWelcomeMessage(member: WelcomeMember, config?: GuildConfig): Promise<WelcomePayload> {
  const cfg = config ?? (await getGuildConfigRead(member.guild.id));
  // '' means "no custom text set" — fall back to the guild-language default.
  // Placeholder expansion (server/user names) can push a maxed-out template past
  // Discord's 2000-char message limit — truncate instead of failing the send.
  const content = formatWelcome(cfg.welcome.message || t(cfg.language).defaultWelcome, {
    user: `<@${member.id}>`,
    server: member.guild.name,
    count: member.guild.memberCount,
  }).slice(0, 2000);

  const files: AttachmentBuilder[] = [];
  // Uploaded banner (dashboard) wins; banner_url is the legacy fallback.
  const asset = await getGuildAsset(member.guild.id, 'welcome_banner').catch(() => null);
  const banner = asset?.data ?? cfg.welcome.banner_url;
  if (banner) {
    const buf = await renderWelcomeImage({
      banner,
      avatar: member.displayAvatarURL({ extension: 'png', size: 256 }),
      name: cfg.welcome.show_name ? member.displayName : null,
      x: cfg.welcome.avatar_x,
      y: cfg.welcome.avatar_y,
      size: cfg.welcome.avatar_size,
    }).catch(() => null);
    if (buf) files.push(new AttachmentBuilder(buf, { name: 'welcome.png' }));
  }
  return { content, files };
}
