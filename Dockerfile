# Track the latest Node 22 patch, not 22.12: the corepack bundled with
# node:22.12-slim ships outdated npm signing keys and fails to provision pnpm
# ("Cannot find matching keyid"). Newer 22.x images carry current keys.
FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile && pnpm build && pnpm prune --prod
CMD ["node", "apps/bot/dist/index.js"]
