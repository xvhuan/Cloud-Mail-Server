# cloud-mail-server

服务器端主后端。

- 运行时：Node + Hono
- 存储：Postgres + Redis + S3
- 收信：本机 SMTP（默认 `0.0.0.0:25`）
- 入口：`src/server.js`

## 快速启动

1. 复制 `.env.example` 为 `.env`
2. 安装依赖并启动（PowerShell）

```powershell
pnpm --dir cloud-mail-server install
pnpm --dir cloud-mail-server start
```

## 关键路由

- `GET /healthz`
- `POST /api/internal/inbound-email`（仅 Worker 调用）
- `GET /api/init/:secret`
- 其余业务 API 与原 `mail-worker` 保持一致（`/api/...`）

## 纯服务器模式说明

不使用 Cloudflare 时，直接配置域名 `MX -> 你的服务器` 即可走 SMTP 入库。
