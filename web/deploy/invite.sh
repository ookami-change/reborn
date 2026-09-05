#!/usr/bin/env bash
# 在服务器上管理家庭邀请链接。参数原样透传给 scripts/invite.mjs。
#
#   bash deploy/invite.sh                 列出
#   bash deploy/invite.sh add "小明家"     新建
#   bash deploy/invite.sh revoke "小明家"  撤销
#   bash deploy/invite.sh group           打印发家长群的领取链接
#
# 不能直接用 reborn:latest 跑：Next 的 standalone 产物把 postgres 打包进了
# server chunk，/app/node_modules 里没有独立模块；也不能只把脚本挂进去，
# ESM 是从**脚本所在目录**往上找 node_modules 而不是 cwd。
set -euo pipefail
cd "$(dirname "$0")/.."
. ./.env.server

docker run --rm --network a-share-net -v "$PWD/scripts:/s:ro" -w /work \
  -e DATABASE_URL="postgres://$PG_USER:$PG_PASSWORD@reborn-db:5432/$PG_DB" \
  -e BASE_URL="$BASE_URL" -e NEXT_PUBLIC_BASE_PATH="${NEXT_PUBLIC_BASE_PATH:-}" \
  -e CLAIM_LIMIT="${CLAIM_LIMIT:-0}" -e CLAIM_CODE="${CLAIM_CODE:-}" \
  node:22-alpine sh -c \
  'cp /s/invite.mjs /work/ && npm i -s --no-audit --no-fund postgres >/dev/null 2>&1 && node /work/invite.mjs "$@"' -- "$@"
