import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      DISCORD_TOKEN: 'test-token',
      DISCORD_CLIENT_ID: '000000000000000000',
      DISCORD_CLIENT_SECRET: 'test-secret',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/gamebot-test-unused',
      SESSION_SECRET: 'test-session-secret-16chars',
      WEB_BASE_URL: 'http://localhost:3000',
    },
  },
});
