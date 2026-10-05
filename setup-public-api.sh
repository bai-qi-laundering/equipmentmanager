#!/bin/sh
set -eu
PATH=/usr/local/bin:/usr/bin:/bin:/var/packages/ContainerManager/target/usr/bin:$PATH
export PATH
cd /volume1/docker/equipment-manager

# This ref is the reviewed gateway and Compose overlay; never download secrets.
source_ref=d6e7559ff47848c45c68690d903618a6498aa7c0
base_url="https://raw.githubusercontent.com/bai-qi-laundering/equipmentmanager/$source_ref"
download() {
  if command -v curl >/dev/null 2>&1; then
    curl -fL --connect-timeout 20 --max-time 120 "$1" -o "$2"
  else
    wget -T 120 -O "$2" "$1"
  fi
}
new_gateway=$(mktemp public-gateway.mjs.XXXXXX)
new_compose=$(mktemp docker-compose.public.yml.XXXXXX)
trap 'rm -f "$new_gateway" "$new_compose"' EXIT
download "$base_url/public-gateway.mjs" "$new_gateway"
download "$base_url/docker-compose.public.yml" "$new_compose"
if ! grep -q 'API_ACCESS_KEYS is required' "$new_gateway" || ! grep -q '127.0.0.1:3001:3001' "$new_compose"; then
  echo '停止：下載的內容不是已驗證的公開 API 閘道'
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
mv "$new_gateway" public-gateway.mjs
mv "$new_compose" docker-compose.public.yml
if docker compose version >/dev/null 2>&1; then
  docker compose -p "$project" -f docker-compose.yml -f docker-compose.public.yml up -d --no-deps gateway
else
  docker-compose -p "$project" -f docker-compose.yml -f docker-compose.public.yml up -d --no-deps gateway
fi
echo '等待公開 API 閘道啟動…'
i=0
until curl -fsS http://127.0.0.1:3001/api/health >/dev/null; do
  i=$((i+1))
  if [ "$i" -ge 20 ]; then echo '閘道尚未啟動，請檢查容器日誌'; exit 1; fi
  sleep 1
done
status=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/api/layout)
if [ "$status" != 401 ]; then echo "停止：未授權請求應回 401，實際 $status"; exit 1; fi
key=$(sed -n 's/^API_ACCESS_KEYS=//p' public-api.env | cut -d, -f1)
authorized=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $key" http://127.0.0.1:3001/api/layout)
if [ "$authorized" != 200 ]; then echo "停止：授權讀取應回 200，實際 $authorized"; exit 1; fi
echo '公開 API 閘道已準備好；既有私人 API 不受影響。'
echo '接著才在 NAS 上設定 tailscale funnel --bg --https=8443 3001。'
echo 'public-api.env 包含金鑰，請勿上傳、截圖或傳到群組。'
