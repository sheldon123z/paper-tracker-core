# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS node-deps

ARG NPM_REGISTRY=https://registry.npmjs.org

ENV NODE_ENV=production
WORKDIR /app

COPY copilot-runtime/package.json copilot-runtime/package-lock.json ./
RUN npm ci --omit=dev --registry="${NPM_REGISTRY}" \
    && npm cache clean --force


FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=4100

WORKDIR /app
COPY --from=node-deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node \
    copilot-runtime/package.json \
    copilot-runtime/request-auth.js \
    copilot-runtime/server.js \
    ./

USER node

EXPOSE 4100

CMD ["node", "server.js"]
