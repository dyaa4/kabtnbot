import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';

interface GuildInfoResp {
  premiumLinked?: boolean;
}

/**
 * Whether this guild's premium tabs are unlocked: linked by any account, or
 * the viewer is the super-admin. Mirrors the server-side hasPremiumAccess —
 * the API gates remain the actual enforcement.
 */
export function usePremiumStatus(guildId: string): { loading: boolean; premium: boolean } {
  const info = useQuery({
    queryKey: ['guild-info', guildId],
    queryFn: () => api<GuildInfoResp>(`/api/guilds/${guildId}/info`),
  });
  const admin = useQuery({
    queryKey: ['admin-me'],
    queryFn: () => api<{ isSuperAdmin: boolean }>('/api/admin/me'),
    retry: false,
  });
  return {
    loading: info.isLoading,
    premium: (info.data?.premiumLinked ?? false) || (admin.data?.isSuperAdmin ?? false),
  };
}
