# GitHub 開發、Cloudflare 正式服務架構

## 現在：原型／staging

- GitHub repository：程式碼、分支、PR、文件與原始資料的版本控制。
- `culture-review-api-staging`：可刪除、可重建的 Worker 測試環境。
- `culture-governance-review` D1：目前的審核資料庫，僅存空結構，尚未匯入資料。
- 不綁定自訂網域、不將 Worker 當公開正式網站，也不遷移 GitHub Pages。

## 之後：有網域與正式空間時

1. 建立獨立的 production D1，避免測試資料與正式審核紀錄混用。
2. 以 `culture-review-api` 部署 production Worker，綁定 production D1。
3. 將自訂網域分成公開網站與審核台，例如：
   - `www.<你的網域>`：公開 dashboard，只讀核准資料。
   - `review.<你的網域>`：Cloudflare Access 保護的審核台。
   - `api.<你的網域>`：Worker API；公開路徑只限核准資料，審核 API 限 Access 使用者。
4. Cloudflare Access 以 email 一次性驗證碼登入審核台；不需要自行維護密碼。
5. GitHub Actions／Codex 只更新 staging 或經受控 ingestion API 建立待審資料，永不直接公開資料。

## 原則

- GitHub 是開發與備份來源，不是日常審核入口。
- production 資料不由 Git commit 直接覆蓋；所有審核動作保留在 D1 `review_events`。
- 新網域尚未決定前，所有前端來源與 CORS 網域都以環境變數設定，不寫死在前端程式碼。
