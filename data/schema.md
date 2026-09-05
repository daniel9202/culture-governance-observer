# 資料欄位

正式資料請編輯 `data/input/` 內的 CSV；JSON 由部署流程自動產生，不要直接修改。

## `candidates.csv`

每筆記錄包含：`id`、`city`、`office`、`candidate`、`party`、`topics`、`summary`、`published_date`、`source_title`、`source_url`、`source_type`、`last_verified`、`correction_log`。

## `civic_policy_calls.csv`

每筆記錄包含：`id`、`city`、`proposer`、`proposer_type`、`topics`、`summary`、`requested_action`、`published_date`、`source_title`、`source_url`、`source_type`、`last_verified`、`correction_log`。此類資料記錄地方居民或團體的政策訴求，不代表候選人立場。

## `governments.csv`

每筆記錄包含：`id`、`city`、`year`、`culture_budget`、`actual_spending`、`total_budget`、`total_spending`、`budget_scope`、`spending_scope`、`methodology`、`official_source_title`、`official_source_url`、`key_policies`、`last_verified`、`notes`。顯示金額及比例由系統產生。

## `region_metrics.csv`

每個縣市、年度一筆，記錄文化資產、文化場館、藝文活動、藝術節慶、藝文團體、街頭藝人，以及文化部補助地方政府與地方配合款。中央補助與配合款另列，不併入地方文化局預算或政事別文化支出。原始來源檔名保留於 `source_files`，並記錄 `source_url` 與 `last_verified`。
