FROM mcr.microsoft.com/playwright:v1.60.0-noble

WORKDIR /app/analyzer

ENV PLAYWRIGHT_ENABLED=true
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY analyzer/package.json ./
RUN pnpm install

COPY analyzer/src ./src
COPY src /app/src

EXPOSE 3001

CMD ["pnpm", "start"]
