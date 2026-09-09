# 文化治理觀察站｜2026 台灣地方選舉

公開追蹤候選人文化政見、地方民眾與團體的文化政策訴求，並整理地方政府文化預算、實際支出與重點施政。

## 本機建立網站

需先安裝 Node.js 與 Python 3。在專案資料夾執行 `npm run build`，系統會驗證資料並產生可發布的 `dist` 資料夾。

## 原則

- 政見與競選活動、個人經歷分開。
- 每筆候選人資料保留來源、發布日、最後查核日與更正紀錄。
- 預算與決算分開，並註明統計口徑。
- 未完成查核的資料不先行發布。

## 蒐集、摘要與審核

候選人文化政見由本帳號的 Codex 自動化研究公開來源、產生結構化摘要，並建立 GitHub Pull Request（PR）。研究資料不會直接寫入 `main`，也不會出現在公開 dashboard。

你可直接在 GitHub 網頁或 App 的 PR 頁面完成全部審核：

1. 開啟 PR，核對候選人、摘要、來源連結與發布日期。
2. 需要修改時直接留言；Codex 依留言更新同一個 PR。
3. 確認無誤後按 **Merge pull request**；合併即為核准。
4. GitHub Pages 只在資料合併至 `main` 後發布，因此公開頁只顯示已核准資料。

請在 repository 的 **Settings → Branches** 為 `main` 啟用「Require a pull request before merging」與至少一項核准，避免資料繞過人工查核直接公開。

候選人官方來源維護於 `config/candidate_official_sources.csv`。已驗證的競選官網可作為研究優先來源；社群帳號僅在官方身分已確認後使用。

## 資料欄位

候選人正式資料為 `data/input/candidates.csv`；每筆都必須保留職務、縣市、政黨（可確認時）、政策摘要、具體主張、原始來源、發布日期與最後查核日。推送至 `main` 後，GitHub Actions 會驗證資料、產生公開 JSON 並部署 GitHub Pages。

地方文化預算、實際支出及統計口徑則保留於 `data/input/governments.csv`，不由每日候選人自動化更新。
