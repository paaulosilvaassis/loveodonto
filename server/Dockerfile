# Admin API (Root Directory = server).
# Runtime configuration is injected by the host at process start.
# Do not declare service secrets as ARG/ENV in this file.
FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production

CMD ["node", "index.js"]
