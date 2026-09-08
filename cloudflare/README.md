# Cloudflare 審核台

此資料夾是「待審核收件匣」的後端：Cloudflare Worker 提供 API，D1 保存候選人線索、審核狀態及操作紀錄。GitHub 是開發與版本控制來源；Cloudflare 是日後的正式服務平台。完整環境切分請看 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 已建立的資源

- D1：`culture-governance-review`
- D1 ID：`6b8eb904-9b6a-4d92-ae54-9b71db14bba1`

## 部署前必要設定

1. 在 Cloudflare Worker 設定 `ALLOWED_EMAIL`，只允許該信箱讀寫 `/api/review/*`。
2. 以 secret 設定 `INGEST_TOKEN`，供每日研究匯入新線索使用；不可提交到 Git。
3. 在 D1 Console 執行 `schema.sql`。
4. 以 Wrangler 部署 staging：`npx wrangler deploy --config cloudflare/wrangler.toml --env staging`。
5. 為 Worker 的審核入口設定 Cloudflare Access，再把日常審核頁改為呼叫 `/api/review/items`。

公開端點 `/api/public/candidates` 只會回傳 `approved` 的候選人資料。
