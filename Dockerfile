# syntax=docker/dockerfile:1

# The base image is pinned by digest (node:22-alpine); update the digest to take security fixes.

# 1. Install dependencies
FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 2. Build the standalone Next.js server
FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Firebase web config is public and inlined into the client bundle at build time. It comes from the
# committed .env.production (what `gcloud run deploy --source .` uses, since that cannot pass build
# args). A `docker build --build-arg NEXT_PUBLIC_FIREBASE_...=...` overrides it. The ARGs have no
# default on purpose: an empty value in the environment would hide .env.production from Next.js.
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# 3. Small runtime image, running as a non-root user. The app files stay owned by root, so the
#    process cannot rewrite its own code; only Next's cache directory is writable.
FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
RUN mkdir -p .next/cache && chown app:app .next/cache
USER app
EXPOSE 8080
CMD ["node", "server.js"]
