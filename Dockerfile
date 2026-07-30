FROM node:18-alpine AS base
WORKDIR /app
COPY package*.json ./

FROM base AS deps
RUN npm ci --omit=dev

FROM base AS build
RUN npm ci
COPY . .
RUN npm run lint

FROM node:18-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Keep this list in sync with the uploadDirs array in server.js. `logos` was
# missing here, so clinic logo uploads landed in a directory the runtime user
# could not create when /app/uploads is a mounted volume.
RUN mkdir -p logs \
      uploads/logos \
      uploads/prescription-scans \
      uploads/xrays \
      uploads/avatars \
      uploads/documents \
      uploads/resumes && \
    chown -R appuser:appgroup logs uploads

USER appuser
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/v1/health || exit 1

CMD ["node", "server.js"]
