import { normalizeText } from '@gamebot/shared';

/** Best-effort match of a spoken name to a member id; null if not confident. */
export function resolveKickTarget(spokenName: string, members: { id: string; displayName: string }[]): string | null {
  const q = normalizeText(spokenName);
  if (!q) return null;
  const exact = members.find((m) => normalizeText(m.displayName) === q);
  if (exact) return exact.id;
  const contains = members.filter((m) => {
    const n = normalizeText(m.displayName);
    return n.includes(q) || q.includes(n);
  });
  return contains.length === 1 ? contains[0].id : null;
}
