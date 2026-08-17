# syntax=docker/dockerfile:1

# ── deps ─────────────────────────────────────────────────────
# Separate stage so a source-only change reuses the cached install layer.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` installs exactly the lockfile — reproducible, unlike `npm install`.
RUN npm ci --omit=dev

# ── runtime ──────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# dumb-init reaps zombies and, importantly, forwards SIGTERM to node so the
# graceful-shutdown handler actually runs. Without an init, PID 1 is node and
# it receives the signal but Docker's 10s timeout often kills it mid-drain.
RUN apk add --no-cache dumb-init

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Never run as root: a container escape should not land on uid 0.
# The node image already ships a `node` user.
USER node

EXPOSE 5000

# Uses the liveness probe, which deliberately does not touch the database —
# a transient Mongo blip must not cause the orchestrator to kill the container.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
