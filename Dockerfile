# Vinyl Switch server — booking API + PWA + embedded MQTT broker.
# Single container that listens on 3000 (HTTP) and 1883 (MQTT).
FROM node:20-bookworm-slim

# better-sqlite3 ships prebuilt binaries; these are a build fallback.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install production dependencies first (better layer caching).
COPY package*.json ./
RUN npm install --omit=dev

# Application source.
COPY src ./src
COPY public ./public

# SQLite lives here — mount a volume on /app/data to persist bookings.
RUN mkdir -p /app/data
ENV DB_FILE=/app/data/vinylswitch.db

# 3000 = booking app + REST API   |   1883 = MQTT (ESP32 devices)
EXPOSE 3000 1883

CMD ["node", "src/index.js"]
