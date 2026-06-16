# Stage 1: Build
FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++ sqlite

# Pin pnpm to v10.0.0 (v10.34 has bug with onlyBuiltDependencies)
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

WORKDIR /app
COPY pnpm-lock.yaml package.json ./
RUN pnpm install --frozen-lockfile --config.onlyBuiltDependencies=esbuild,sharp,better-sqlite3,unrs-resolver

COPY . .
RUN pnpm run build

# Stage 2: Runtime
FROM node:22-alpine

RUN apk add --no-cache sqlite

WORKDIR /app
ENV NODE_ENV=production

COPY pnpm-lock.yaml package.json ./

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate \
 && pnpm install --frozen-lockfile --config.onlyBuiltDependencies=better-sqlite3,sharp

# Copy build artifacts + runtime source
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/src ./src
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/templates ./templates
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3000
CMD ["pnpm", "start"]
