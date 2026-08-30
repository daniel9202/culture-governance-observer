# 資料欄位

正式資料請編輯 `data/input/` 內的 CSV；JSON 由部署流程自動產生，不要直接修改。

## `candidates.csv`

每筆記錄包含：`id`、`city`、`office`、`candidate`、`party`、`topics`、`summary`、`published_date`、`source_title`、`source_url`、`source_type`、`last_verified`、`correction_log`。

## `governments.csv`

每筆記錄包含：`id`、`city`、`year`、`culture_budget`、`actual_spending`、`total_budget`、`total_spending`、`budget_scope`、`spending_scope`、`methodology`、`official_source_title`、`official_source_url`、`key_policies`、`last_verified`、`notes`。顯示金額及比例由系統產生。
