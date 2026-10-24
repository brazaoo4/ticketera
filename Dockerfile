# syntax=docker/dockerfile:1

# Stage 1: Dependencies
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm ci

# Stage 2: Builder
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build Next.js application
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

# Stage 3: Runner
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Prepare upload and cache directories for user 1000 (node)
RUN mkdir -p /app/uploads /app/.next/cache && \
    chown -R node:node /app/uploads /app/.next/cache

# Copy public assets and prisma directory
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

# Copy standalone output and static assets
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER 1000:1000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
