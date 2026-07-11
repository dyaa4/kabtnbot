import type { BuiltinCommandKey } from '@gamebot/shared';

// Display metadata for the six built-in voice commands shown in the pinned
// "System" folder. The actual trigger regexes live bot-side (router.ts) —
// the editor only shows a localized description and lets admins add extra
// phrases, restrict roles/users, or disable the command.
export const BUILTIN_KEYS: BuiltinCommandKey[] = ['leave', 'stop', 'say', 'kick', 'help', 'ping'];

export function builtinNameKey(key: BuiltinCommandKey): string {
  return `commands.builtin.${key}`;
}

/** say/kick capture arguments after the phrase; the rest are exact commands. */
export const BUILTIN_HAS_ARGS: Record<BuiltinCommandKey, boolean> = {
  leave: false,
  stop: false,
  say: true,
  kick: true,
  help: false,
  ping: false,
};
