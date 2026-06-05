FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript server
RUN npm run build

# Build React dashboard
WORKDIR /app/src/dashboard
RUN npm ci
RUN npm run build
WORKDIR /app

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/dashboard/dist ./src/dashboard/dist
COPY config/ ./config/
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "dist/server/webhook.js"]
