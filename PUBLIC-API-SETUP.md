# 設備地圖：員工免 Tailscale 連線

網頁仍由 GitHub Pages 提供。NAS 上的 API 經 HTTPS 公開入口提供設備、查檢及照片服務；PostgreSQL 和 DSM 管理介面不對外開放。現有的 `fileserver.tailbb066f.ts.net` 可在 API 已啟用存取金鑰後，改用 Tailscale Funnel 提供 HTTPS 入口。

## 啟用順序

1. 將新版 `server/server.js`、`docker-compose.public.yml`、`setup-public-api.sh` 放到 NAS 的 `/volume1/docker/equipment-manager` 對應位置。不要覆蓋 `data/postgres`，不要用倉庫內的範例資料庫密碼覆蓋 NAS 現有設定。
2. 在 NAS 上執行 `sh setup-public-api.sh`。它會建立 `public-api.env`（保留在 NAS，不上傳 GitHub），並使用 Compose overlay 重建 API。沒有金鑰時，新版 API 會拒絕啟動。
3. 確認本機 `GET /api/health` 回 200；`GET /api/layout` 未附金鑰回 401、附金鑰回 200。**完成這一步之後**，才設定 HTTPS 公開入口。
4. 在 NAS 的 Tailscale CLI 執行 `tailscale funnel --bg 3000`，如 CLI 所示完成 tailnet 管理員核准。Funnel 與 Serve 在同一個 HTTPS port 不可並用，切換後再從一支沒有 Tailscale 的手機測 `https://fileserver.tailbb066f.ts.net/api/health`。不要對外發布 5432、DSM 5000/5001 或其他 NAS 連接埠。
5. 開啟 GitHub Pages 網頁的啟用連結：`https://bai-qi-laundering.github.io/equipmentmanager/?v=16#access=這台手機的64碼金鑰`。網頁將金鑰保存在這支裝置，並從網址列移除。別把啟用連結張貼在公開地方；設備系統網址本身不含金鑰。
6. 在兩支不同網路的手機分別編輯一筆**可逆的測試資料**，按「同步資料」，確認彼此能讀到。接著測查檢紀錄與縮圖、大圖。照片仍經 NAS API 儲存，只有點開大圖時才下載大圖。

每支手機只需開啟一次啟用連結，不必安裝 Tailscale，也不必登入 NAS。可以在 `public-api.env` 中以逗號分隔多組金鑰；撤銷一組後重新建立 API 容器即可。管理員應為不同員工發不同金鑰，以便單獨撤銷。**這個金鑰代表設備系統的存取權；它不是 NAS 管理員帳號。**

若 Synology 安裝的 Tailscale 套件不提供 Funnel CLI，改用具備 HTTPS 的反向代理或 Tunnel 將**只有 API 服務**發布到公開網址，然後把 `index.html` 的 `API_BASE` 改成該網址。不得直接公開未受保護的 API。若要使用非 `fileserver.tailbb066f.ts.net` 的網域，先確認 CORS 與前端設定，再提供啟用連結。

### 後續更新

舊的 `equipment-api-update` DSM 排程任務只載入預設 Compose 檔，更新後可能讓 API 因缺少金鑰而拒絕啟動。之後重建 API 須始終使用：

```sh
docker compose -p "$(docker inspect equipment-api --format '{{ index .Config.Labels "com.docker.compose.project" }}')" -f docker-compose.yml -f docker-compose.public.yml up -d --build --no-deps api
```

上述指令須在 `/volume1/docker/equipment-manager` 執行，舊版 Docker Compose 則將 `docker compose` 換成 `docker-compose`。
