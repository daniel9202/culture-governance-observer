# 文化治理觀察站｜專案交接文件

更新日期：2026-10-02（Asia/Taipei；補上跨帳號資料／版面協作規約；設計端更新工作進度、地圖、現任追蹤）

適用對象：接手本專案的另一台電腦、開發者或 AI。

## 專案目的

這是 2026 台灣地方選舉的文化治理資料網站。公開端整理：

- 縣市長與縣市議員的文化政見；
- 地方居民／團體提出的文化政策訴求（不等同候選人立場）；
- 地方文化預算、決算與施政口徑；
- 文化政策承諾的實現追蹤；
- 縣市文化資產、場館、活動與特定中央補助指標。

公開網站由 GitHub Pages 部署；目前主要審核流程使用 Google Sheet 與 Google Apps Script。Cloudflare Worker／D1 是未來或 staging 架構，**不是目前日常資料發布入口**；2026-10-01 起前台已不再讀取其已核准資料 API；2026-10-03 起前台已完全不連 Cloudflare（造訪統計與舊審核頁都已移除，見下方「尚未處理的缺口」）。

## 工作分工（2026-10-01 起，使用者指定）

目前有兩個工作端同時使用這個 repo：

| 工作端 | 負責 | 可以提交的檔案 |
| --- | --- | --- |
| 設計端 | 前台外觀與互動 | `styles.css`、根目錄 `*.html`／`*.js`、`map-geometry.json`、`docs/` |
| 資料端 | 新增與更正資料、Apps Script 審核台與蒐集後台，經使用者確認後 push | `data/input/`、`data/*.json`、`data/research/`、`apps-script/` |

- 不要提交對方負責的檔案；看到對方範圍的問題（例如政黨欄位不符），回報使用者，由負責的一端處理。
- 提交時只 `git add` 自己範圍的檔案，不要 `git add .`。
- push 前先 `git fetch`，遠端有新提交就先 `git pull --rebase`，避免覆蓋另一端的工作。
- `apps-script/` 審核台由資料端負責並以 clasp 推送（2026-10-02 更正：先前誤寫為設計端）。設計端要改審核台介面時，寫成需求交給資料端。現行規則以根目錄 `AGENTS.md` 為準。

### 跨帳號協作規約（2026-10-02 新增）

為避免資料意義與前台呈現互相覆寫，兩端依下列契約協作：

1. **唯一正式資料來源**：`data/input/*.csv` 是公開網站資料的唯一正式來源；Google Sheet 僅作人工補件、匯入與查核清單，不能反向覆蓋 CSV。
2. **欄位契約**：設計端只能依 CSV 已有欄位顯示，不自行從文字推斷候選人身分或政見性質。資料端如需新增、改名或刪除欄位，必須先在交接訊息明列並等設計端確認。
3. **內容分類**：
   - 同時出現在中選會本屆名冊、且來源是議會「個人頁」時，`提出身分` 可標為「推定現任議員」；這是可操作的推論，不等同議會提供的現任身分保證，因部分議會網站可能保留歷屆頁面。盤點結果寫入 `data/research/councilor-incumbent-source-inventory.csv`（2026-10-02：22 筆推定、6 筆非個人頁不推定）。
   - 有「政見、當選後、未來四年、競選承諾」等可核對用語，才標為「本屆競選政見」。
   - 質詢、提案、要求縣府或爭取經費，標為「現任問政／提案」；不可自動視為本屆選舉承諾。
   - 出席活動、既有建設成果或一般表態，標為「既有施政／活動」，不以候選人政見上架。
   - `candidates.csv` 已有 `proposer_role`、`content_nature`、`role_evidence` 三個正式欄位；設計端應直接依其顯示標籤，不得再從來源標題或內文自行推論。
4. **提交範圍**：資料端只提交資料範圍；設計端只提交前台範圍。文件可在使用者明確要求下更新，但不得夾帶對方工作檔案。任何一端均不得使用 `git add .`。
5. **固定交接訊息**：每次 push 後都回報「commit hash、筆數變化、欄位是否變動、內容分類、待辦／風險」。例如：`4053324｜新增 1 筆｜無欄位變動｜蔡易餘：本屆競選政見｜未載預算與期程`。
6. **開始與結束**：開始前先 `git fetch` 與檢查工作目錄；若遠端已有他端提交，先處理 rebase。結束前只 stage 自己範圍、執行適用驗證、commit、push，再交接。看見對方範圍的問題只回報，不直接修改。

### 設計端可用的資料介面（2026-10-02）

提交 `68aae0a` 已將下列欄位輸出到 `data/candidates.json`；設計端可直接讀取，無須從來源標題或內文自行判斷：

| 欄位 | 可用值 | 目前筆數 |
| --- | --- | ---: |
| `proposer_role` | `候選人`、`推定現任議員`、`待判定` | 82／22／6 |
| `content_nature` | `本屆競選政見`、`現任議員個人頁內容`、`現任問政／提案` | 82／22／6 |
| `role_evidence` | 對應提出身分的判定依據 | 每筆必填 |

- 「推定現任議員」僅表示同時核對到中選會本屆名冊與議會個人頁，不應顯示為議會官方保證的現任身分。
- 建議前台以 `proposer_role` 顯示「推定現任議員」標籤，以 `content_nature` 顯示內容脈絡；`待判定` 不應套用現任標籤。
- 設計端只需調整前台讀取與顯示，不需改動 CSV 欄位或研究盤點檔。

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

## 目前 Git 與工作進度（2026-10-02 設計端更新）

分支：`main`，追蹤 `origin/main`，已全部推送。資料端的提交見其交接訊息；設計端 2026-10-01～02 推送的提交如下（舊到新）：

| 提交 | 內容 |
| --- | --- |
| `529c357`～`7904fde` | 10-01 早先：中選會名冊、文化政見地圖上線、名冊檢查與政黨色、停用 Cloudflare 已核准資料 API |
| `6faa915` | 地圖兩級填色（後由 `07ea87d` 取代）、地圖側欄改淺色、全站色票收斂成 paper／surface／tint ＋ ink |
| `abe64ba` | 9 筆縣市長資料（使用者確認）、高虹安政黨「無」→「無黨籍」、金門附圖點座標修正（此後資料改由資料端負責） |
| `76e6cca` | 全站補上 `?v=` 版本參數，修正快取訪客拿到舊 `map.js` |
| `9ec9890` | 地圖議員模式改成每縣市一個總數徽章 |
| `8f45c21` | 首頁卡片滑過效果改成淡沙色底，不用強調色 |
| `5c6165c` | 交接文件：工作分工 |
| `07ea87d` | 地圖改成統一底色，滑過／選取才變色；移除填色圖例與比較表色塊 |
| `711767c` | 前台只算本屆競選政見；「政見實現追蹤」改名「現任追蹤」並新增議員分頁；地圖側欄與議員頁連到議員分頁 |

**尚未合併或未追蹤的項目：**

| 狀態 | 檔案 | 判讀 |
| --- | --- | --- |
| 分支 `review-console-wip`（`b1a56f5`，已推上 GitHub） | `apps-script/Index.html` | 原本在資料端資料夾、未提交的審核台修改：「準備上架」工作區、審核後只移除該張卡片不整頁重載。設計端在本機以假的 `google.script.run` 測過並加上三項修正（在「準備上架」存檔後卡片不再消失、退回待審核時「準備上架」計數會扣、開頁讀試算表從 3 次減為 2 次）。**尚未部署到 Apps Script，也未合併進 `main`；由資料端接手**：合併後用 clasp 推測試部署，使用者實測，再正式部署。資料端資料夾裡的 `apps-script/Index.html` 是 `main` 上的舊版，合併前不要從那裡推 Apps Script。 |
| 未追蹤 | `backups/` | 含 `cloudflare-d1-20260914/` 的 D1 schema 與資料快照。視為本機備份，在確認資料敏感性與需求前不要加入版本庫。 |

前台資源版本參數（改檔時要同步更新各 HTML）：`styles.css?v=20261002-9`；`nav.js` 為 `20261003-1`；`public-candidates.js`、`map.js`、`candidate-list.js`、`app.js`、`fulfillment.js` 為 `20261002-8`。

## 文化政見地圖（2026-10-01 上線）

頁面：`map.html`（導覽列「文化政見地圖」，首頁入口區最上方有橫幅卡片）。

- **底圖**：內政部國土測繪中心「直轄市、縣市界線」（COUNTY_MOI_1140318，<https://data.gov.tw/dataset/7442>）。原始 shapefile 放在 `tmp/admin-map/source/`（已被 `.gitignore` 忽略）；以 `py -3 scripts/build_map_geometry.py` 產生 `map-geometry.json`（約 54 KB，需提交）。
- **外島規則（使用者指定）**：只畫澎湖本島（含相連的白沙、西嶼）、大小金門、馬祖南北竿，三者都放在左側放大附圖框；其他外島（龜山島、綠島、蘭嶼、小琉球、望安、七美、烏坵、莒光、東引等）不畫。北竿刻意往南竿平移縮短間距（示意，非實際距離），頁面註記已說明。
- **統計口徑**：沿用 `public-candidates.js` 的 `loadCandidateDataset()` + `groupCandidateRecords()`，與縣市長／議員頁一致；候選人以「縣市＋職務＋姓名」去重。議員含區域共同政見連署者（例：新竹市 7 位民眾黨議員候選人）。
- **參選人數**：取自中選會登記名冊（`data/registered_candidates.json`）。直轄市長／直轄市議員分別併入「縣市長」「縣市議員」。比對規則：名冊姓名等於或以本站姓名開頭（名冊可能附原住民族傳統名字）。
- **互動（2026-10-02 現況）**：
  - 縣市長／議員切換。縣市一律同一個暖灰底 `#e6e2d7`；滑鼠移過的縣市變淡灰紫 `#dcd6ea`，選取中的縣市為灰紫 `#c3bbd6` 加墨色外框。不再用填色表示「有沒有人提出」——使用者判斷各縣市最終都會補齊資料，填色只用來凸顯目前位置。
  - 縣市長模式：一位候選人一個圓點，顏色＝政黨。議員模式：每縣市一個墨色數字徽章（`countBadge()`），不分政黨，因為各黨人數差異多半反映收錄進度。
  - 點選縣市看側欄（登記人數、已提出者、未收錄的縣市長參選人姓名）；側欄底部有「此縣市另有 N 位○○候選人」及「本縣市另有 N 位議員的任內文化問政紀錄（非本屆政見）」連結。
  - 滑鼠移過顯示提示框；比較表每格有「已提出／登記」比例；下方政黨長條圖為全國合計，保留。
- **數字**：會隨資料端更新變動，以線上頁面為準，不再在此維護逐縣市表格。2026-10-02 `711767c` 時為縣市長 31/81 位、議員 43/1,502 位（只算本屆競選政見）、21/22 縣市有人提出（澎湖目前只有現任議員內容）。

### 中選會登記名冊

- 來源：<https://web.cec.gov.tw/central/article/64709>（115.09.07 製表）；新聞稿 <https://web.cec.gov.tw/central/article/64711>。解析筆數與新聞稿一致：直轄市長 23、直轄市議員 610、縣（市）長 58、縣（市）議員 892。
- 2026-10-01 已取得使用者同意並下載 1-1、2-1、3-1、4-1 四份 PDF（存於當時 session 的暫存資料夾，未進版本庫）。更新時重新下載後執行：`py -3 scripts/import_cec_registrations.py <PDF 資料夾> --as-of YYYY-MM-DD`（需 `pdfplumber`；腳本會檢查筆數）。
- **已更正（2026-10-01，使用者確認以中選會為準）**：政黨欄位一律以中選會登記名冊的「推薦之政黨」為準。林筱薇（臺北市第7選舉區，登記為「林筱薇IcyangTamana」）原標小民參政歐巴桑聯盟，她是該黨發言人，但不是該黨推薦的候選人；薛兆基（高雄市第4選舉區）原標「台灣前進」，那是小黨與無黨籍候選人的聯合，不是政黨。兩人都改成「無黨籍」，`correction_log` 有記錄。其餘 29 位候選人的政黨與中選會一致。地圖的政黨色表也已移除「台灣前進」。
- **待更新**：中選會 10/16 前完成資格審查、10/23 號次抽籤；審定名單公告後重跑轉檔並更新 `as_of`，`map.html` 統計口徑文字也一併改。
- 已移除先前暫用的 `config/collector.json` 追蹤名單邏輯（建置也不再複製該檔）。

### 候選人資料的自動檢查（2026-10-01 新增）

`scripts/build_data.py` 的 `check_against_registration()` 會在每次 `npm run build`（本機發布前、`pages.yml` 部署前、`validate-data.yml` 的 PR 驗證）比對中選會名冊：

- **錯誤**：縣市寫法、職務、政黨和中選會不符。
- **警告**：名冊找不到該候選人，或比對到多人。在 GitHub Actions 會以 annotation 顯示。

細節寫在 `docs/LOCAL-AI-REVIEW-AUTOMATION.md` 第 6 點。政黨色集中在 `config/party_colors.json`：`build_data.py` 會檢查色碼，輸出 `data/party_colors.json` 給地圖用。設定檔裡沒有的政黨，地圖一律顯示成「其他政黨」，建置時會跳警告。2026-10-01 與使用者確認的規則如下：

- 顏色以英文維基百科 Module:Political party 的政黨色為準。民眾黨用 `#28C7C7`，國民黨用 `#000099`。
- 無黨籍畫成空心圈，避免和民眾黨的青色搞混。
- 歐巴桑聯盟依使用者指定，沿用粉紅 `#D6478A`。
- 時代力量、新黨顏色偏淺，加深色外框。
- 尚未設定顏色的政黨，新增前要先和使用者討論：
  - 綠黨、台灣工黨、台灣麻將最大黨：顏色是綠色系，和民進黨相近
  - 社民黨：粉紅色，和歐巴桑聯盟相近
  - 勞動黨：維基只寫 red，沒有色碼
  - 其他小黨：沒有公認的政黨色

尚未處理的缺口：
- Apps Script 審核台與「整合草稿」沒有名冊檢查，錯誤要等建置時才會發現。可以讓 Apps Script 用 `UrlFetchApp` 讀線上的 `data/registered_candidates.json`，在審核卡片上提示，但需要另外部署 Apps Script，並在實際環境測試。
- 2026-10-01 已移除前台讀取 Cloudflare 已核准資料的程式碼，經使用者同意；移除前確認兩個 API 都是 0 筆：`public-candidates.js` 的 `/api/public/candidates`、`civic.js` 的 `/api/public/civic-calls`。`updates.js` 只用來插入 Cloudflare 資料，而且本來就沒列在建置清單裡，已一併刪除。現在前台只讀經過 `build_data.py` 驗證的 JSON。
- 2026-10-03 依使用者指示移除前台剩下的 Cloudflare 相依：`nav.js` 的匿名造訪統計（`/api/public/visit`）、各頁 CSP `connect-src` 裡的 Worker 網址、首頁「人工查核 ↗」連結，並刪除 `review.html`、`review.js`、`review-api.js`（建置清單同步移除）。原本的造訪統計只寫進 Cloudflare D1，從未接到 Apps Script 或任何使用者看得到的介面，移除沒有實際損失；目前網站沒有造訪統計。`review.html` 當時是一個轉址到 Google Apps Script 審核台的頁面，等於把審核台的部署網址公開在網站上，移除後已不再出現（git 歷史中仍有）。
- `cloudflare/` 資料夾（Worker 原始碼）與 Cloudflare 帳號上的 Worker、D1 資料庫沒有動；是否刪除或停用由使用者決定。

### 地圖相關的提交建議

設計端只提交前台檔案，不碰 `apps-script/` 與 `backups/`；`data/*.json` 等建置產物由資料端提交（見「工作分工」）。提交前再跑一次 `npm run build`，並確認沒有把建置重產的 `data/` 檔案一起 stage。

## 建議續作順序（2026-10-01 晚間）

### 使用者指定的下一步：文化政見地圖（優先）

**A. 改行政區（縣市）填色——已完成（2026-10-01），2026-10-02 再改**
- **10-02 現況（`07ea87d`）**：資料補齊後 22 縣市幾乎都上色，兩級填色失去區辨力；使用者決定改成統一底色，只用滑過與選取凸顯目前位置（色碼見上方「文化政見地圖」）。`fillLevel`、`.fill-0`／`.fill-1`、填色圖例與比較表色塊都已移除。以下為 10-01 的紀錄。
- 使用者決定改成「有／沒有」兩級：`.fill-0` 尚未收錄 `#e1ddd2`、`.fill-1` 已有候選人提出 `#c3bbd6`（灰紫）。`map.js` 的 `fillLevel` 只回傳 0 或 1；圖例與頁首說明文字同步改。
- 選灰紫的理由：主要政黨沒有紫色系，政黨圓點不撞色；萊姆（撞民進黨綠、時力／新黨黃）與暖石灰（和網站紙色太接近）都被否決。唯一相近的是「其他政黨」`#7D6F8F`。
- 地圖右側欄 `.map-detail` 從墨黑改成淺色（卡片底、墨色字、橘色小標）；「查看完整政見」按鈕維持萊姆，使用者看過墨黑／深紫／淡萊姆／外框四個方案，暫不更動。

**全站配色統一——已完成（2026-10-01）**
- `styles.css` 的 `:root` 新增 `--surface:#fdfcf9`（卡片、面板）與 `--tint:#e7e4d9`（統計區、註記卡、長條圖軌道）；`--paper:#f2f0e8` 為頁面底，也用於卡片內嵌區塊（政策層、共同政見）。舊的 `#faf9f4`、`#f4f3ed`、`#f4f0e7`、`#e5e2d7`、`#fff` 背景都已併入這三階。
- 深色只留 `--ink #151712`（頁首、手機選單、地圖提示框）；`--dark` 改成同值，`#1b1d18`、`#22241f` 已不再使用。
- 單一縣市頁的施政卡、財政圖表、`.section-dark`、首頁地圖入口卡都改成淺底；圖表系列 1 從萊姆改成墨色，系列 2 維持橘色。
- 新增元件時請用 `var(--paper)`／`var(--surface)`／`var(--tint)`，不要再寫死米白色碼；深色區塊需先和使用者確認。
- `--white` 仍保留，只用在深色底上的文字顏色。
- **改 `styles.css` 或前台 JS 時，記得同步更新各 HTML 引用的 `?v=` 版本參數**（目前版本見「目前 Git 與工作進度」）。否則有快取的訪客會拿到舊檔：2026-10-01 曾因此讓舊 `map.js` 搭配新 CSS，在 `abe64ba` 之後才補上版本參數。

**B. 縣市議員模式的圓點數量會爆炸——已完成（2026-10-01）**
- 使用者選「單一數字標記」：議員模式每縣市一個墨色徽章（`map.js` 的 `countBadge()`），不分政黨；圖例改成文字說明。縣市長模式維持一人一點。
- 理由（使用者）：依政黨合併會在個別縣市呈現各黨人數差異，但差異多半來自本站收錄進度，數字會被誤讀。
- 頁面下方的政黨長條圖保留，因為它是全國合計、不按個別縣市比較。
- 以下為原始方案紀錄。

**（原紀錄）B. 縣市議員模式的圓點數量會爆炸**
- 現況（`map.js` 的 `dots()`）：每位候選人畫一個點，排成一列，間距 13px。新竹市目前已經有 7 個點，一路延伸到海上；各縣市議員登記人數多達 14～112 位，收錄變多之後會畫不下。
- 要先和使用者確認改成哪一種畫法：
  1. **依政黨合併**：每個政黨一個點，點裡或點旁標人數，例如「民眾黨 7」。點的大小可以依人數放大。
  2. **單一數字標記**：縣市上只放一個總數徽章，例如「12」。政黨組成改看提示框和側欄。
  3. **縣市長維持一人一點，議員才合併**：縣市長每縣市最多 7 人，一人一點還畫得下。
- 不論選哪一種，提示框、側欄、比較表都已經有完整名單，地圖上只要能看出「多少人、哪些政黨」就夠了。
- 比較表的議員欄也是一人一個小方塊，人數多時會很長。可以一起改成依政黨合併，再加上「展開全部」。

**C. 2026-10-01 新增 9 筆縣市長資料——已上線**
- 使用者確認後發布 `data/input/candidates.csv` 新增的 9 筆縣市長（沈伯洋、蘇巧慧、高虹安、陳玉珍、黃世杰、張啓楷、吳宗憲、林國漳、温世政）。
- 高虹安（新竹市）政黨原填「無」，已改成「無黨籍」。`build_data.py` 比對名冊時把「無」視同無黨籍所以不會報錯，但 JSON 會原樣輸出「無」，地圖就把它當成色表外的政黨。新資料一律填「無黨籍」。
- 金門縣附圖的圓點座標原為 y=314（落在澎湖框內），已改到金門框左下角 y=236。
- `data/research/` 的研究檔後來由設計端（3 個縣市長檔，`f244c86`）與資料端（議員檔）分別提交；之後 `data/` 一律由資料端處理。

**D. 只算本屆競選政見、新增「現任追蹤」議員分頁——已上線（2026-10-02，`711767c`）**
- **篩選位置**：`public-candidates.js` 的 `loadCandidateDataset()`。`records` 只保留 `content_nature` 為 `本屆競選政見` 的資料；其餘（`現任議員個人頁內容`、`現任問政／提案`）放在 `incumbent_records`。所有讀候選人資料的頁面（首頁、地圖、縣市長、議員、地方儀表板）因此只顯示並統計本屆政見。`content_nature` 空白或為其他值的資料也不會進入政見統計。
- **現任追蹤**：導覽列「政見實現追蹤」改名「現任追蹤」（使用者選定），首頁卡片同步改名，數字為首長實現紀錄＋議員任內紀錄。`fulfillment.html` 分兩個分頁：
  - 「首長｜政見實現」：原內容不動。
  - 「議員｜任內問政」：讀 `incumbent_records`，依縣市→議員分組，可篩選縣市；卡片顯示 `推定現任議員` 標籤（`待判定` 不標）、`content_nature`、具體主張、`role_evidence`、來源；**不顯示實現狀態**。頁面註明「不是本屆競選政見、不評估是否實現」，以及「推定現任議員依中選會本屆名冊與議會個人頁推定，並非議會官方認證」。
  - 網址參數：`fulfillment.html?tab=council&city=縣市`。
- **連結**：地圖側欄（兩種模式）與議員頁（`candidate-list.js`，依縣市篩選）顯示「本縣市另有 N 位議員的任內文化問政紀錄（非本屆政見）→」。共用函式為 `incumbentNamesByCity()`、`incumbentLink()`。
- 資料方法頁的「政見實現追蹤」小節標題（說明首長查核方法）未改；如要補充議員分頁的方法說明，另行處理。

1. **中選會審定名單**：10/16 前完成資格審查、10/23 號次抽籤。審定名單公告後，下載新的 PDF 重跑 `scripts/import_cec_registrations.py`，並更新 `--as-of` 與 `map.html` 底部「統計口徑」的人數和日期文字。
2. **審核台修改（資料端接手）**：`review-console-wip` 分支的 `apps-script/Index.html` 在原 HTML 結尾追加了兩段覆寫式 script，設計端已在本機以假資料測過並修正（見「目前 Git 與工作進度」）。資料端合併後用 clasp 推測試部署，使用者實測，再正式部署；之後可考慮整理成單一腳本。
3. **Cloudflare**：前台相依已於 2026-10-03 移除。剩下 `cloudflare/` 資料夾與帳號上的 Worker、D1 是否刪除或停用，待使用者決定。若日後需要造訪統計，要另選方案並更新各頁 CSP。
4. **審核當下就檢查**：可以讓 Apps Script 審核台讀線上的 `data/registered_candidates.json`，在審核卡片上提示政黨或姓名與中選會不符。需要另外部署 Apps Script。
5. **文件**：把 `docs/manual-update.md` 改成符合 Google Sheet／Apps Script 的現行流程（見下節）。
6. **出現新政黨時**：若候選人資料出現 `config/party_colors.json` 沒有的政黨，建置會跳警告。補顏色前先和使用者確認。
7. **Apps Script 欄位讀寫**：`apps-script/Code.gs` 目前以固定欄位位置讀寫 A:T；重建流程時改為依標題名稱讀寫。在完成前，不要在 A:T 中間插入欄位。

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
