FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

# Açılışta "prisma migrate deploy" çalıştırmak için ayrı, küçük bağımlılık seti
FROM node:24-alpine AS migrator
WORKDIR /migrator
RUN npm init -y > /dev/null && npm install --ignore-scripts prisma@7.10.0 dotenv@17.4.2

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=Europe/Istanbul

RUN apk add --no-cache tzdata && addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=migrator /migrator/node_modules /migrator/node_modules
COPY prisma /migrator/prisma
COPY prisma.config.ts /migrator/prisma.config.ts
COPY src/lib/databaseUrl.ts /migrator/src/lib/databaseUrl.ts

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --chmod=755 docker-entrypoint.sh ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["./docker-entrypoint.sh"]
