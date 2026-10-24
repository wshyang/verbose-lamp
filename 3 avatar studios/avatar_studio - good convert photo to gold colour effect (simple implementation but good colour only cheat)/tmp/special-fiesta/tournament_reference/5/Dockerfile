# Contextualised from initial-templates/Dockerfile (GREENFIELD s10.1).
# This app has its own server: Node + tsx serves the API and the built
# frontend from dist/. The generic template's static-site guess is wrong here.
FROM node:22.14.0-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:22.14.0-alpine
WORKDIR /app
RUN addgroup -g 1001 -S app && adduser -S -u 1001 -G app app
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/dist ./dist
ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" || exit 1
USER 1001
CMD ["node_modules/.bin/tsx", "backend/server.ts"]
