FROM node:22-alpine AS frontend-build

WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./

ENV VITE_API_URL=""
ENV VITE_API_URL_AUTH="/api/auth"
ENV VITE_API_URL_USERS="/api/users"
ENV VITE_API_URL_MESSAGES="/api/messages"
ENV VITE_API_URL_GROUPS="/api/groups"
ENV VITE_API_URL_FILES="/api/files"
ENV VITE_API_URL_CALLS="/api/calls"
ENV VITE_PROXY_TARGET="http://backend:3000"
ENV VITE_DEFAULT_AVATAR="https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y"

RUN npm run build

FROM nginx:alpine

COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY --from=frontend-build /app/client/dist /usr/share/nginx/html
