FROM node:18.17.0-alpine AS base

FROM base AS builder
ARG APP
RUN apk add --no-cache libc6-compat
RUN apk update
# Set working directory
WORKDIR /app
RUN npm i -g turbo
COPY . .
RUN turbo prune ${APP} --docker
# CMD tail -f /dev/null

# # Add lockfile and package.json's of isolated subworkspace
FROM base AS installer
RUN apk add --no-cache libc6-compat
RUN apk update
WORKDIR /app

# First install the dependencies (as they change less often)
COPY --from=builder /app/out/json/ .

COPY --from=builder /app/out/package-lock.json ./package-lock.json
RUN npm i

# Copy the project
COPY --from=builder /app/out/full/ .

FROM base AS runner
ARG APP
WORKDIR /app

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 ${APP}
USER ${APP}

COPY --from=installer /app .
COPY --from=installer --chown=${APP}:nodejs /app/apps/${APP} ./

ENV LISTEN_ADDRESS 0.0.0.0

RUN cd /app/apps/${APP}
CMD npm run start
