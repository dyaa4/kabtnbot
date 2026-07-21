import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      DISCORD_TOKEN: 'test-token',
      DISCORD_CLIENT_ID: '000000000000000000',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/gamebot-test-unused',
      SUPER_ADMIN_IDS: 'superadmin1',
    },
  },
});
