import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';

interface GuildInfoResp {
  premiumLinked?: boolean;
  premiumActive?: boolean;
}

/**
 * Two unlock tiers, mirroring the server gates (which remain the actual
 * enforcement): `premium` = linked by ANY account (logs, flows, customize);
 * `voicePremium` = linked by a PREMIUM account (the voice assistant is
 * strictly premium). The super-admin passes both.
 */
export function usePremiumStatus(guildId: string): { loading: boolean; premium: boolean; voicePremium: boolean } {
  const info = useQuery({
    queryKey: ['guild-info', guildId],
    queryFn: () => api<GuildInfoResp>(`/api/guilds/${guildId}/info`),
  });
  const admin = useQuery({
    queryKey: ['admin-me'],
    queryFn: () => api<{ isSuperAdmin: boolean }>('/api/admin/me'),
    retry: false,
  });
  const isSuperAdmin = admin.data?.isSuperAdmin ?? false;
  return {
    // Wait for BOTH queries: if only `info` is awaited, a super-admin on a
    // non-premium guild sees `info` resolve (premium:false) while `admin` is
    // still loading — flashing the PremiumUpsell before it snaps to the form.
    loading: info.isLoading || admin.isLoading,
    premium: (info.data?.premiumLinked ?? false) || isSuperAdmin,
    voicePremium: (info.data?.premiumActive ?? false) || isSuperAdmin,
  };
}
