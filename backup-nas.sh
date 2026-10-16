#!/bin/sh
set -eu
cd /volume1/docker/equipment-manager
umask 077
mkdir -p backups
stamp=$(date +%Y%m%d-%H%M%S)
target="backups/equipment-$stamp.dump"
trap 'rm -f "$target.partial"' EXIT
# A consistent PostgreSQL dump includes device registrations, text AND photo bytes.
docker exec equipment-db sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$target.partial"
test -s "$target.partial"
mv "$target.partial" "$target"
echo "完整資料庫備份完成：$target"
