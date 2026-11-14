# 審核台「比對與發布」需求

2026-11-14 設計端整理，使用者定案。實作由資料端負責（`apps-script/`）。這是正式功能，不是臨時工具。

## 目標

核准前，使用者要能在審核台逐筆並排看到「來源原文」「本站既有相關政見」「本次建議寫入內容」，決定這筆要怎麼寫、寫進哪一筆，並看到最後準備寫入的完整文字。寫入 CSV 的 AI 只照審核台的決定寫，不再自己判斷（見 `AGENTS.md`「審核台決定怎麼寫，AI 照寫不改」）。

## 流程

| 步驟 | 誰 | 在哪 | 審核狀態 |
| --- | --- | --- | --- |
| 1. 收進來 | Apps Script 自動蒐集，或 AI 研究批次匯入 | Sheet「審核資料」 | `pending`（研究批次可直接 `accepted`，見下方） |
| 2. 是不是文化政見 | 使用者 | 「資訊蒐集」分頁：接受／拒絕／拆分 | → `accepted`／`rejected`／`split` |
| 3. 比對：寫成什麼、寫進哪一筆 | 使用者 | 「比對與發布」分頁 | → `ready_to_write`／`pending_check`（待查）／`not_included`（不收錄） |
| 4. 寫入 CSV | Codex 或 Claude Code | 讀 `ready_to_write` → `data/input/` → `npm run build` | → `written` |
| 5. 上線 | 使用者確認 | beta → 公測站 → staging → main | — |

使用者在對話中手動貼的來源不經審核台（見 `AGENTS.md`），本功能不處理。

## 分頁調整

| 現在 | 改成 |
| --- | --- |
| 資訊蒐集 | 不變。現有「疑似重複」提示擴充：來源網址已出現在 CSV 某筆的 `source_url` 或 `related_sources` 時，顯示「來源已收錄於 &lt;id&gt;」 |
| 準備上架 | 拿掉。`accepted` 的資料改在「比對與發布」出現 |
| AI 整合稿 | 改為「比對與發布」。狀態篩選：待比對（`accepted`）／待查／待寫入／已寫入／不收錄。「整合草稿」表停用，不刪，保留歷史 |

## 比對卡片

每筆一張卡，頂端是候選人、縣市、職務、政黨、審核狀態、AI 信心；有網址重複時顯示「來源已收錄於 &lt;id&gt;」。下面三欄並排（窄螢幕改直排）：

1. **來源原文**：來源名稱、日期、網址、原文。被 ③ 引用的句子反白，方便檢查是否照貼、有無加字。
2. **本站既有相關政見**：同一候選人的既有政見下拉選單，依政策內容相似度排序（`policy_title`、`concrete_proposals`、`topics`），另有「無對應」選項。顯示選中那筆的 `policy_title`、`summary`、`concrete_proposals`、`source_url`、`last_verified`、`correction_log`。
3. **本次建議寫入內容**：可編輯。逐欄與 ② 比較，新增文字綠底、刪除文字紅底刪除線；沒變的欄位收起。操作是「新增政見」時不做差異標示，改標出哪些句子取自 ①。

卡片下方：

- 五種操作（單選）與「原筆 ID」下拉。
- **最後寫入預覽**：完整欄位文字（不是差異）、操作、原筆 ID、要追加的 `correction_log` 一行。③ 修改時即時更新。
- 按鈕：「核准，送交寫入」「退回資訊蒐集」。必填未填時核准鈕停用。

## 五種操作

| 操作 | 何時用 | 寫入 CSV 的結果 | 必填 | 核准後狀態 |
| --- | --- | --- | --- | --- |
| 新增政見 | 同候選人沒有對應主張 | 新增一列，新 ID | ③ 內容 | `ready_to_write` |
| 更新既有資料 | 同一主張，來源多了內容或更正 | 改原筆欄位；`correction_log`、`related_sources` 只追加 | 原筆 ID、更正理由 | `ready_to_write` |
| 只補來源 | 內容無新資訊，只是另一個出處 | 原筆只追加 `related_sources`，必要時更新 `last_verified` | 原筆 ID | `ready_to_write` |
| 不收錄 | 非文化政見、重複、不可信 | 不寫入 | 原因（寫在人工備註） | `not_included` |
| 待查 | 要再查證 | 不寫入 | 待查事項（寫在人工備註） | `pending_check` |

更新時原筆 `id`、`publish_id` 不變。`correction_log` 追加格式：`日期｜更正理由｜來源網址｜審核者`。

## 比對規則

- 候選人以「縣市＋職務＋候選人」比對；② 只列同一候選人的政見。
- 網址只用來辨認來源重複，不用來判斷是不是同一項政見。網址重複時預設建議「只補來源」，但不自動選定。
- 相似度只用來排序，不自動選操作。

## 資料來源與欄位

### ② 的資料

- 用 `UrlFetchApp` 讀 GitHub 上 `beta` 分支的 `data/candidates.json`（公開、不需憑證、不呼叫 AI）。不讀正式站，避免比對到還沒上線的舊內容而重複新增。可快取數分鐘。

### ③ 的預設值

- 有「寫入內容」（AI 預填）時用它。
- 沒有時帶入現有「AI摘要」「政策主張／具體訴求」，由使用者修改。
- 審核台本身不呼叫付費 AI API。

### Sheet「審核資料」新增欄位

加在 `HEADERS` 尾端，舊列才不會錯位。名稱為暫名，實作前列出給設計端確認。

| 欄位 | 內容 |
| --- | --- |
| 處理方式 | 新增政見／更新既有資料／只補來源／不收錄／待查 |
| 對應原筆ID | 更新或只補來源時的 CSV `id` |
| 寫入內容 | ③ 的完整欄位，JSON，只放有值的 CSV 欄位（如 `policy_title`、`summary`、`policy_argument`、`concrete_proposals`、`topics`、`editor_notes`…） |
| 更正理由 | 更新時寫進 `correction_log` 的理由 |
| 寫入commit | AI 寫入後回填的 commit hash；實際 CSV `id` 沿用現有「發布ID」 |

審核狀態新增值：`ready_to_write`、`written`、`pending_check`、`not_included`，同步更新資料驗證清單（`ensureReviewStatusValidation_`）。CSV 欄位不變。

## AI 研究批次匯入

AI 自行搜尋整理的線索（例如 `data/research/mayor-scan-20261114/`）不算使用者手動提供，必須經過審核台。匯入規則：

- 每筆一列寫入「審核資料」。來源欄位照現有格式；「資料類型」照來源性質；「處理者／裝置」填 `<電腦>-<AI>`。
- 研究結果已判定與文化政策相關，狀態直接設為 `accepted`，進入「比對與發布」；AI 判定待查的設為 `pending_check`。
- 預填「處理方式」「對應原筆ID」「寫入內容」（照 CSV 欄位，`policy_title`、`concrete_proposals` 照「忠於原文」規則）。差異說明與限制寫進「AI判斷理由」；本站判讀寫進「寫入內容」的 `editor_notes`。
- 預填只是建議，使用者在比對頁可改任何一項。
- 研究檔格式若不符合上面的欄位，重跑研究或轉換後再匯入，不要為了某一批另做臨時頁面。

## 寫入 CSV（Codex、Claude Code 都適用）

1. 只處理 `ready_to_write`。開始前在「處理者／裝置」填 `<電腦>-<AI>` 鎖定，已被別人鎖定的跳過。
2. 照「寫入內容」原樣寫，不改字、不換筆、不合併。發現問題（原筆 ID 不存在、內容與來源不符、違反資料規則）就把狀態改成 `pending_check` 並在人工備註說明，不自行修正。
3. 更新既有資料：`id`、`publish_id` 不變；`correction_log`、`related_sources` 只追加。
4. 只補來源：只追加 `related_sources`，必要時更新 `last_verified`。
5. `npm run build` 通過後 commit，回填「寫入commit」並把狀態改成 `written`。推 beta 前照規則先經使用者確認。

## 實作與部署

- 照 `AGENTS.md` 的 clasp 規則：先 commit、推測試部署（@HEAD）給使用者實測，再建版本、更新既有正式部署；`BUILD` 字串、commit 訊息、交接文件部署紀錄三者一致。
- 測試部署與正式部署讀寫同一張 Sheet，實測請用真正要處理的資料（例如本次研究批次）。
- `saveIntegrationDecision` 與「整合草稿」表的讀取在新分頁上線後移除，表格本身保留。
