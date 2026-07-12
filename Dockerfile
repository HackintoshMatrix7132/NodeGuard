ARG AGENT_VERSION=0.1.0

FROM golang:1.23-bookworm AS agent-build

ARG AGENT_VERSION
ARG AGENT_COMMIT=container-build
WORKDIR /src/agent
COPY agent/go.mod ./
COPY agent ./
RUN make VERSION="$AGENT_VERSION" COMMIT="$AGENT_COMMIT" release
RUN mkdir -p "/release/$AGENT_VERSION" \
  && cp bin/nodeguard-agent-linux-amd64 bin/nodeguard-agent-linux-arm64 bin/checksums.txt "/release/$AGENT_VERSION/"

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

ARG AGENT_VERSION

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=file:/data/nodeguard.sqlite
ENV WEB_DIST_DIR=apps/web/dist
ENV AGENT_INSTALLER_PATH=agent/install-agent.sh
ENV AGENT_RELEASE_DIR=agent-releases
ENV AGENT_RELEASE_VERSION=$AGENT_VERSION

WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/package.json apps/web/package.json
COPY --from=build /app/apps/web/dist apps/web/dist
COPY --from=agent-build /release ./agent-releases
COPY agent/install-agent.sh agent/install-agent.sh

RUN mkdir -p /data && chmod 0755 agent/install-agent.sh

VOLUME ["/data"]
EXPOSE 3000

CMD ["node", "apps/api/dist/index.js"]
