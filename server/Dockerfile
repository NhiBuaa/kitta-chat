FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./
FROM base AS dev
RUN npm install
COPY . .
CMD ["npm", "run", "dev"]
FROM base AS prod
RUN npm ci --only=production

COPY --chown=node:node . .

USER node

EXPOSE 3000
CMD ["sh", "-c", "export NODE_NAME=${HOSTNAME:-backend} && node server.js"]
