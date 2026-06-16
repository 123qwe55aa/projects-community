# Stage 1: Build
FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++ sqlite

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
COPY pnpm-lock.yaml package.json ./

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# Stage 2: Runtime
FROM node:22-alpine

RUN apk add --no-cache sqlite

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
ENV NODE_ENV=production

COPY pnpm-lock.yaml package.json ./
RUN pnpm install --frozen-lockfile --prod

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
