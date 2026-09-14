# 本機 AI 雲端審核流程

更新日期：2026-09-14（Asia/Taipei）

## 主機與資料責任

- `Danasus` 是唯一的自動化與 GitHub 發布主機；其他電腦的同名排程必須暫停。
- Google Sheet 是唯一的處理佇列與人工審核紀錄；Google Apps Script 是人工審核台。
- Google Drive 只存研究原料與附件；GitHub `main` 只存正式網站與已核准資料。
- Sheet ID 與 Apps Script 端點是部署設定，僅存於受控本機操作手冊或應用程式設定，不可提交 Git。

## 每 15 分鐘流程

1. 最多認領 20 筆 `queued`。
2. 僅認領未鎖定，或其他裝置鎖定已逾期的資料；立即寫入 `processing`、裝置 `Danasus` 與 30 分鐘鎖定期限。
3. 讀取原始來源後回填繁中摘要、分類、理由、信心與結構化政策欄位，改為 `complete`；審核狀態維持 `pending`。
4. 來源內容不足或出錯時改為 `error` 並填錯誤原因；不得編造。
5. 對人工 `accepted` 但未發布的資料，先 pull、更新正式 CSV、執行 `npm run build`；成功後才 commit、push，最後在 Sheet 填入 `published` 與發布 ID。

## 安全條件

- 不使用 OpenAI API Key、Google Service Account、Cloudflare D1、GitHub PR 或 `data/inbox/` 當處理佇列。
- 不發布 `pending` 或僅有 AI 摘要的資料。
- 首次啟用必須完成一筆「認領 → AI 完成 → 人工接受 → 建置 → 發布」測試。
