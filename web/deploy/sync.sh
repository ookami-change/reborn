#!/usr/bin/env bash
# 把本地 web/ 同步到服务器 /opt/reborn/ 并部署。
#
# --delete 会删掉服务器上本地没有的文件——.env.server 只存在于服务器，
# 曾因忘了排除它被整个删掉（密钥全没）。所有"只在服务器上存在"的东西
# 都必须列进 EXCLUDES，改这个数组前想清楚。
set -euo pipefail

HOST=${HOST:-root@124.223.185.175}
DIR=${DIR:-/opt/reborn}

EXCLUDES=(
  node_modules .next
  .env.local .env.server        # 密钥：前者只在本地，后者只在服务器
  'assets/*.otf'                # 8MB 字体，服务器上已有，不必每次传
  dataset                       # 导出的训练集
)
args=(); for e in "${EXCLUDES[@]}"; do args+=(--exclude "$e"); done

cd "$(dirname "$0")/.."
echo "==> 同步到 $HOST:$DIR"
rsync -az --delete "${args[@]}" -e "ssh -o ConnectTimeout=20" ./ "$HOST:$DIR/"

echo "==> 远端部署"
ssh -o ConnectTimeout=30 "$HOST" "cd $DIR && bash deploy/deploy.sh"
