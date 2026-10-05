# 洗滌廠設備管理地圖

目前版本 V14：固定設備平面地圖，可用手機或滑鼠拖曳、縮放。點選設備可編輯名稱、廠商及維修紀錄；下排分類可查看各機台。

## NAS 共用查檢

查檢紀錄、排程與提醒偏好存入 PostgreSQL，照片在上傳前壓縮，列表只讀縮圖，點選才讀大圖。草稿和現場填寫人員姓名留在各裝置。離線資料先保存在本機，重新連線後補傳；同一筆資料衝突時需選擇版本，避免覆蓋。舊本機紀錄會依 ID 補傳，不清除資料。

查檢介面顯示同步狀態與「同步 NAS」按鈕。成功啟用後，可在另一裝置按此按鈕取得紀錄。兩裝置皆需能連線至 NAS 的 Tailscale 網址。第一次上傳舊紀錄前可用設定頁匯出查檢備份。

提醒唯一收件人：設備組組長簡通延。此版本僅保存提醒設定，LINE 自動發訊尚未啟用。

## 更新 NAS 容器

先在 Synology DSM 手動執行既有的 `equipment-api-update` 排程任務（前提是該任務會拉取 main、重新建置並啟動 API）。若透過 SSH 管理，在既有專案目錄執行：

```sh
git pull --ff-only
docker compose up -d --build api
```

不要刪除 `data/postgres`，不要執行 `docker compose down -v`，不要用倉庫的範例密碼覆蓋現有設定。API 啟動時以 CREATE TABLE IF NOT EXISTS 建立新的查檢資料表，不清除設備資料。

開啟 `https://fileserver.tailbb066f.ts.net/api/health`，應包含 `ok:true`、`photoVersion:1`、`inspectionVersion:1`。若沒有 inspectionVersion，表示仍是舊容器。前端 https://bai-qi-laundering.github.io/equipmentmanager/?v=14 。

## 同步接口

GET /api/inspection-sync 讀取共用紀錄與排程；POST 同路徑以單一 entity 與 expectedRevision 更新。主鍵 kind/id，每笔版本檢查和寫入在資料庫交易中處理；衝突回傳 409。此接口沿用現有 NAS 網路存取設定，部署於既有受控網路。
