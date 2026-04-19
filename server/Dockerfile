# ===========================================================
# STAGE 1: BASE - Các bước chung cho cả Dev và Prod
# ===========================================================
FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./

# ===========================================================
# STAGE 2: DEVELOPMENT - Dùng nodemon cho hot-reload
# ===========================================================
FROM base AS dev
# Cài toàn bộ thư viện (kể cả devDependencies)
RUN npm install
COPY . .
# Dev: chạy root cũng được, có mount volume override
CMD ["npm", "run", "dev"]

# ===========================================================
# STAGE 3: PRODUCTION - Tối ưu nhẹ + bảo mật
# ===========================================================
FROM base AS prod
# Chỉ cài production dependencies, loại bỏ devDependencies
RUN npm ci --only=production

# Copy code và trao quyền cho user 'node' có sẵn trong image
COPY --chown=node:node . .

# Chuyển sang user không root để giảm attack surface
USER node

EXPOSE 3000

# Prod: lấy NODE_NAME từ hostname tự động của Docker container
# Ví dụ: chat_backend_1, chat_backend_2, chat_backend_3
# Giúp phân biệt log từng replica trong proof scaling
CMD ["sh", "-c", "export NODE_NAME=${HOSTNAME:-backend} && node server.js"]
