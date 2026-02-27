# Cloud Mail Docker（纯服务器版，无 CF 依赖）

这个目录是 Docker 部署目录，目标是：

- 不依赖 Cloudflare 收信链路
- 对外只开放 `25`（SMTP）和 `8787`（Web/API）
- `PostgreSQL`、`Redis`、`MinIO` 全部只走 Docker 内置网络

## 目录说明

- `docker-compose.yml`：完整服务编排（server + postgres + redis + minio + 初始化任务）
- `.env.example`：环境变量模板
- `.gitignore`：默认忽略 `.env`

## 仓库结构要求

需要和以下目录同级：

- `cloud-mail-server/`
- `mail-vue/`
- `deploy/`

原因：`cloud-mail-server/Dockerfile` 会在构建时打包前端 `mail-vue`，并由 `deploy/docker-compose.yml` 触发构建。

## 快速部署

```bash
cd deploy
cp .env.example .env
```

编辑 `.env` 必改项：

- `DOMAIN`：邮箱域名数组，例如 `["a.com","b.com"]`
- `ADMIN`：管理员邮箱，例如 `admin@a.com`
- `JWT_SECRET`
- `POSTGRES_PASSWORD`
- `DATABASE_URL`（密码和 `POSTGRES_PASSWORD` 保持一致）
- `MINIO_ROOT_PASSWORD`
- `INBOUND_SHARED_SECRET`（建议设置，避免内部接口被拒绝）

启动：

```bash
docker compose up -d --build
```

查看状态：

```bash
docker compose ps
docker compose logs -f cloud-mail-server
```

## 端口策略

会映射到宿主机（仅这两个）：

- `SMTP_BIND_PORT` -> 容器 `25`
- `API_BIND_PORT` -> 容器 `8787`

不会映射到宿主机：

- `postgres:5432`
- `redis:6379`
- `minio:9000/9001`

注意：`docker compose ps` 中显示的 `9000/tcp`、`5432/tcp`、`6379/tcp` 代表容器内部端口，不是公网开放。

## DNS（多域名）

假设收信主机是 `mail.example.com`：

1. `A` 记录：`mail.example.com -> 服务器公网 IP`（DNS only，不走代理）
2. 每个业务域名配置 `MX` 指向 `mail.example.com`

示例：

- `a.com MX 10 mail.example.com`
- `b.com MX 10 mail.example.com`

## 验证命令

```bash
curl -fsS http://127.0.0.1:8787/healthz
ss -lntp | rg ':25|:8787|:5432|:6379|:9000|:9001'
```

正确结果应满足：

- `0.0.0.0:25`、`0.0.0.0:8787` 存在
- `0.0.0.0:5432/6379/9000/9001` 不存在

## 可选：宿主机 Nginx 反代

你已经有 Nginx 的话，直接把域名反代到：

- `http://127.0.0.1:8787`

本目录不会部署 Nginx 容器。

## 升级

```bash
docker compose pull
docker compose up -d --build
```

## 数据备份（卷）

- `cloud-mail_postgres-data`
- `cloud-mail_redis-data`
- `cloud-mail_minio-data`
