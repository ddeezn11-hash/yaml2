# Blockyard studio-sync (Team Create WebSocket) — Render/Docker image.
# Bun runs the TypeScript source directly; no build step needed.
FROM oven/bun:1

WORKDIR /app

# Ensure missing ticket secrets fail closed in deployed containers.
ENV NODE_ENV=production

# Install runtime deps first so Docker can cache this layer.
COPY package.json bun.lock ./
RUN bun install --production

COPY index.ts ./

# Render injects the real port via the PORT env var at runtime.
EXPOSE 10000

CMD ["bun", "index.ts"]
