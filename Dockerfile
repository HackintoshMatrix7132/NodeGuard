FROM node:22-bookworm-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm ci

FROM deps AS build

COPY . .

RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=file:/data/nodeguard.sqlite
ENV WEB_DIST_DIR=apps/web/dist

WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/package.json apps/web/package.json
COPY --from=build /app/apps/web/dist apps/web/dist

RUN mkdir -p /data

VOLUME ["/data"]
EXPOSE 3000

CMD ["node", "apps/api/dist/index.js"]
