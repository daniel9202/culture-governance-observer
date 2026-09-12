# 本機 AI 雲端審核流程

中央資料庫是 Google Sheet「文化治理觀察站－雲端審核資料庫」：

https://docs.google.com/spreadsheets/d/1ulT-xd19TY7TsUcC9jBjvHh30ZuUnSbja3bJp2fNh_k/edit

雲端審核台：

https://script.google.com/macros/s/AKfycbwpUyeWrJ4naNd2SqWHopD51EpJOT4po5Pg1TtpZB3bUWAOI3q8R-Trb0e91QMtL5u61g/exec

## 正式流程

1. GitHub Actions 每日執行 `scripts/collect_candidates.py`，只更新 `data/inbox/`。
2. 本機 Codex 定時工作比較 GitHub inbox 與 Google Sheet 的來源網址，將新來源加入 Sheet，狀態設為 `pending` / `queued`。
3. Codex 每次只認領最多 10 筆：先寫入 `processing`、處理者／裝置與 30 分鐘鎖定期限，再讀取正文。
4. Codex 將 AI 摘要、分類、理由、信心與結構化政策欄位寫回 Sheet，AI 處理狀態改為 `complete`；審核狀態仍維持 `pending`。
5. 人工在雲端審核台接受或拒絕。只有 `accepted` 會進入發佈階段。
6. 本機 Codex 將 accepted 資料寫入正式 CSV，執行 `scripts/build_data.py`，測試後提交並推送 GitHub；成功後把 Sheet 狀態改為 `published` 並記錄發布 ID。
7. GitHub Pages 由既有部署工作流程上架。

## 跨電腦規則

- Google Sheet 是唯一的處理進度來源，不使用 OneDrive 同步工作目錄。
- 每台電腦都應使用獨立裝置名稱；不得處理尚未到期、且由其他裝置標記為 `processing` 的資料。
- 鎖定逾期後可重新認領。完成或失敗時都要清除鎖定期限。
- 同一個來源網址只保留一筆；新增前必須先比對 Sheet 與前台正式資料。
- 另一台電腦登入同一 Codex 帳號後，可使用本文件內容建立相同定時工作；是否實際執行仍取決於該電腦的 Codex 本機排程是否啟用。

## Sheet 佇列欄位

- U `AI處理狀態`: `queued`、`processing`、`complete`、`error`、`reviewed`
- V `處理者／裝置`
- W `鎖定至`
- X `AI完成時間`
- Y `AI錯誤`

本流程使用 Codex 帳號額度與已連線的 Google Drive，不需要 `OPENAI_API_KEY` 或 `GOOGLE_SERVICE_ACCOUNT_JSON`。GitHub 的舊 API 摘要步驟已停用；舊發佈工作流程僅保留手動緊急備援。
