# Image for the API and the draft worker. The worker runs the same image with
# `node dist/worker.js` as its command.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/types/package.json packages/types/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund --workspace @isgratis/types --workspace @isgratis/api --include-workspace-root
COPY packages/types packages/types
COPY apps/api apps/api
RUN npm run build -w @isgratis/types && npm run build -w @isgratis/api

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/types/package.json packages/types/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# Production dependencies of the API only; the web app's packages stay out of this image.
RUN npm ci --omit=dev --no-audit --no-fund --workspace @isgratis/types --workspace @isgratis/api --include-workspace-root \
 && npm cache clean --force
COPY --from=build /app/packages/types/dist packages/types/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/drizzle apps/api/drizzle
WORKDIR /app/apps/api
USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]
