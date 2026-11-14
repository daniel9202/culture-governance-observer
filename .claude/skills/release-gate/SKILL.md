---
name: release-gate
description: 上線前把關。使用者準備把 beta 推到 staging（或直接更新 main）時，檢查 beta 上所有待上線的內容，給出可以推或不建議推的結論。使用者說「上線把關」「可以推 staging 嗎」「幫我檢查 beta」時使用。
---

# 上線前把關

`beta` 推到 `staging` 之後會自動快轉 `main` 並部署正式站，中間沒有人工關卡。這次檢查是最後一道，目的是讓使用者在按下去之前知道會送出什麼、有沒有不該上線的東西。

全程只讀不改。發現問題就回報，由負責的一端處理，不要自己修。**推送一律等使用者在對話中明確說可以才執行。**

## 步驟

1. `git fetch origin`，讀 `origin/main` 最新的 `AGENTS.md`，有新規則就照新的。
2. 確認三個分支的關係：`origin/main` 與 `origin/staging` 應該在同一個 commit，`origin/beta` 應該能從它快轉。不能快轉就停下來回報，不要合併或強推。
3. 列出 `origin/staging..origin/beta` 的 commit 與檔案差異，逐項檢查下面的清單。
4. 打開公測站 <https://daniel9202.github.io/culture-governance-observer-beta/>，實際看這次受影響的頁面，桌機與手機寬度各截一張。公測站每 15 分鐘才更新，先確認它已經是 `origin/beta` 的內容。
5. 回報結論。

## 檢查清單

**資料**

- 新增或變動的資料列是否都有核准依據：審核台核准，或使用者本人在對話中提供的來源。看不出依據的列出來問。
- 政黨是否符合中選會名冊，未推薦是否填 `無黨籍` 而不是 `無`。
- `content_nature` 是否填了規定的值；留空或其他值不會進入政見統計。
- 抽看 `policy_title`、`concrete_proposals`、`summary`：有沒有明顯不像來源原句的用詞、推論或形容。`summary` 與 `policy_argument` 是不是同一句。
- 更新既有資料時 `id`、`publish_id` 是否不變，`correction_log`、`related_sources` 是否只追加。
- `data/*.json` 是否與 CSV 一致（`npm run build` 後沒有差異）。

**前台**

- 改了 `styles.css` 或 JS 的，所有 HTML 的 `?v=` 是否同步更新。
- 有沒有寫死的色碼、新的深色區塊、把 `noindex` 或測試站橫幅寫進本 repo。
- 各頁 CSP 的 `connect-src` 是否還保留統計網址。

**範圍與流程**

- 每個 commit 是否只動自己一端可提交的檔案。
- 有沒有憑證、`.clasp.json`、scriptId、部署網址。
- 有沒有動到 `.github/workflows/`：有的話無法自動快轉，要照 `AGENTS.md` 的例外處理，先告訴使用者。
- `apps-script/` 有變動的話，提醒這不會隨網站部署，要另外用 clasp 推送。

## 回報格式

先給結論：**可以推**或**不建議推**，一句話說明原因。接著：

- 這次會送出什麼：幾個 commit、資料筆數變化、哪些頁面受影響。
- 發現的問題，依嚴重程度排列，每項寫檔案、內容、由哪一端處理。
- 沒檢查到或無法確認的項目。
- 公測站截圖。

使用者說可以之後，照 `AGENTS.md`「發布流程」執行，推完用 `git rev-parse origin/beta origin/staging origin/main` 確認，並回報正式站部署是否成功。
