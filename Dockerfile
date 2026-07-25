# Madrasty — single application image.
# Builds the React client to static assets and runs the Express API via tsx.
# The server serves the built client from the same origin (CLIENT_DIST_PATH),
# so the whole app is one container on one port. Postgres/Redis stay separate
# (see docker-compose.yml).
FROM node:24-slim

WORKDIR /app

# Install workspace deps first, using only the manifests, for better layer caching.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci

# Copy the rest of the monorepo source.
COPY . .

# Build the client SPA. VITE_* values are baked in at build time (client code),
# so they come in as build args (kept in sync with .env.example defaults).
ARG VITE_API_BASE_URL=/api
ARG VITE_DEFAULT_LOCALE=ar
ARG VITE_SUPPORTED_LOCALES=ar,en
RUN VITE_API_BASE_URL="$VITE_API_BASE_URL" \
    VITE_DEFAULT_LOCALE="$VITE_DEFAULT_LOCALE" \
    VITE_SUPPORTED_LOCALES="$VITE_SUPPORTED_LOCALES" \
    npm run build --workspace @madrasty/client

EXPOSE 4000

# Migrate + seed the admin bootstrap, then start the server (runs the client too).
ENTRYPOINT ["./docker-entrypoint.sh"]
