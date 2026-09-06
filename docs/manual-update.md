# 手動更新流程

## 本機查核與自動上架（主要流程）

1. 執行 `python scripts/local_review.py`，開啟它印出的查核頁網址。
2. 選擇資料類型，逐筆開啟原始來源判讀，按 Yes 或 No 並填寫查核備註；每個決定會即時寫回待查核檔並推送。
3. 按 Yes 後在上架表單補齊欄位，按「確認上架」。系統會寫入 `data/input/` 的正式 CSV、執行 `scripts/build_data.py` 驗證並產生 JSON，再 commit 與 push。
4. 欄位缺漏、日期或網址格式錯誤、來源重複時會被擋下，正式檔案不會變動。

以下手動編輯流程適用於沒有經過待查核清單的資料，或需要修正既有資料的情況。

## 候選人文化政見

1. 查看 `data/inbox/candidate_sources.csv`。每日自動蒐集會把新來源加入此檔，`review_status` 預設為 `pending`。
2. 開啟來源，確認內容包含可辨識的政策主張、承諾、執行方式或資源配置。競選活動、拜會、個人經歷及一般價值宣示不收錄。
3. 將查核完成的資料新增至 `data/input/candidates.csv`。多個 `topics` 以 `|` 分隔；`office` 填 `縣市長` 或 `縣市議員`，網站據此分列於不同頁面。
4. 在待查核檔把 `review_status` 改成 `accepted` 或 `rejected`，並填寫 `review_note`。
5. `correction_log` 格式為 `YYYY-MM-DD｜修正說明`；多筆以 `||` 分隔。

## 地方民眾／團體文化政策訴求

1. 查看 `data/inbox/civic_policy_calls.csv`。此檔由每日自動蒐集建立，專門收錄地方居民、社區、協會、聯盟、藝文團體等對文化政策提出的具體呼籲。
2. 確認來源清楚說明訴求對象、政策方向或可執行要求；單純活動宣傳、募款、人物報導及一般價值宣示不收錄。
3. 將查核完成的資料新增至 `data/input/civic_policy_calls.csv`。多個 `topics` 以 `|` 分隔；`requested_action` 要具體記錄希望政府採取的行動。
4. 在待查核檔把 `review_status` 改為 `accepted` 或 `rejected`，並填寫 `review_note`。
5. 此類資料與候選人政見分開保存，不得轉錄為候選人的政策立場；每筆公開資料仍須保留原始來源、最後查核日與更正紀錄。

## 地方政府文化預算與支出

編輯 `data/input/governments.csv`，每一列為一個縣市的一個年度。

- `cultural_expenditure_budget`、`cultural_expenditure_final`：政事別文化支出的預算與決算，單位為新臺幣元。
- `bureau_budget`、`bureau_final`：文化局（處）機關別預算與決算，單位為新臺幣元。
- `total_budget`：同年度地方政府總預算。
- `bureau_scope_note`：註明文化局（處）是否兼辦觀光，以及年度中改制等口徑差異。
- `methodology`：統計口徑與計算說明。
- `official_source_url`：預算書、決算書或官方統計原始網址。
- `key_policies`：重點施政，以 `|` 分隔。

比例由系統自動計算，不要手動輸入。政事別文化支出和文化局（處）預決算不可混用；若金額尚未取得，可留空，但仍需填寫來源與口徑後再公開該筆資料。

## GitHub 網頁操作

1. 開啟 CSV，點鉛筆圖示。
2. 新增或修改資料列，不要更動第一列表頭。
3. 點 `Commit changes`。
4. 推送至 `main` 後，部署流程會先驗證資料；驗證通過才更新公開網站。

## 自動蒐集設定

- 執行時間：每天臺灣時間 10:30。
- 搜尋範圍：22 縣市、最近 45 日；候選人政見與民間文化訴求各每縣市最多 15 筆。
- 候選人政見目前只搜尋已完成登記的民進黨、國民黨及民眾黨縣市長候選人；名單維護於設定檔的 `candidates_by_city`。
- 經確認的候選人競選官網維護於 `official_sites`；蒐集器會另做官網網域限定搜尋。未確認為本人或競選團隊營運的網站不得加入。
- 設定檔：`config/collector.json`。
- 手動執行：GitHub → Actions → `Collect candidate policy sources` → `Run workflow`。

自動蒐集結果不會直接出現在公開網站。

## 政見實現追蹤

編輯 `data/input/pledge_fulfillment.csv`。`status` 只接受 `fulfilled`、`partial`、`in_progress`、`no_verified_progress`、`not_assessable`。主要證據填 `evidence_source_title` 與 `evidence_source_url`；補充佐證填 `additional_evidence`，格式為 `標題::網址`，多筆以 `||` 分隔，網址會在建置時驗證。修改既有判定時在 `correction_log` 留下紀錄。
