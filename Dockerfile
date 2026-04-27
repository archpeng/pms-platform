FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json vitest.config.ts ./
COPY packages ./packages
RUN npm ci
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 8791
CMD ["node", "dist/packages/api/src/localServerMain.js"]
