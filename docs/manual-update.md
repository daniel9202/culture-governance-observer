# 手動更新流程

## 候選人文化政見

1. 查看 `data/inbox/candidate_sources.csv`。每日自動蒐集會把新來源加入此檔，`review_status` 預設為 `pending`。
2. 開啟來源，確認內容包含可辨識的政策主張、承諾、執行方式或資源配置。競選活動、拜會、個人經歷及一般價值宣示不收錄。
3. 將查核完成的資料新增至 `data/input/candidates.csv`。多個 `topics` 以 `|` 分隔。
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

- `culture_budget`：文化預算，單位為新臺幣元。
- `actual_spending`：文化實際支出／決算數，單位為新臺幣元。
- `total_budget`、`total_spending`：同年度、同會計基礎的分母。
- `budget_scope`、`spending_scope`：是否包含文化局、所屬館舍、基金、附屬單位、資本門等。
- `methodology`：統計口徑與計算說明。
- `official_source_url`：預算書、決算書或官方統計原始網址。
- `key_policies`：重點施政，以 `|` 分隔。

比例由系統自動計算，不要手動輸入。若預算或決算尚未取得，可留空金額，但仍需填寫來源與口徑後再公開該筆資料。

## GitHub 網頁操作

1. 開啟 CSV，點鉛筆圖示。
2. 新增或修改資料列，不要更動第一列表頭。
3. 點 `Commit changes`。
4. 推送至 `main` 後，部署流程會先驗證資料；驗證通過才更新公開網站。

## 自動蒐集設定

- 執行時間：每天臺灣時間 10:30。
- 搜尋範圍：22 縣市、最近 45 日；候選人政見與民間文化訴求各每縣市最多 15 筆。
- 設定檔：`config/collector.json`。
- 手動執行：GitHub → Actions → `Collect candidate policy sources` → `Run workflow`。

自動蒐集結果不會直接出現在公開網站。
