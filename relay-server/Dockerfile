FROM node:20-alpine

# Create app directory
WORKDIR /app

# Install dependencies first (layer cached unless package.json changes)
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY src/ ./src/

# Non-root user for security
RUN addgroup -S neovision && adduser -S neovision -G neovision
USER neovision

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/server.js"]
