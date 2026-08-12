FROM node:22.14.0-bookworm-slim

WORKDIR /opt/k4
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

ENV NODE_PATH=/opt/k4/node_modules
