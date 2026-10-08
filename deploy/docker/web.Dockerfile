FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/types/package.json packages/types/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund --workspace @isgratis/types --workspace @isgratis/web --include-workspace-root
COPY packages/types packages/types
COPY apps/web apps/web
RUN npm run build -w @isgratis/types && npm run build -w @isgratis/web \
 && npm prune --omit=dev --workspace @isgratis/types --workspace @isgratis/web --include-workspace-root

FROM node:22-alpine
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/types/package.json packages/types/package.json
COPY --from=build /app/packages/types/dist packages/types/dist
COPY --from=build /app/apps/web/package.json apps/web/package.json
COPY --from=build /app/apps/web/build apps/web/build
WORKDIR /app/apps/web
USER node
EXPOSE 3000
CMD ["npx", "react-router-serve", "./build/server/index.js"]
