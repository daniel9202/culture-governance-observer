# 資料更新流程

更新日期：2026-10-08（Asia/Taipei）

現行規則以 repo 根目錄的 `AGENTS.md` 為準，本檔只展開操作細節；兩者衝突時以 `AGENTS.md` 為準並回報使用者。佇列與自動化的運作條件見 `LOCAL-AI-REVIEW-AUTOMATION.md`，換機與鎖定規則見 `MULTI-COMPUTER-WORKFLOW.md`。

## 現行流程

```text
Apps Script 自動蒐集 → Google Sheet「審核資料」
→ 使用者在 Apps Script 審核台核准（核准前不得公開）
→ 資料端 AI 讀已核准資料 → 寫入 data/input/*.csv → npm run build
→ 使用者手動確認 → push → GitHub Actions → GitHub Pages
```

- `data/input/*.csv` 是唯一正式資料來源。Google Sheet 只是佇列與查核紀錄，**不能反向覆蓋 CSV**。
- `data/*.json` 與 `dist/` 都是 `npm run build` 的產物，不要直接編輯。
- 同一筆資料同一時間只由一個工作端處理，依 Google Sheet 的裝置與鎖定欄位判斷。
- 資料端 push GitHub、用 clasp 推 Apps Script 之前，都要先經使用者手動確認。
- Sheet ID、部署網址、憑證（`.secrets/`、`.clasp.json`）不得寫進 git、文件或聊天。

## 已停用的舊流程

下列做法都**不得啟用**，看到文件或程式提到就當成歷史紀錄：

| 舊做法 | 現況 |
| --- | --- |
| `scripts/local_review.py` 本機查核頁 | 停用。審核改在 Apps Script 審核台 |
| `data/inbox/*.csv` 待查核清單 | 停用。佇列改在 Google Sheet |
| `config/collector.json` 每日蒐集設定 | 停用。蒐集改由 Apps Script 執行 |
| `.github/workflows/collect-candidates.yml` | 已改成停用佔位，執行會直接失敗 |
| `.github/workflows/publish-reviewed.yml`（Service Account 發布） | 同上 |
| Cloudflare Worker／D1 發布與造訪統計 | 2026-10-03 移除前台相依，2026-10-08 移除 `cloudflare/` 原始碼 |
| GitHub source-lead PR 流程 | 停用 |

`scripts/local_review.py`、`data/inbox/`、`config/collector.json` 這三個還留在 repo 裡，但沒有任何現行流程讀它們。要不要刪屬於 `scripts/` 與 `config/` 的共用範圍，動手前先問使用者。

## 手動編輯

適用於修正既有資料，或補沒有經過佇列的資料。只編輯 `data/input/` 的 CSV，改完**一定要跑 `npm run build`**，不要更動第一列表頭。

### 共同規則

- 單層清單（`topics`、`key_policies`、`related_sources`、`source_files`）用 `|` 分隔。
- 多句欄位（`concrete_proposals`、`related_statements`、`correction_log`、`additional_evidence`、`editor_notes`、`candidates`）用 `||` 分隔。
- 日期一律 `YYYY-MM-DD`，網址要 `http`／`https`，建置時都會驗證。
- `city` 只接受 22 縣市的標準寫法：`臺北市`、`臺中市`、`臺南市`、`臺東縣` 用「臺」，不是「台」。
- `correction_log` 格式為 `YYYY-MM-DD｜修正說明`，多筆以 `||` 分隔。更正既有判定一定要留紀錄。
- 候選人官網與新聞報導講同一件事時，官網當主要來源，新聞放 `related_sources`。

### candidates.csv｜候選人文化政見

必填：`id`、`city`、`office`、`candidate`、`party`、`summary`、`published_date`、`source_title`、`source_url`、`last_verified`、`proposer_role`、`content_nature`、`role_evidence`。

- `office`：`縣市長` 或 `縣市議員`，網站據此分列於不同頁面。
- `party`：以中選會登記名冊的「推薦之政黨」為準。中選會寫「無」就填 `無黨籍`，**不要填 `無`**（建置不會報錯，但前台會當成未知政黨）。擔任政黨發言人不等於該黨推薦；「台灣前進」是聯盟不是政黨。
- `proposer_role`：`候選人`、`推定現任議員`、`待判定`。`推定現任議員` 依中選會本屆名冊與議會個人頁推定，前台必須註明並非議會官方認證；`待判定` 不套用現任標籤。
- `content_nature`：`本屆競選政見`、`現任議員個人頁內容`、`現任問政／提案`、`現任首長施政`。**前台的政見與統計只算 `本屆競選政見`**，其餘只出現在「現任追蹤」的議員分頁；留空或填其他值就不會進入政見統計。`現任首長施政` 只能搭 `office` 為 `縣市長`。
- `review_status`：`人工審核`（留空視同此值）或 `AI初審待複核`。
- `publish_id`：新增資料必填且不可重複。既有資料尚未回填，建置會跳 WARNING 但照常通過。
- `policy_title`：政見標題。2026-10-08 新增，尚未填值，前台也還沒引用。
- `policy_argument` 記整體政策論述，`concrete_proposals` 記可辨識的具體措施，`related_statements` 記可核實但未必構成承諾的相關發言。
- 收錄門檻：要有可辨識的政策主張、承諾、執行方式或資源配置。競選活動、拜會行程、個人經歷與一般價值宣示不收錄。

### civic_policy_calls.csv｜地方民眾及團體的文化政策訴求

必填：`id`、`city`、`proposer`、`proposer_type`、`summary`、`requested_action`、`published_date`、`source_title`、`source_url`、`last_verified`。

- `requested_action` 要具體寫出希望政府採取的行動。
- 收錄門檻：來源清楚說明訴求對象與政策方向。活動宣傳、募款、人物報導與一般價值宣示不收錄。
- **這類資料不得轉錄為候選人的政策立場**，與候選人政見分開保存。

### shared_policy_groups.csv｜共同政見

必填：`id`、`city`、`office`、`party`、`title`、`summary`、`published_date`、`source_title`、`source_url`、`last_verified`。`candidates` 以 `||` 分隔參與者，`scope` 記適用範圍。共同政見不可與候選人個人政見混為一類。

### local_cultural_issues.csv｜地方文化議題

必填：`id`、`city`、`title`、`issue_type`、`summary`、`published_date`、`source_title`、`source_url`、`last_verified`。`related_actor` 記相關人物或機關。

### pledge_fulfillment.csv｜現任追蹤

必填：`id`、`city`、`person`、`party`、`current_office`、`term`、`election`、`reelection_status`、`pledge_source_type`、`pledge_title`、`pledge_summary`、`pledge_date`、`pledge_source_title`、`pledge_source_url`、`responsibility`、`status`、`evidence_summary`、`last_verified`。

- `status` 只接受 `fulfilled`、`partial`、`in_progress`、`no_verified_progress`、`not_assessable`。
- 主要證據填 `evidence_source_title` 與 `evidence_source_url`；補充佐證填 `additional_evidence`，每筆格式 `標題::網址`，多筆以 `||` 分隔，網址建置時會驗證。
- 前台導覽名稱是「現任追蹤」，分「首長｜政見實現」與「議員｜任內問政」兩個分頁；議員分頁不顯示實現狀態。

### governments.csv｜地方政府文化預算與支出

每一列是一個縣市的一個年度。必填：`id`、`city`、`year`、`methodology`、`official_source_title`、`official_source_url`、`last_verified`。

- `cultural_expenditure_budget`、`cultural_expenditure_final`：政事別文化支出的預算與決算，單位新臺幣元。
- `bureau_budget`、`bureau_final`：文化局（處）機關別預算與決算，單位新臺幣元。
- `total_budget`：同年度地方政府總預算。
- `bureau_scope_note`：註明文化局（處）是否兼辦觀光，以及年度中改制等口徑差異。
- `methodology`：統計口徑與計算說明。`key_policies` 以 `|` 分隔。

比例由系統自動計算，不要手動輸入。政事別文化支出與文化局（處）預決算**不可混用**。金額未取得可留空，但來源與口徑要先填好才公開該筆。

### region_metrics.csv｜縣市文化統計

每個縣市、年度一筆，約 50 個數值欄位：文化資產（古蹟、歷史建築、聚落、考古遺址、傳統藝術、民俗等）、文化場館、藝文活動與參與人次、藝術節慶、藝文團體、街頭藝人，以及文化部「社區營造」與「博物館及地方文化館」計畫的中央核定補助與地方配合款（單位千元）。

必填：`id`、`city`、`year`、`source_title`、`source_url`、`last_verified`。補助欄位**只代表上述特定計畫**，不代表中央對地方的全部補助，也不併入地方文化局預算或政事別文化支出。原始檔名留在 `source_files`。

### registered_candidates.csv｜中選會登記名冊

必填：`city`、`office`、`district`、`candidate`、`party`、`registered_date`、`source_title`、`source_url`、`as_of`。`office` 只接受 `縣市長`、`縣市議員`。這份是政黨欄位的唯一依據，由 `scripts/import_cec_registrations.py` 從中選會 PDF 匯入；審定名單公告後要重跑並更新 `--as-of`，以及 `map.html` 底部「統計口徑」的人數與日期。

### data/research/

研究原料與整理筆記放這裡，不是正式資料，不會進入前台。

## 建置與名冊檢查

`npm run build` 會驗證所有 CSV、重建 `data/*.json` 與 `dist/`。只需要 Node 與 Python。

建置時會拿 `registered_candidates.csv` 比對候選人資料：

- **錯誤（建置失敗，不得發布）**：縣市不是 22 縣市標準寫法、`office` 不是 `縣市長`／`縣市議員`、政黨與中選會「推薦之政黨」不符、`publish_id` 重複、新增資料缺 `publish_id`、列舉欄位填了不在清單內的值。
- **警告（照常建置）**：名冊找不到該候選人或比對到多人、既有資料缺 `publish_id`。發布前確認姓名寫法，並在 Sheet 的人工備註註明。

欄位缺漏、日期或網址格式錯誤都會擋下建置，正式 JSON 不會變動。

## 收工

- **只 `git add` 自己範圍的檔案。** 禁止 `git add .`、`git reset --hard`、`git clean -fd`。
- 設計端要確認沒有把建置重產的 `data/` 檔案一起 stage。
- 資料端：`git pull --rebase`，經使用者確認後 `git push origin main`。
- 設計端：`git rebase origin/main`，再 `git push origin HEAD:main`。
- push 後回報固定格式：`commit hash｜筆數變化｜欄位是否變動｜內容分類｜待辦／風險`。

## 在 GitHub 網頁上改

1. 開啟 `data/input/` 的 CSV，點鉛筆圖示。
2. 新增或修改資料列，不要更動第一列表頭。
3. 點 `Commit changes`。

網頁操作不會跑 `npm run build`，`data/*.json` 不會更新，公開網站也不會跟著變。改完要在本機跑一次建置並提交產物。
