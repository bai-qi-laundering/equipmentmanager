# 百麒洗滌廠設備管理

V19 / 同步 R4。固定設備平面地圖，手機及滑鼠可拖曳、縮放；設備位置、圖片與點擊範圍沿用現有配置。地圖疊加「異常、查檢逾期、今日查檢、停用」標記。

## 權限與資料

GitHub Pages 提供前端，公開閘道轉送 API，NAS PostgreSQL 儲存設備、查檢及照片。

- 管理端：以既有 `#access=...` 金鑰啟用，可修改設備、排程、提醒偏好、維修及異常處理結果。
- 員工端：一次性 QR Code 註冊取得可撤銷的裝置 token，可讀取共用資料、新增查檢、上傳照片。不得修改設備、排程或既有查檢。相同紀錄重送不新增第二筆。
- 新維修紀錄改存 `equipment_repairs`，每筆獨立 ID，可安全重試；啟動時將舊備註內的維修紀錄依 ID 複製進資料表，原備註及廠商資料保留。
- 查檢保留預期版本與 409 衝突檢查；照片上傳前壓縮，列表讀縮圖、點開讀大圖。本機草稿與待傳資料保留，恢復網路後補傳。
- 員工成功提交清潔紀錄後，由後端同一交易更新設備上次清潔日期，不需給員工設備編輯權限。

設備地圖每 15 秒、查檢每 30 秒於前景嘗試刷新；編輯中不打斷。開啟中的網頁可暫存離線填寫，但目前不提供離線重新啟動整個網站的資源快取。

## NAS 更新

此更新方式不需要 NAS 安裝 Git，也不要求專案目錄是 Git checkout。將以下內容放入 DSM 更新任務：

```sh
set -eu
PATH=/usr/local/bin:/usr/bin:/bin:/var/packages/ContainerManager/target/usr/bin:$PATH
export PATH
cd /volume1/docker/equipment-manager
exec > update-system.log 2>&1
date
curl -fL --connect-timeout 20 --max-time 120 https://raw.githubusercontent.com/bai-qi-laundering/equipmentmanager/main/update-system.sh -o update-system.sh.download
mv update-system.sh.download update-system.sh
sh update-system.sh
```

腳本下載固定的 V19 提交 `0e4e9d5eaee2a5056e980db78cd6436d31048fe8`，所有程式下載及語法檢查成功後，先備份含照片的完整資料庫及舊程式，再更新 API 和公開閘道。下載失敗不替換程式；不重建資料庫服務。原有 `docker-compose.yml`、`.env`、`public-api.env` 及 `data/postgres` 保留。

推播設定優先沿用執行中 API 容器的金鑰，即使原先直接寫在 Compose 也保留，避免既有手機訂閱失效。僅在沒有任何金鑰時才產生新的金鑰。設定存於僅 NAS 可讀的 `equipment-push.env`，透過 `docker-compose.update.yml` 套用；日後也請使用本更新腳本重建 API，避免遺漏這份 overlay。首次沒有管理員授權碼時會沿用既有公開存取金鑰。

執行日誌：`update-system.log`。成功時會印出健康檢查及「更新完成」。資料庫／舊程式備份位於 `backups/update-日期時間/`。請勿將私密設定檔或備份上傳 GitHub，不要執行 `docker compose down -v`。

健康檢查：`https://fileserver.tailbb066f.ts.net:8443/api/health` 應包含 `deviceWriteVersion:1`、`repairVersion:1`。`reminders.enabled:true` 代表 NAS 提醒工作已啟用，仍需組長的有效訂閱才能收到通知。GitHub 更新不會自動更新 NAS。

## 自動提醒

共用排程規則在 `server/inspection-rules.mjs`，前端及 NAS 使用相同清單、週期與到期日計算。NAS 每分鐘檢查一次，依台灣時間及提前 0／1／3 天設定彙總已逾期／即將到期項目，只傳給註冊姓名為「簡通延」的有效裝置，每台每天一則。停用設備不列入；未設定首次到期日的項目不會自行猜測日期。

組長需從 iPhone 主畫面 App 允許通知並完成一次性 QR 註冊，再按「傳送測試通知」。LINE 發訊未加入；此版使用 Web Push。API 必須持續運作；暫時失敗會重試，推播服務接受通知不等於裝置保證響鈴。

更新腳本透過專用 overlay 啟用 `INSPECTION_PUSH_ENABLED=true`，並沿用 `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT` 及 `PUSH_ADMIN_TOKEN`。已有 VAPID 金鑰不可隨意更換，否則舊訂閱需重新註冊。

## 完整備份

網頁「匯出查檢備份」是文字紀錄及照片索引，不含照片檔案。完整備份請在 NAS 執行：

```sh
sh /volume1/docker/equipment-manager/backup-nas.sh
```

檔案存於 `backups/equipment-日期時間.dump`，包含資料庫內的照片、查檢、設備、維修、裝置註冊。請另備份 NAS 的 `.env`、`public-api.env` 及 Compose 設定至受保護位置；不要上傳 GitHub。資料庫備份應另複製至其他磁碟或備份系統。可用 `pg_restore --list` 檢查 dump；還原前先備份目前資料，並在獨立資料庫演練。

## 地圖後續方向

正式頁維持目前插畫。獨立的 `equipment-3d-preview.html` 是尚未串接 NAS 的 2.5D 展示，不會改動正式管理資料。

建議後續使用每台設備的去背插畫、固定視角、統一比例與陰影，維持既定座標；架高設備以切換圖層呈現。圖片、標籤、點擊範圍共用一份設備資料，不再靠裁切整張圖移動設備。這能維持插畫品質並加入狀態、查檢與維修互動，無需重建粗略的可旋轉模型。

## 開發驗證

```sh
cd server
npm ci
npm test
```

測試包含 PostgreSQL 相容引擎的 API 整合、閘道權限、重試去重、舊維修遷移、提醒對象及時間、DOM 操作與管理／員工介面。測試推播使用替身，不會發送真實訊息；DOM 測試不代替實機 iPhone 視覺、手勢與通知驗證。

免 Git 更新腳本的隔離測試：`python tests/test_nas_update.py`（不連 NAS、不執行真實 Docker、不下載網路檔案）。
