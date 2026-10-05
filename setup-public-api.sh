#!/bin/sh
set -eu
PATH=/usr/local/bin:/usr/bin:/bin:/var/packages/ContainerManager/target/usr/bin:$PATH
export PATH
cd /volume1/docker/equipment-manager

source_ref=96d8fe335b1681157dcae135d34ecbc738b6a3cb
base_url="https://raw.githubusercontent.com/bai-qi-laundering/equipmentmanager/$source_ref"
download() {
  if command -v curl >/dev/null 2>&1; then
    curl -fL --connect-timeout 20 --max-time 120 "$1" -o "$2"
  else
    wget -T 120 -O "$2" "$1"
  fi
}
new_server=$(mktemp server/server.js.public.XXXXXX)
new_compose=$(mktemp docker-compose.public.yml.XXXXXX)
trap 'rm -f "$new_server" "$new_compose"' EXIT
download "$base_url/server/server.js" "$new_server"
download "$base_url/docker-compose.public.yml" "$new_compose"
if ! grep -q 'API_ACCESS_KEYS is required' "$new_server" || ! grep -q 'public-api.env' "$new_compose"; then
  echo '停止：下載的內容不是已驗證的公開 API 版本'
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
cp server/server.js "server/server.js.backup-$(date +%Y%m%d-%H%M%S)"
mv "$new_server" server/server.js
mv "$new_compose" docker-compose.public.yml
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
key=$(sed -n 's/^API_ACCESS_KEYS=//p' public-api.env | cut -d, -f1)
authorized=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $key" http://127.0.0.1:3000/api/layout)
if [ "$authorized" != 200 ]; then echo "停止：授權讀取應回 200，實際 $authorized"; exit 1; fi
echo 'API 已啟動，未授權讀取被拒絕。'
echo '接著才可以在 NAS 上啟用 Tailscale Funnel；請勿公開 DSM 或資料庫連接埠。'
echo '啟用連結含存取金鑰，請只傳給要使用設備系統的人，不要貼到公開群組或截圖分享。'
