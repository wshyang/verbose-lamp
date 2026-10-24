# Production image (CLAUDE §10.1): static dist/ on port 3000 / 0.0.0.0.
# Contextualised from wshyang/greenfield initial-templates/Dockerfile:
# this app is a pure static Vite build, so no auto-detection is needed.
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM node:22-alpine
RUN npm install -g serve@14
WORKDIR /app
COPY --from=builder /app/dist ./dist
ENV PORT=3000
ENV HOST=0.0.0.0
EXPOSE 3000
USER 1001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1
CMD ["serve", "dist", "-l", "3000"]
