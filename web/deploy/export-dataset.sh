#!/usr/bin/env bash
# 在服务器上导出检出训练集到 /opt/reborn/dataset/。
#
# 不能直接用 reborn:latest 跑：Next 的 standalone 产物把 postgres 打包进了
# server chunk，/app/node_modules 里没有独立的 postgres 模块。
# 也不能只把脚本挂进去——ESM 是从**脚本所在目录**往上找 node_modules，
# 不是 cwd，所以脚本必须和 node_modules 在同一棵目录树里。
set -euo pipefail

cd "$(dirname "$0")/.."
OUT=${1:-$PWD/dataset}
mkdir -p "$OUT"
. ./.env.server

docker run --rm --network a-share-net \
  -v "$PWD/scripts:/s:ro" -v "$OUT:/out" -w /work \
  -e DATABASE_URL="postgres://$PG_USER:$PG_PASSWORD@reborn-db:5432/$PG_DB" \
  node:22-alpine sh -c \
  'cp /s/export-dataset.mjs /work/ && npm i -s --no-audit --no-fund postgres >/dev/null 2>&1 && node /work/export-dataset.mjs /out'
