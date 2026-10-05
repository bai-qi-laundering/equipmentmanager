#!/bin/sh
set -eu
PATH=/usr/local/bin:/usr/bin:/bin:/var/packages/ContainerManager/target/usr/bin:$PATH
export PATH
cd /volume1/docker/equipment-manager

if ! grep -q 'API_ACCESS_KEYS is required' server/server.js; then
  echo '停止：請先下載有存取保護的新版 server/server.js'
  exit 1
fi
if [ ! -f docker-compose.public.yml ]; then
  echo '停止：請先下載 docker-compose.public.yml'
  exit 1
fi
project=$(docker inspect equipment-api --format '{{ index .Config.Labels "com.docker.compose.project" }}')
if [ -z "$project" ] || [ "$project" = '<no value>' ]; then
  echo '停止：無法確認目前的 Compose 專案'
  exit 1
fi
if [ ! -f public-api.env ]; then
  umask 077
  key=$(openssl rand -hex 32)
  printf 'API_ACCESS_KEYS=%s\n' "$key" > public-api.env
fi
if docker compose version >/dev/null 2>&1; then
  docker compose -p "$project" -f docker-compose.yml -f docker-compose.public.yml up -d --build --no-deps api
else
  docker-compose -p "$project" -f docker-compose.yml -f docker-compose.public.yml up -d --build --no-deps api
fi
echo '等待 API 啟動…'
i=0
until curl -fsS http://127.0.0.1:3000/api/health >/dev/null; do
  i=$((i+1))
  if [ "$i" -ge 20 ]; then echo 'API 尚未啟動，請檢查容器日誌'; exit 1; fi
  sleep 1
done
status=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/layout)
if [ "$status" != 401 ]; then echo "停止：未授權請求應回 401，實際 $status"; exit 1; fi
echo 'API 已啟動，未授權讀取被拒絕。'
echo '接著才可以在 NAS 上啟用 Tailscale Funnel；請勿公開 DSM 或資料庫連接埠。'
echo '啟用連結含存取金鑰，請只傳給要使用設備系統的人，不要貼到公開群組或截圖分享。'
