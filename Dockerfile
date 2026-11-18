# Build frontu i API daje sam JavaScript, więc biegnie na platformie budującej, także przy obrazie arm64
# (.github/workflows/release.yml). Moduły natywne instaluje dopiero etap końcowy, na docelowej platformie.
FROM --platform=$BUILDPLATFORM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY e2e/package.json e2e/
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-slim
ENV NODE_ENV=production
ENV PORT=3000
# W kontenerze nasłuch na wszystkich interfejsach; z zewnątrz port otwiera dopiero mapowanie (docker-compose: tylko 127.0.0.1).
ENV HOST=0.0.0.0
ENV DATABASE_PATH=/data/ogarniacz.db
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY e2e/package.json e2e/
RUN npm ci --omit=dev --workspace=@ogarniacz/api
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/public apps/api/public
COPY apps/api/drizzle apps/api/drizzle
RUN mkdir /data && chown node:node /data
USER node
WORKDIR /app/apps/api
VOLUME /data
EXPOSE 3000
# Obraz nie ma curl, więc /api/health sprawdza sam Node. W start-period (migracje przy starcie) sprawdza co 2 s,
# żeby Caddy z deploy/docker, który czeka na zdrową aplikację, ruszył zaraz po niej.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=2s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/index.cjs"]
