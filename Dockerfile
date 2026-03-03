# Use official Puppeteer-compatible Node image (includes Chrome deps)
FROM ghcr.io/puppeteer/puppeteer:22

# Set working directory
WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./

# Install deps as root temporarily to avoid permission issues
USER root
RUN npm ci --omit=dev

# Copy rest of the project
COPY . .

# Make sure output folder exists
RUN mkdir -p output

# Railway / most hosts inject PORT automatically
ENV PORT=3000
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

EXPOSE 3000

# Switch to non-root user (pptruser is built into the puppeteer image)
USER pptruser

CMD ["node", "server.js"]
