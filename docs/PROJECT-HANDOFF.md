# 文化治理觀察站｜專案交接文件

更新日期：2026-10-01（Asia/Taipei；下午補上文化政見地圖進度）  
適用對象：接手本專案的另一台電腦、開發者或 AI。

## 專案目的

這是 2026 台灣地方選舉的文化治理資料網站。公開端整理：

- 縣市長與縣市議員的文化政見；
- 地方居民／團體提出的文化政策訴求（不等同候選人立場）；
- 地方文化預算、決算與施政口徑；
- 文化政策承諾的實現追蹤；
- 縣市文化資產、場館、活動與特定中央補助指標。

公開網站由 GitHub Pages 部署；目前主要審核流程使用 Google Sheet 與 Google Apps Script。Cloudflare Worker／D1 是未來或 staging 架構，**不是目前日常資料發布入口**。

## 快速開始（換電腦）

```powershell
git clone https://github.com/daniel9202/culture-governance-observer.git "D:\Projects\文化治理觀察站"
cd "D:\Projects\文化治理觀察站"
npm run build
```

需求：Node.js、Python 3。Windows 的 `npm run build` 會優先使用 `py -3`；若沒有 Python Launcher，會再尋找系統 Python 或 `.tools\python\python.exe`。

日常開始前先執行：

```powershell
git status --short --branch
```

只有在工作目錄乾淨時才執行 `git pull --rebase`。不要使用 `git add .`、`git clean -fd` 或 `git reset --hard`。

## 系統與資料流

```text
研究原料／來源
  → Google Sheet「審核資料」（pending → accepted/rejected/split）
  → Google Apps Script 審核台
  → Google Sheet「整合草稿」（draft_ready → published/rework）
  → 正式 CSV：data/input/
  → npm run build（驗證 CSV 並重建 JSON + dist）
  → main 分支 → GitHub Actions → GitHub Pages
```

重要規則：未經人工確認的資料不可公開；候選人個人政見、共同政見、民間訴求與政府統計資料不可混為同一類。

## 目錄與職責

| 位置 | 用途 | 是否手動編輯 |
| --- | --- | --- |
| `data/input/` | 唯一正式資料來源 CSV | 是 |
| `data/*.json` | 前台使用的衍生資料 | 否，透過建置產生 |
| `data/inbox/` | 歷史／暫存的來源收件資料 | 非現行佇列，勿作為新流程依據 |
| `scripts/build_data.py` | CSV 驗證與 JSON 產生 | 維護程式時才改 |
| `scripts/build-site.mjs` | 呼叫資料建置並輸出 `dist/` | 維護程式時才改 |
| 根目錄 `*.html`、`*.js`、`styles.css` | 靜態公開前台 | 是 |
| `apps-script/` | Google Apps Script 審核台（`Code.gs` 後端、`Index.html` 介面） | 是；修改後需另行部署 Apps Script |
| `.github/workflows/` | PR 驗證、main 分支 Pages 部署 | 是 |
| `config/` | 蒐集設定、官方來源與議題標籤 | 是，需審慎查核 |
| `cloudflare/` | 未來/staging 的 Worker + D1 審核服務 | 暫勿當日常發布流程 |
| `backups/` | 本機備份，現未納入 Git | 保留，不應隨意提交 |
| `dist/` | 可部署網站建置輸出 | 否，忽略檔 |

## 正式資料結構

所有 CSV 的完整欄位定義見 [`data/schema.md`](../data/schema.md)。目前筆數：

| 檔案 | 用途 | 筆數 |
| --- | --- | ---: |
| `candidates.csv` | 候選人文化政見 | 39 |
| `civic_policy_calls.csv` | 民間文化政策訴求 | 6 |
| `governments.csv` | 各縣市年度文化預決算 | 308 |
| `local_cultural_issues.csv` | 地方文化議題 | 4 |
| `pledge_fulfillment.csv` | 政策承諾實現追蹤 | 13 |
| `region_metrics.csv` | 區域文化指標 | 22 |
| `registered_candidates.csv` | 中選會登記參選人名冊（縣市長、議員；轉檔產生） | 1,583 |
| `shared_policy_groups.csv` | 政黨／區域共同政見 | 2 |

資料層級：

```text
data/input/*.csv       人工維護的來源事實與欄位
        ↓ build_data.py（格式、日期、URL、列舉值等驗證）
data/*.json            網頁載入的資料
        ↓ build-site.mjs
dist/                  GitHub Pages 發布內容
```

資料注意事項：

- `topics` 多值以 `|` 分隔；部分來源／更正等多值欄以 `||` 分隔，詳見 schema。
- `office` 目前限定 `縣市長`、`縣市議員`。
- 金額採新臺幣元；政事別文化支出與文化局（處）機關別預決算必須分開。
- `pledge_fulfillment.status` 僅可使用 `fulfilled`、`partial`、`in_progress`、`no_verified_progress`、`not_assessable`。
- JSON 不應直接編輯，即使 Git 顯示它有變更，也應以對應 CSV 和建置結果為準。

## 建置、驗證與部署

```powershell
npm run build
```

此命令先執行 `scripts/build_data.py`，成功後清空並重建 `dist/`，再複製公開前台檔案與資料 JSON。若要交付資料或程式修改，至少應確認此命令通過。

- Pull request 只要涉及 `data/input/**` 或 `scripts/build_data.py`，GitHub Actions 會執行資料驗證。
- 推送至 `main` 會建置 `dist/` 並部署 GitHub Pages。
- 公開前台連結目前為：<https://daniel9202.github.io/culture-governance-observer/>。

## 審核台與外部設定

- Apps Script 使用固定的 Google Sheet；Sheet ID、部署網址、權限及任何憑證不應寫進交接文件、commit 或公開聊天。
- `apps-script/Code.gs` 定義兩張工作表：`審核資料` 與 `整合草稿`，並對審核動作使用 Script Lock 避免多人同時覆寫。
- `config/collector.json` 是候選人／民間訴求蒐集範圍設定；改名單、官方站點或查詢字詞前要先查證。
- Cloudflare 所需的 `ALLOWED_EMAIL`、`INGEST_TOKEN` 等屬部署機密，僅在安全的服務設定中處理。

## 目前 Git 與工作進度（2026-10-01）

分支：`main`，追蹤 `origin/main`；最新已提交版本為 `258b933 Revert "feat: add cultural policy map"`。

**工作目錄目前不是乾淨狀態。接手者不得直接 pull、rebase、checkout 或丟棄變更。**

| 狀態 | 檔案／範圍 | 判讀 |
| --- | --- | --- |
| 修改中 | `apps-script/Index.html` | 在既有審核台加入「準備上架」工作區，以及審核後移除已處理卡片、避免逐筆整頁重載的介面調整。尚未 commit，需以實際 Apps Script 環境手動測試。 |
| 修改中 | `data/candidates.json`、`civic_policy_calls.json`、`governments.json`、`local_cultural_issues.json`、`pledge_fulfillment.json`、`region_metrics.json`、`shared_policy_groups.json` | 皆為衍生 JSON；很可能對應當前建置輸出。未先確認來源 CSV 與 `npm run build` 前，不要單獨提交。 |
| 未追蹤 | `backups/` | 含 `cloudflare-d1-20260914/` 的 D1 schema 與資料快照。視為本機備份，不應在未確認資料敏感性與需求前加入版本庫。 |
| 已提交 | `map.html`、`map.js`、`map-geometry.json`、`scripts/build_map_geometry.py` | 文化政見地圖，見下方「文化政見地圖」一節。已提交（`d1ff182`）並推送至 `main`。 |
| 已提交 | `data/input/registered_candidates.csv`、`data/registered_candidates.json`、`scripts/import_cec_registrations.py` | 中選會登記名冊（1,583 筆）與轉檔腳本（`529c357`）；`build_data.py` 已加驗證，`data/schema.md` 已補說明。 |
| 已提交 | 9 個公開頁的導覽列、`index.html`、`app.js`、`candidate-list.js`、`styles.css`、`scripts/build-site.mjs`、`scripts/build_data.py`、`data/schema.md` | 地圖頁導覽連結、首頁橫幅卡片、`?city=` 篩選參數、地圖樣式、建置清單（加入 map 檔與 `registered_candidates.json`）、名冊驗證。 |

> 2026-10-01 已確認：重新 `npm run build` 後，7 個 `data/*.json` 與 HEAD 的差異只有 `last_updated` 日期，屬可重現的建置產物。

## 文化政見地圖（2026-10-01 上線）

頁面：`map.html`（導覽列「文化政見地圖」，首頁入口區最上方有橫幅卡片）。

- **底圖**：內政部國土測繪中心「直轄市、縣市界線」（COUNTY_MOI_1140318，<https://data.gov.tw/dataset/7442>）。原始 shapefile 放在 `tmp/admin-map/source/`（已被 `.gitignore` 忽略）；以 `py -3 scripts/build_map_geometry.py` 產生 `map-geometry.json`（約 54 KB，需提交）。
- **外島規則（使用者指定）**：只畫澎湖本島（含相連的白沙、西嶼）、大小金門、馬祖南北竿，三者都放在左側放大附圖框；其他外島（龜山島、綠島、蘭嶼、小琉球、望安、七美、烏坵、莒光、東引等）不畫。北竿刻意往南竿平移縮短間距（示意，非實際距離），頁面註記已說明。
- **統計口徑**：沿用 `public-candidates.js` 的 `loadCandidateDataset()` + `groupCandidateRecords()`，與縣市長／議員頁一致；候選人以「縣市＋職務＋姓名」去重。議員含區域共同政見連署者（例：新竹市 7 位民眾黨議員候選人）。
- **參選人數**：取自中選會登記名冊（`data/registered_candidates.json`）。直轄市長／直轄市議員分別併入「縣市長」「縣市議員」。比對規則：名冊姓名等於或以本站姓名開頭（名冊可能附原住民族傳統名字）。
- **互動**：縣市長／議員切換；縣市填色＝提出文化政策人數（0／1／2／3+）；圓點＝候選人、顏色＝政黨；點選縣市看側欄（登記人數、已提出者、未收錄的縣市長參選人姓名）；滑鼠移過顯示提示框（縣市長與議員各一列：已提出／登記人數、進度條、未收錄姓名或人數）；比較表每格有「已提出/登記」比例；下方有政黨長條圖。
- **目前數字**：縣市長 21/81 位（14 縣市有人提出；民進黨 11、國民黨 8、無黨籍 2）；議員政黨以中選會推薦紀錄為準；議員 16/1,502 位（7 縣市）。尚未收錄任何縣市長的縣市：桃園、苗栗、南投、嘉義縣、屏東、澎湖、金門、連江。

各縣市「已收錄 / 中選會登記」：

| 縣市 | 縣市長 | 議員 |
| --- | ---: | ---: |
| 臺北市 | 1 / 6 | 2 / 98 |
| 新北市 | 2 / 3 | 1 / 112 |
| 基隆市 | 2 / 3 | 0 / 60 |
| 桃園市 | 0 / 2 | 0 / 109 |
| 新竹市 | 1 / 3 | 7 / 56 |
| 新竹縣 | 2 / 3 | 0 / 68 |
| 宜蘭縣 | 1 / 5 | 0 / 59 |
| 苗栗縣 | 0 / 2 | 0 / 56 |
| 臺中市 | 2 / 3 | 1 / 102 |
| 彰化縣 | 1 / 4 | 1 / 86 |
| 南投縣 | 0 / 2 | 0 / 61 |
| 雲林縣 | 1 / 4 | 0 / 73 |
| 嘉義市 | 1 / 5 | 0 / 37 |
| 嘉義縣 | 0 / 2 | 0 / 53 |
| 臺南市 | 1 / 4 | 1 / 88 |
| 高雄市 | 2 / 5 | 3 / 101 |
| 屏東縣 | 0 / 2 | 0 / 87 |
| 花蓮縣 | 3 / 4 | 0 / 55 |
| 臺東縣 | 1 / 4 | 0 / 56 |
| 澎湖縣 | 0 / 6 | 0 / 36 |
| 金門縣 | 0 / 7 | 0 / 35 |
| 連江縣 | 0 / 2 | 0 / 14 |
| **合計** | **21 / 81** | **16 / 1,502** |

### 中選會登記名冊

- 來源：<https://web.cec.gov.tw/central/article/64709>（115.09.07 製表）；新聞稿 <https://web.cec.gov.tw/central/article/64711>。解析筆數與新聞稿一致：直轄市長 23、直轄市議員 610、縣（市）長 58、縣（市）議員 892。
- 2026-10-01 已取得使用者同意並下載 1-1、2-1、3-1、4-1 四份 PDF（存於當時 session 的暫存資料夾，未進版本庫）。更新時重新下載後執行：`py -3 scripts/import_cec_registrations.py <PDF 資料夾> --as-of YYYY-MM-DD`（需 `pdfplumber`；腳本會檢查筆數）。
- **已更正（2026-10-01，使用者確認以中選會為準）**：政黨欄位一律以中選會登記名冊的「推薦之政黨」為準。林筱薇（臺北市第7選舉區，登記為「林筱薇IcyangTamana」）原標小民參政歐巴桑聯盟，她是該黨發言人，但不是該黨推薦的候選人；薛兆基（高雄市第4選舉區）原標「台灣前進」，那是小黨與無黨籍候選人的聯合，不是政黨。兩人都改成「無黨籍」，`correction_log` 有記錄。其餘 29 位候選人的政黨與中選會一致。地圖的政黨色表也已移除「台灣前進」。
- **待更新**：中選會 10/16 前完成資格審查、10/23 號次抽籤；審定名單公告後重跑轉檔並更新 `as_of`，`map.html` 統計口徑文字也一併改。
- 已移除先前暫用的 `config/collector.json` 追蹤名單邏輯（建置也不再複製該檔）。

### 地圖相關的提交建議

只提交地圖與名冊相關檔案，與 `apps-script/Index.html`、`backups/` 分開；資料 JSON 可在同一次或另一次「建置產物」commit 處理。提交前再跑一次 `npm run build`。

建議續作順序：

1. 保存或建立目前變更的安全備份，避免與其他電腦同時處理同一工作目錄。
2. 檢視 `apps-script/Index.html` 的變更；它目前在原 HTML 結尾追加覆寫式 script，需確認瀏覽器及 Apps Script 都能正常執行後，再考慮整理為單一腳本。
3. 對照 `data/input/` 執行 `npm run build`，確認衍生 JSON 是否只是可重現產物。
4. 若建置通過，分開提交「Apps Script 介面」與「資料建置產物／正式 CSV」；不要混入 `backups/`。
5. push 後確認 GitHub Actions 的 Pages 部署結果與公開網站。

## 文件一致性提醒

下列文件含有歷史流程，不能單獨當作現行操作規範：

- `docs/manual-update.md` 仍提及 `local_review.py`、`data/inbox/`、每日 GitHub 蒐集等舊做法。
- `docs/LOCAL-AI-REVIEW-AUTOMATION.md` 與 `docs/MULTI-COMPUTER-WORKFLOW.md` 明確把 Google Sheet／Apps Script 作為現行流程，優先度較高。
- `cloudflare/README.md` 與 `cloudflare/ARCHITECTURE.md` 描述未來或 staging 架構。

接手後建議第一個文件維護工作是把 `manual-update.md` 改成與 Google Sheet／Apps Script 現況一致，避免 AI 或人員誤啟用舊流程。

## 交接前檢查清單

- [ ] 記錄 `git status --short --branch`，並明確交代未提交檔案的歸屬。
- [ ] 確認沒有把 `.secrets/`、`.clasp.json`、`.tools/` 或外部服務憑證提交。
- [ ] 若修改正式資料，已執行 `npm run build`。
- [ ] 若修改 Apps Script，已在 Apps Script 專案部署並測過 Sheet 權限與寫入。
- [ ] 已確認 GitHub Actions 和公開 Pages 結果。
- [ ] 同步端只留一台電腦處理同一張 Google Sheet 工作列，避免重複審核或發布。
