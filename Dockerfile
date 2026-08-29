# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --fetch-retries=5 --fetch-retry-maxtimeout=120000 --fetch-retry-mintimeout=20000 --no-audit --no-fund

FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/prisma ./prisma
# Fase 4.3 — detached worker runtime (tsx scripts/job-worker.ts reads lib/ + tsconfig paths).
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/tsconfig.json ./tsconfig.json
# Fase 6.14 — skills de los agentes (cargadas en runtime por lib/agents/skills.ts).
COPY --from=builder /app/skills ./skills

EXPOSE 3000

# The same image runs either role depending on JOB_WORKER_ENABLED:
#   web    (JOB_WORKER_ENABLED unset/false) -> migrate + Next.js server
#   worker (JOB_WORKER_ENABLED=true)        -> npm run worker (tsx scripts/job-worker.ts)
CMD ["sh", "-c", "if [ \"$JOB_WORKER_ENABLED\" = \"true\" ]; then npm run worker; else npx prisma migrate deploy && node_modules/.bin/next start -H 0.0.0.0 -p 3000; fi"]
