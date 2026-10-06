# 文化治理觀察站｜AI 協作規則

這份是**現行規則**，所有在這個 repo 工作的 AI（Codex、Claude Code）開工前都要讀。進度與歷史紀錄在 `docs/PROJECT-HANDOFF.md`；兩者衝突時，以本檔為準並回報使用者。

與使用者溝通一律用繁體中文。

## 專案定位

台灣文化政策的觀察入口。2026 地方選舉的文化政見是第一個模組；之後會加入中央與地方文化預算、預算對應的政策與要點、全國文化會議的回應與追蹤。公開網站是 GitHub Pages：<https://daniel9202.github.io/culture-governance-observer/>，推上 `main` 就會部署。

## 工作環境

- **主要工作機是 Danasus，其他電腦也可以直接 clone 工作；同步只透過 GitHub。** 不要用 OneDrive 或 Google Drive 同步 repo：2026-09-14 曾因此產生 `-Danasus` 衝突副本（見 `tmp/conflict-archive/`）。手機一律用遠端連線。
- **同一時間只在一台電腦工作。** 換電腦前，把兩端的工作都 commit 並 push；還沒完成、不能上線的推到備份分支（設計端 `origin/design`、資料端 `origin/data-wip`），不要推 `main`。到另一台開工先 `git fetch origin`，再 rebase 到 `origin/main` 或取回備份分支。
- **只在 Danasus 做的事**：Codex 的排程自動化（Sheet 補資料）、建立 Apps Script 觸發器。`backups/`、`.claude/` 只留在 Danasus，不進 git，也不要複製到其他電腦。
- **兩台都可以用 clasp 推審核台**，但 `clasp push` 會整份覆蓋 Google 上的程式，不會合併，所以：
  1. 推之前先 `git pull`，只從 `main`（或使用者指定、比 `main` 更新的分支）推。
  2. 審核台的修改一律先 commit 進 git 再推，不在 Google 編輯器直接改。
  3. 每次推送或部署都記在 `docs/PROJECT-HANDOFF.md`：commit、推到測試還是正式、部署版本號；推之前先對照最近一筆。
  4. 每台電腦自己 `clasp login`、自己建 `.clasp.json`；scriptId 與憑證不進 git、不寫進文件或聊天，也不從別台複製憑證檔。
- Danasus 上兩個工作端各用一個工作目錄，共用同一個 `.git`：

  | 工作端 | 目錄 | 分支 |
  | --- | --- | --- |
  | 資料端 | `D:\Projects\文化治理觀察站` | `main` |
  | 設計端 | `D:\Projects\文化治理觀察站-design`（git worktree） | `design` |

  其他電腦照同樣分法：資料端在 `main`，設計端用 `git worktree add -b design ../文化治理觀察站-design origin/main` 開第二個目錄（已有 `origin/design` 備份時改從它開）；只用一個 AI 的話，一個 clone 也可以，但開工前要確認目前在哪個分支。
- 不要刪除對方的工作目錄，也不要在自己的目錄切到對方的分支。
- 建置只需要 Node 和 Python：`npm run build`（驗證 CSV、重建 `data/*.json` 與 `dist/`）。

## 分工

| 工作端 | 負責 | 只能提交 |
| --- | --- | --- |
| 設計端 | 前台外觀、互動、頁面架構 | `styles.css`、根目錄 `*.html`／`*.js`、`map-geometry.json`、`config/party_colors.json`、`docs/`、本檔 |
| 資料端 | 蒐集、新增、更正資料；Apps Script 審核台與蒐集後台；push | `data/input/`、`data/*.json`、`data/research/`、`data/schema.md`、`scripts/build_data.py` 的驗證規則、`apps-script/` |

審核台介面若要調整，設計端寫成需求交給資料端，不直接修改 `apps-script/`。

`scripts/` 其他檔案、`.github/workflows/`、`config/` 其他設定會影響兩端，修改前先問使用者。

- 看到對方範圍的問題，只回報使用者，由負責的一端處理。
- `docs/` 與本檔只在使用者明確要求時修改，且不得夾帶對方的工作檔案。
- 欄位契約：設計端只顯示 CSV 已有的欄位，不從標題或內文推斷身分或政見性質。資料端新增、改名或刪除欄位前，要先列出來，等設計端確認。

## 開工與收工

開工：

```bash
git fetch origin
git status --short --branch
```

收工：

- **只 `git add` 自己範圍的檔案。** 禁止 `git add .`、`git reset --hard`、`git clean -fd`。
- 跑 `npm run build`，確認通過。設計端要確認沒有把建置重產的 `data/` 檔案一起 stage。
- 資料端：`git pull --rebase`，經使用者確認後 `git push origin main`。
- 設計端：`git rebase origin/main`，再 `git push origin HEAD:main`。尚未完成的工作可以推到 `origin/design` 當備份，不會上線。
- push 後回報固定格式的交接訊息：

  ```text
  commit hash｜筆數變化｜欄位是否變動｜內容分類｜待辦／風險
  例：4053324｜新增 1 筆｜無欄位變動｜蔡易餘：本屆競選政見｜未載預算與期程
  ```

## 資料發布流程

```text
Apps Script 自動蒐集 → Google Sheet「審核資料」
→ 使用者在 Apps Script 審核台核准（使用者核准前不得公開）
→ 資料端 AI 讀取已核准資料 → 寫入 data/input/*.csv → npm run build
→ 使用者手動確認 → push
→ GitHub Actions → GitHub Pages
```

- **資料端 push 到 GitHub、推送 Apps Script 之前，都要先經使用者手動確認。**

- `data/input/*.csv` 是唯一正式資料來源；Google Sheet 只是佇列與查核清單，不能反向覆蓋 CSV。
- 同一筆資料同一時間只能由一個工作端處理，依 Google Sheet 的裝置與鎖定欄位判斷。
- Sheet ID、部署網址、憑證（`.secrets/`、`.clasp.json`）不得寫進 git、文件或聊天。
- Apps Script 的程式以 repo 的 `apps-script/` 為準，由資料端用 clasp 推送：先推到測試部署，使用者實測後再正式部署，並在交接文件記下版本。不要直接在 Google 編輯器修改而不回寫 repo。
- 尚未部署的審核台修改放在 `review-console-wip` 分支（「準備上架」工作區＋設計端的三項修正），由資料端接手；資料端資料夾裡的 `apps-script/Index.html` 是 `main` 上的舊版，**在合併這個分支之前，不要從資料端資料夾推送 Apps Script**，否則會蓋掉這份修改。
- `MULTI-COMPUTER-WORKFLOW.md` 列出的舊流程（Cloudflare Worker／D1 發布、GitHub source-lead PR、Service Account 發布）不得啟用。

## 資料規則

- **政黨**以中選會登記名冊的「推薦之政黨」為準。中選會寫「無」就填 `無黨籍`，不要填 `無`（`build_data.py` 比對時不會報錯，但前台會把它當成未知政黨）。擔任政黨發言人不等於該黨推薦；「台灣前進」是聯盟，不是政黨。
- **內容性質**（`content_nature`）：前台的政見與統計只算 `本屆競選政見`；`現任議員個人頁內容`、`現任問政／提案` 只出現在「現任追蹤」的議員分頁。欄位留空或填其他值，資料就不會進入政見統計。
- **提出身分**（`proposer_role`）：`推定現任議員` 依中選會本屆名冊與議會個人頁推定，前台必須註明「並非議會官方認證」；`待判定` 不套用現任標籤。
- 候選人個人政見、共同政見、民間訴求、政府統計不可混為同一類。

## 前台設計規則

- **色票**只用 `styles.css` 的 `:root` 變數：頁面底 `--paper`、卡片 `--surface`、強調區 `--tint`，深色只用 `--ink`。不要寫死米白色碼；新增深色區塊前先問使用者。萊姆 `--lime` 只用於少數重點（頁尾、主卡、行動按鈕、選取狀態）。
- **改 `styles.css` 或前台 JS 時，同步更新所有 HTML 引用的 `?v=` 版本參數**，否則有快取的訪客會拿到舊檔。
- **地圖**：縣市統一底色，只用滑過與選取凸顯位置。縣市長一人一點、顏色為政黨；議員每縣市一個總數徽章，不在個別縣市呈現各黨人數（差異多半來自收錄進度）。全國合計的政黨長條圖可以保留。外島只畫澎湖本島、大小金門、馬祖南北竿。
- **政黨色**集中在 `config/party_colors.json`；新增政黨的顏色前先問使用者。
- **配色或版面決策**：先在本機預覽，把實際截圖傳給使用者比較再定案。使用者常透過遠端操作，看不到 Danasus 的瀏覽器畫面。
- 滑過效果不用強調色，只做輕微的底色變化。
