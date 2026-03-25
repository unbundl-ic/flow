# Playwright automation worker (deploy separately from Vercel)
FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json next.config.ts ./
COPY src ./src
COPY worker ./worker

RUN npx playwright install chromium

ENV STORE_BACKEND=mongo
ENV NODE_ENV=production

EXPOSE 8787

CMD ["npx", "tsx", "--tsconfig", "worker/tsconfig.json", "worker/server.ts"]
