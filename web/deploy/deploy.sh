#!/usr/bin/env bash
# 在服务器上执行：构建镜像并重启 reborn 应用容器。
# 与同机的 a-share / baby-planet 共用 a-share-net 网络与 Caddy 入口，互不干扰。
set -euo pipefail

APP_DIR=/opt/reborn
NET=a-share-net
PG_NAME=reborn-db
APP_NAME=reborn-app
PG_VOLUME=reborn-pgdata

cd "$APP_DIR"
[ -f .env.server ] || { echo "缺少 $APP_DIR/.env.server"; exit 1; }
set -a; . ./.env.server; set +a

# ---- Postgres：只在 docker 网络内可见，不映射公网端口 ----
if ! docker ps -a --format '{{.Names}}' | grep -qx "$PG_NAME"; then
  echo "==> 创建 Postgres 容器"
  docker volume create "$PG_VOLUME" >/dev/null
  docker run -d --name "$PG_NAME" --network "$NET" --restart unless-stopped \
    -e POSTGRES_USER="$PG_USER" -e POSTGRES_PASSWORD="$PG_PASSWORD" -e POSTGRES_DB="$PG_DB" \
    -v "$PG_VOLUME":/var/lib/postgresql/data \
    postgres:17-alpine >/dev/null
  echo "    等待就绪..."
  for i in $(seq 1 30); do
    docker exec "$PG_NAME" pg_isready -q -U "$PG_USER" && break
    sleep 1
  done
else
  docker start "$PG_NAME" >/dev/null 2>&1 || true
fi

# ---- 应用镜像 ----
echo "==> 构建镜像"
docker build -t reborn:latest .

# ---- 迁移：用 psql 直接跑 drizzle 生成的 SQL ----
echo "==> 应用数据库迁移"
for f in drizzle/*.sql; do
  [ -e "$f" ] || continue
  echo "    $f"
  docker exec -i "$PG_NAME" psql -q -U "$PG_USER" -d "$PG_DB" \
    -v ON_ERROR_STOP=0 < "$f" 2>&1 | grep -vE 'already exists|NOTICE' || true
done

# ---- 应用容器 ----
echo "==> 重启应用"
docker rm -f "$APP_NAME" >/dev/null 2>&1 || true
docker run -d --name "$APP_NAME" --network "$NET" --restart unless-stopped \
  --env-file .env.server \
  -e DATABASE_URL="postgres://$PG_USER:$PG_PASSWORD@$PG_NAME:5432/$PG_DB" \
  reborn:latest >/dev/null

sleep 3
docker ps --filter "name=reborn" --format '  {{.Names}}  {{.Status}}'
echo "==> 完成"
