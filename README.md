# Cloud Mail 服务器版

纯服务器部署版本（无 Cloudflare 收信依赖）

## Clone

HTTPS：

```bash
git clone https://github.com/xvhuan/Cloud-Mail-Server.git
```

SSH：

```bash
git clone git@github.com:xvhuan/Cloud-Mail-Server.git
```

## 特性

- 前后端一体：后端镜像构建时自动打包 `mail-vue`
- SMTP 直接收信：对外开放 `25`
- SMTP 服务器直发：站外邮件由服务器直连目标 MX（需放通出站 25）
- Web/API 服务：对外开放 `8787`
- `PostgreSQL`、`Redis`、`MinIO` 全部走 Docker 内置网络，不占用宿主机端口

## 目录结构

- `cloud-mail-server/`：后端服务
- `mail-vue/`：前端源码
- `deploy/`：Docker 编排与部署说明

## 快速开始

```bash
cd deploy
cp .env.example .env
```

编辑 `.env` 后启动：

```bash
docker compose up -d --build
```

查看状态：

```bash
docker compose ps
docker compose logs -f cloud-mail-server
```

## 对外端口

- `25/tcp`：SMTP 收信
- `8787/tcp`：Web/API

其余服务端口（`5432/6379/9000/9001`）只在容器内网可见。

## 部署文档

详见 [deploy/README.md](./deploy/README.md)。

## 致谢

本项目基于原项目进行服务器化部署整理，致敬：

- `maillab/cloud-mail`：`https://github.com/maillab/cloud-mail`
