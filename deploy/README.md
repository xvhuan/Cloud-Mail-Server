# Cloud Mail Docker 部署（PG/Redis 走容器内网）

本方案特点：

- 前后端一体：`mail-vue` 在构建 `cloud-mail-server` 镜像时自动打包
- `postgres`、`redis` 在 Docker 网络内提供服务
- **不映射 PostgreSQL/Redis 到宿主机端口**（不占用宿主机 `5432/6379`）
- 发件改为服务器直连目标邮箱 `MX`（不依赖 Resend/CF）
- 你可继续使用自己的 Nginx 反代 `8787`

## 1. 服务组成

- `cloud-mail-server`
- `postgres`
- `redis`
- `minio`
- 初始化任务容器：`cloud-mail-init`、`cloud-mail-configure-storage`、`cloud-mail-refresh-cache`

## 2. 准备文件

```bash
cd deploy
cp .env.example .env
```

编辑 `.env`，至少修改：

- `DOMAIN`：收信域名数组，如 `["a.com","b.com"]`
- `ADMIN`：管理员邮箱（例如 `admin@a.com`）
- `JWT_SECRET`
- `POSTGRES_PASSWORD`
- `DATABASE_URL`（密码要和 `POSTGRES_PASSWORD` 一致）
- `MINIO_ROOT_PASSWORD`

关键点：

- `DATABASE_URL` 默认是 `@postgres:5432`，表示通过 Docker 内网访问 `postgres` 服务
- `REDIS_URL` 默认是 `redis://redis:6379/0`，表示通过 Docker 内网访问 `redis` 服务

## 3. 启动

```bash
docker compose up -d --build
```

查看状态：

```bash
docker compose ps
docker compose logs -f cloud-mail-server
```

## 4. 端口说明

会暴露到宿主机（仅这两个）：

- `${SMTP_BIND_PORT}`（默认 `25`，用于收信）
- `${API_BIND_PORT}`（默认 `8787`，前端页面 + API）

不会暴露到宿主机：

- PostgreSQL `5432`（仅容器内网）
- Redis `6379`（仅容器内网）
- MinIO `9000/9001`（仅容器内网）

## 5. 域名和 MX（多域名可共用一台）

示例：

1. `A` 记录  
- `mail.example.com -> 你的服务器公网 IP`（DNS only，不要走代理）

2. `MX` 记录  
- `a.com -> mail.example.com`
- `b.com -> mail.example.com`

3. 出站 25 端口  
- 服务器必须允许 **出站 TCP 25**（发件走 SMTP 直连目标 MX）

## 6. Nginx 反代示例

```nginx
server {
    listen 80;
    server_name mail.example.com;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /attachments/ {
        proxy_pass http://127.0.0.1:8787;
    }

    location /static/ {
        proxy_pass http://127.0.0.1:8787;
    }
}
```

## 7. 验收

```bash
curl -fsS http://127.0.0.1:8787/healthz
ss -lntp | grep ':25'
```

外部检查（Windows PowerShell）：

```powershell
Test-NetConnection -ComputerName mail.example.com -Port 25
```

## 8. 常见问题

1. 收不到信  
- MX 是否生效
- `mail` 子域名是否指向服务器公网 IP
- 25 端口是否放行
- DNS 不能走代理（灰云）

2. 注册报错/登录异常  
- 先看 `docker compose logs -f cloud-mail-server`

3. 想重置数据库  
- 停服务后删除 `postgres-data` 卷再重启（会清空数据）
