# 文化治理觀察站｜2026 台灣地方選舉

公開追蹤候選人文化政見，並整理地方政府文化預算、實際支出與重點施政。

## 原則

- 政見與競選活動、個人經歷分開。
- 每筆候選人資料保留來源、發布日、最後查核日與更正紀錄。
- 預算與決算分開，並註明統計口徑。
- 未完成查核的資料不先行發布。

## 自動蒐集

GitHub Actions 每天臺灣時間 10:30 搜尋 22 縣市的候選人文化政見相關來源，新增至 `data/inbox/candidate_sources.csv`。蒐集結果不會直接公開，必須人工查核。

## 手動更新

候選人正式資料編輯 `data/input/candidates.csv`；地方文化預算、實際支出及統計口徑編輯 `data/input/governments.csv`。完整步驟見 `docs/manual-update.md`。

推送至 `main` 後，GitHub Actions 會驗證 CSV、自動計算比例、產生 JSON 並部署 GitHub Pages。

## 本機預覽

執行 `npm run build`，再於 `dist` 目錄啟動靜態伺服器。
