#!/bin/sh
set -eu
PATH=/usr/local/bin:/usr/bin:/bin:/var/packages/ContainerManager/target/usr/bin:$PATH
export PATH
cd /volume1/docker/equipment-manager
git pull --ff-only
sh backup-nas.sh
project=$(docker inspect equipment-api --format '{{ index .Config.Labels "com.docker.compose.project" }}')
test -n "$project" && test "$project" != '<no value>'
compose(){
 if docker compose version >/dev/null 2>&1; then docker compose -p "$project" "$@";
 else docker-compose -p "$project" "$@"; fi
}
compose up -d --build api
# Preserve existing settings. New push keys are generated inside the API container.
# No secret values are printed or downloaded.
umask 077
touch .env
if ! grep -q '^VAPID_PUBLIC_KEY=' .env && ! grep -q '^VAPID_PRIVATE_KEY=' .env; then
 vapid=$(docker exec equipment-api node --input-type=module -e 'import webpush from "web-push";const k=webpush.generateVAPIDKeys();console.log("VAPID_PUBLIC_KEY="+k.publicKey+"\nVAPID_PRIVATE_KEY="+k.privateKey)')
 printf '\n%s\n' "$vapid" >> .env
fi
if ! grep -q '^INSPECTION_PUSH_ENABLED=' .env; then printf '\nINSPECTION_PUSH_ENABLED=true\n' >> .env; fi
if ! grep -q '^PUSH_ADMIN_TOKEN=' .env && test -f public-api.env; then
 key=$(sed -n 's/^API_ACCESS_KEYS=//p' public-api.env | head -n 1 | cut -d, -f1)
 if test "${#key}" -eq 64; then printf '\nPUSH_ADMIN_TOKEN=%s\n' "$key" >> .env; fi
fi
if test -f public-api.env; then
 compose -f docker-compose.yml -f docker-compose.public.yml up -d --build --force-recreate api gateway
else
 compose up -d --build --force-recreate api
 echo '尚未設定公開閘道；請依 PUBLIC-API-SETUP.md 設定後再測員工手機。'
fi
echo 'API 與閘道已更新。請檢查 /api/health 的 deviceWriteVersion、repairVersion 與 reminders.enabled。'
