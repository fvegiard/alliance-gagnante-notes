# ── Runtime ─────────────────────────────────────────────────
FROM node:20-slim AS base
WORKDIR /app

# ── Dependencies ──────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ── Build ─────────────────────────────────────────────────────
FROM deps AS build
COPY . .
RUN npm run build

# ── Production ────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json tsconfig.server.json ./
COPY api ./api
COPY db ./db
COPY contracts ./contracts
EXPOSE 3000
CMD ["npm", "start"]
