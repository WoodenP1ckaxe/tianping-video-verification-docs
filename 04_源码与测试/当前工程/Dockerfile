FROM node:24-bookworm-slim
ARG TIANPING_GITHUB_MIRROR=https://ghproxy.net/

ENV NODE_ENV=production \
    TZ=Asia/Shanghai \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    DATA_DIR=/app/data \
    HOST=0.0.0.0 \
    PORT=8080 \
    PDF_FONT_PATH=/usr/share/fonts/truetype/tianping/NotoSansCJKsc-VF.ttf \
    TIANPING_GITHUB_MIRROR=${TIANPING_GITHUB_MIRROR}

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
       ca-certificates \
       ffmpeg \
       unzip \
       tzdata \
    && ln -snf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY scripts/asr-assets.js scripts/fetch-release-assets.mjs scripts/prepare-asr-assets.mjs ./scripts/
RUN TIANPING_ASSET_CACHE=/tmp/tianping-font-cache \
    && node scripts/fetch-release-assets.mjs --fonts \
    && mkdir -p /usr/share/fonts/truetype/tianping \
    && install -m 0644 /tmp/tianping-font-cache/NotoSansCJKsc-VF.ttf \
       /usr/share/fonts/truetype/tianping/NotoSansCJKsc-VF.ttf \
    && rm -rf /tmp/tianping-font-cache
RUN TIANPING_ASSET_CACHE=/tmp/tianping-asr-cache \
    && node scripts/fetch-release-assets.mjs --asr \
    && node scripts/prepare-asr-assets.mjs --platform linux --target /app/asr \
    && rm -rf /tmp/tianping-asr-cache
COPY --chown=node:node . .
RUN mkdir -p /app/data /app/backups \
    && chown -R node:node /app/data /app/backups

ENV ASR_ENABLED=true \
    ASR_BINARY_PATH=/app/asr/bin/linux/whisper-cli \
    ASR_MODEL_PATH=/app/asr/models/ggml-base-q5_1.bin \
    ASR_VAD_MODEL_PATH=/app/asr/models/ggml-silero-v6.2.0.bin

USER node
EXPOSE 8080
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "server.js"]

