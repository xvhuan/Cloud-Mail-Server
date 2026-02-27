FROM node:22-alpine AS web-build

WORKDIR /web

RUN corepack enable

COPY mail-vue/package.json mail-vue/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY mail-vue/ ./
RUN pnpm build

FROM node:22-alpine AS server-deps

WORKDIR /app

RUN corepack enable

COPY cloud-mail-server/package.json cloud-mail-server/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine

WORKDIR /app

RUN corepack enable

COPY --from=server-deps /app/node_modules ./node_modules
COPY cloud-mail-server/package.json cloud-mail-server/pnpm-lock.yaml ./
COPY cloud-mail-server/src ./src
COPY cloud-mail-server/.env.example ./
COPY --from=web-build /web/dist ./public

ENV NODE_ENV=production
ENV WEB_DIST_DIR=/app/public

EXPOSE 8787 25

CMD ["pnpm", "start"]
