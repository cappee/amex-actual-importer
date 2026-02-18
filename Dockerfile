FROM node:22-slim

# patchright (Chromium) + cron system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    cron \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2 libxshmfence1 \
    fonts-liberation libappindicator3-1 xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Install patchright browser
RUN npx patchright install chromium

COPY dist/ ./dist/

# Include cookies file (run `amex-actual-sync login` locally first)
COPY amex.json ./amex.json

COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

ENTRYPOINT ["./entrypoint.sh"]
