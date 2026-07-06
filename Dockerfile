FROM node:22.12-slim
WORKDIR /app
# Node 22.12's bundled corepack ships outdated npm signing keys and fails to
# provision pnpm ("Cannot find matching keyid"). Install pnpm directly instead
# of via corepack. Keep this version in sync with package.json "packageManager".
RUN npm install -g pnpm@9.15.0
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile && pnpm build && pnpm prune --prod
CMD ["node", "apps/bot/dist/index.js"]
