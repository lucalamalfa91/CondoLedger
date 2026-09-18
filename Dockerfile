# Immagine Debian slim, non Alpine: better-sqlite3 è un modulo nativo e ha prebuild per
# linux-x64 glibc. Su Alpine (musl) andrebbe ricompilato da sorgente, il che richiede un
# toolchain C++ nell'immagine.
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY scripts ./scripts
COPY index.html ./
COPY js ./js
COPY css ./css
COPY references ./references

ENV NODE_ENV=production \
    PORT=8080 \
    DB_PATH=/data/condoledger.db \
    COOKIE_SECURE=true

EXPOSE 8080

CMD ["node", "server/index.js"]
