# 設備地圖：員工免 Tailscale 連線

GitHub Pages 仍提供網頁；NAS 的 PostgreSQL 繼續保存設備、查檢及照片。現有私人 API（Tailscale Serve 的 443）保留。新增的閘道只接受設備系統 API 請求，用另一個 HTTPS port 8443 提供員工手機使用；DSM 和 PostgreSQL 不公開。

## 啟用順序

1. 將 `setup-public-api.sh` 放到 NAS `/volume1/docker/equipment-manager`。不要更動 `data/postgres` 或現有資料庫密碼。
2. 在 NAS 執行 `sh setup-public-api.sh`。腳本會下載固定提交的 `public-gateway.mjs` 和 `docker-compose.public.yml`、建立只存於 NAS 的 `public-api.env`、啟動獨立閘道，再測未授權 401 與授權 200。舊的 `equipment-api` 仍照常運作。
3. 閘道測試全部通過後，在 NAS 的 Tailscale CLI 執行 `tailscale funnel --bg --https=8443 3001`，完成管理員核准。這不會佔用目前 Serve 的 443。從**沒有連 Tailscale**的手機測 `https://fileserver.tailbb066f.ts.net:8443/api/health`；應回健康 JSON。不要開放 DSM、5432 或 3000 連接埠。
4. 開啟啟用連結 `https://bai-qi-laundering.github.io/equipmentmanager/?v=16#access=64碼金鑰`。網頁把金鑰存在手機瀏覽器，並從網址列移除。啟用連結可以被轉傳，請私下交給授權人員；若外流要撤銷該金鑰。
5. 在兩支手機用測試設備編輯一筆可逆資料，按同步並互相確認；再測查檢與照片。照片上傳前壓縮，列表讀縮圖，點開才讀大圖。

員工不用安裝 Tailscale，也不用登入 NAS。金鑰是設備系統的使用權，**不是 NAS 管理員帳號**。`public-api.env` 可以放多組逗號分隔的 64 位金鑰，方便分別撤銷；正式發放應每人一組。只修改 `public-api.env` 後須重建 gateway 容器。

若 NAS 的 Tailscale 套件沒有 Funnel CLI，可改用 HTTPS 反向代理／Tunnel 公開**這個閘道**，並修改前端的 `API_BASE` 為新網址；不可直接公開私人 API。Tailscale Funnel 有流量限制，實際照片上傳速度仍須用手機驗證。

### 後續更新

原有 `equipment-api-update` 任務更新 `api` 不影響閘道。重建閘道時須連同 overlay：

```sh
cd /volume1/docker/equipment-manager
PROJECT=$(docker inspect equipment-api --format '{{ index .Config.Labels "com.docker.compose.project" }}')
docker compose -p "$PROJECT" -f docker-compose.yml -f docker-compose.public.yml up -d --no-deps gateway
```
