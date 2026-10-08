# API and draft worker share one image; the worker runs with `node dist/worker.js`.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/types/package.json packages/types/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund --workspace @isgratis/types --workspace @isgratis/api --include-workspace-root
COPY packages/types packages/types
COPY apps/api apps/api
RUN npm run build -w @isgratis/types && npm run build -w @isgratis/api \
 && npm prune --omit=dev --workspace @isgratis/types --workspace @isgratis/api --include-workspace-root

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/types/package.json packages/types/package.json
COPY --from=build /app/packages/types/dist packages/types/dist
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/drizzle apps/api/drizzle
WORKDIR /app/apps/api
USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]
