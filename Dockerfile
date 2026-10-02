# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates python3 python3-pip \
  && pip3 install --break-system-packages --no-cache-dir instaloader==4.15.3 \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.mjs ./server.mjs
COPY --from=build /app/media-connectors.mjs ./media-connectors.mjs
COPY --from=build /app/large-media-core.mjs ./large-media-core.mjs
COPY --from=build /app/sync-core.mjs ./sync-core.mjs
COPY --from=build /app/account-auth-core.mjs ./account-auth-core.mjs
COPY --from=build /app/instagram-core.mjs ./instagram-core.mjs
COPY --from=build /app/scripts/instagram_fetch.py ./scripts/instagram_fetch.py
COPY --from=build /app/src/extraction-quality.js ./src/extraction-quality.js

EXPOSE 8080
CMD ["node", "server.mjs"]
