#!/bin/sh
# Standalone NAS updater: no Git installation or checkout is required.
set -eu
PATH=/usr/local/bin:/usr/bin:/bin:/var/packages/ContainerManager/target/usr/bin:$PATH
export PATH
cd "${EQUIPMENT_PROJECT_DIR:-/volume1/docker/equipment-manager}"
umask 077
release_ref=${EQUIPMENT_UPDATE_REF:-0e4e9d5eaee2a5056e980db78cd6436d31048fe8}
case "$release_ref" in *[!a-f0-9]*|'') echo '停止：更新版本必須是完整提交 SHA'; exit 1;; esac
if test "${#release_ref}" -ne 40; then echo '停止：更新版本必須是完整提交 SHA'; exit 1; fi
lock=.equipment-update.lock
if ! mkdir "$lock"; then echo '停止：已有更新執行中，請確認原任務已結束'; exit 1; fi
stage=$(mktemp -d .equipment-update.XXXXXX)
trap 'rm -rf "$stage"; rmdir "$lock" 2>/dev/null || true' EXIT
base_url="https://raw.githubusercontent.com/bai-qi-laundering/equipmentmanager/$release_ref"
files='server/Dockerfile server/package.json server/package-lock.json server/server.js server/device-policy.mjs server/inspection-rules.mjs server/reminders.mjs public-gateway.mjs backup-nas.sh'
echo "下載更新版本：$release_ref"
for file in $files; do
 mkdir -p "$stage/$(dirname "$file")"
 curl -fL --connect-timeout 20 --max-time 120 "$base_url/$file" -o "$stage/$file"
 test -s "$stage/$file"
done
# Preserve the NAS's original Compose files, database credentials and data directory.
if test -f public-api.env && ! test -f docker-compose.public.yml; then
 curl -fL --connect-timeout 20 --max-time 120 "$base_url/docker-compose.public.yml" -o "$stage/docker-compose.public.yml"
 test -s "$stage/docker-compose.public.yml"
fi
project=$(docker inspect equipment-api --format '{{ index .Config.Labels "com.docker.compose.project" }}')
if test -z "$project" || test "$project" = '<no value>'; then echo '停止：無法確認原有 Compose 專案'; exit 1; fi
compose(){
 if docker compose version >/dev/null 2>&1; then docker compose -p "$project" "$@";
 else docker-compose -p "$project" "$@"; fi
}
# Validate downloaded text with the already running Node container before replacing anything.
for file in server/server.js server/device-policy.mjs server/inspection-rules.mjs server/reminders.mjs public-gateway.mjs; do
 docker exec -i equipment-api node --input-type=module --check < "$stage/$file"
done
for file in server/package.json server/package-lock.json; do
 docker exec -i equipment-api node -e 'JSON.parse(require("fs").readFileSync(0,"utf8"))' < "$stage/$file"
done
stamp=$(date +%Y%m%d-%H%M%S)-$$
mkdir -p "backups/update-$stamp"
backup_dir="backups/update-$stamp"
echo '備份完整資料庫（含照片）…'
docker exec equipment-db sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup_dir/database.dump.partial"
test -s "$backup_dir/database.dump.partial"
mv "$backup_dir/database.dump.partial" "$backup_dir/database.dump"
for file in $files docker-compose.yml docker-compose.public.yml docker-compose.update.yml .env public-api.env equipment-push.env; do
 if test -f "$file"; then mkdir -p "$backup_dir/$(dirname "$file")"; cp -p "$file" "$backup_dir/$file"; fi
done
# Recover working push keys from the running container, not just from .env.
# This preserves existing iPhone subscriptions when keys were entered directly in Compose.
docker exec equipment-api node -e 'for(const key of ["VAPID_PUBLIC_KEY","VAPID_PRIVATE_KEY","VAPID_SUBJECT","PUSH_ADMIN_TOKEN"]){const value=process.env[key];if(value){if(/[\r\n]/.test(value))throw Error("invalid push setting");console.log(key+"="+value)}}' > "$stage/running.env"
value(){
 name=$1
 for source in "$stage/running.env" equipment-push.env; do
  if test -f "$source"; then
   result=$(sed -n "s/^$name=//p" "$source" | head -n 1)
   if test -n "$result"; then printf '%s' "$result"; return; fi
  fi
 done
}
pub=$(value VAPID_PUBLIC_KEY)
priv=$(value VAPID_PRIVATE_KEY)
if test -z "$pub" && test -z "$priv"; then
 docker exec equipment-api node --input-type=module -e 'import webpush from "web-push";const k=webpush.generateVAPIDKeys();console.log("VAPID_PUBLIC_KEY="+k.publicKey+"\nVAPID_PRIVATE_KEY="+k.privateKey)' >> "$stage/running.env"
 pub=$(value VAPID_PUBLIC_KEY); priv=$(value VAPID_PRIVATE_KEY)
fi
if test -z "$pub" || test -z "$priv"; then echo '停止：原推播金鑰不完整，未替換金鑰或重建容器'; exit 1; fi
subject=$(value VAPID_SUBJECT)
subject=${subject:-mailto:equipment@baiqi.local}
admin=$(value PUSH_ADMIN_TOKEN)
if test -z "$admin" && test -f public-api.env; then admin=$(sed -n 's/^API_ACCESS_KEYS=//p' public-api.env | head -n 1 | cut -d, -f1); fi
printf 'VAPID_PUBLIC_KEY=%s\nVAPID_PRIVATE_KEY=%s\nVAPID_SUBJECT=%s\nPUSH_ADMIN_TOKEN=%s\n' "$pub" "$priv" "$subject" "$admin" > "$stage/equipment-push.env"
# Use scoped environment variables so .env/database settings remain untouched.
EQUIPMENT_UPDATE_VAPID_PUBLIC_KEY=$pub
EQUIPMENT_UPDATE_VAPID_PRIVATE_KEY=$priv
EQUIPMENT_UPDATE_VAPID_SUBJECT=$subject
EQUIPMENT_UPDATE_PUSH_ADMIN_TOKEN=$admin
export EQUIPMENT_UPDATE_VAPID_PUBLIC_KEY EQUIPMENT_UPDATE_VAPID_PRIVATE_KEY EQUIPMENT_UPDATE_VAPID_SUBJECT EQUIPMENT_UPDATE_PUSH_ADMIN_TOKEN
cat > "$stage/docker-compose.update.yml" <<'YAML'
services:
  api:
    build: ./server
    environment:
      INSPECTION_PUSH_ENABLED: "true"
      VAPID_PUBLIC_KEY: ${EQUIPMENT_UPDATE_VAPID_PUBLIC_KEY}
      VAPID_PRIVATE_KEY: ${EQUIPMENT_UPDATE_VAPID_PRIVATE_KEY}
      VAPID_SUBJECT: ${EQUIPMENT_UPDATE_VAPID_SUBJECT}
      PUSH_ADMIN_TOKEN: ${EQUIPMENT_UPDATE_PUSH_ADMIN_TOKEN}
YAML
for file in $files equipment-push.env docker-compose.update.yml; do mkdir -p "$(dirname "$file")"; mv "$stage/$file" "$file"; done
if test -f "$stage/docker-compose.public.yml"; then mv "$stage/docker-compose.public.yml" docker-compose.public.yml; fi
# Keep the database service running; do not reconcile or recreate it.
if test -f public-api.env && test -f docker-compose.public.yml; then
 compose -f docker-compose.yml -f docker-compose.public.yml -f docker-compose.update.yml config --quiet
 compose -f docker-compose.yml -f docker-compose.public.yml -f docker-compose.update.yml build api
 compose -f docker-compose.yml -f docker-compose.public.yml -f docker-compose.update.yml up -d --no-deps --force-recreate api gateway
else
 compose -f docker-compose.yml -f docker-compose.update.yml config --quiet
 compose -f docker-compose.yml -f docker-compose.update.yml build api
 compose -f docker-compose.yml -f docker-compose.update.yml up -d --no-deps --force-recreate api
 echo '尚無公開閘道設定；員工外網連線仍需設定閘道。'
fi
attempt=0
until docker exec equipment-api node -e 'fetch("http://127.0.0.1:3000/api/health").then(r=>r.json()).then(j=>{if(j.ok!==true||j.deviceWriteVersion!==1||j.repairVersion!==1||!j.pushReady||!j.reminders?.enabled)process.exit(1);console.log(JSON.stringify(j))}).catch(()=>process.exit(1))'; do
 attempt=$((attempt+1))
 if test "$attempt" -ge 30; then echo "更新未通過健康檢查，備份位於 $backup_dir，請提供本次日誌"; exit 1; fi
 sleep 1
done
if test -f public-api.env && test -f docker-compose.public.yml; then
 curl -sS --connect-timeout 5 --max-time 15 -X POST http://127.0.0.1:3001/api/device-inspection-sync > "$stage/gateway-check.json"
 if ! grep -q 'device_authorization_required' "$stage/gateway-check.json"; then echo '公開閘道尚未通過新版路由檢查，請提供本次日誌'; exit 1; fi
fi
printf '%s\n' "$release_ref" > equipment-update-version
echo "更新完成；資料庫與原有密碼設定保留。備份：$backup_dir"
