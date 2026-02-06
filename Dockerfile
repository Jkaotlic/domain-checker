FROM node:18-alpine

WORKDIR /app

# Install deps
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund --production || npm install --no-audit --no-fund

# Copy source and build
COPY . .
RUN npm run build || true

EXPOSE 3000

ENV NODE_ENV=production
CMD ["npm", "start"]
