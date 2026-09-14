# 乎知 web 镜像：Next.js standalone 两阶段构建
# 依赖在镜像内完整安装并参与构建，产物为可直接运行的 server.js

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# 容器内直连 registry.npmjs.org 常被重置，改用国内镜像源
RUN npm config set registry https://registry.npmmirror.com/ && npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# 数据目录：默认挂载点 /app/.data（ClawCloud 等平台用 Local Storage 挂载此处即持久化）
ENV DATA_DIR=/app/.data
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]