# Google Sheets 雲端審核自動化

## 資料流

1. `Collect candidate policy sources` 每天 06:17（臺北時間）在 GitHub Actions 執行。
2. `scripts/collect_candidates.py` 蒐集來源並更新 `data/inbox/`。
3. `scripts/google_review_pipeline.py` 擷取來源正文，使用 OpenAI API 產生摘要、分類、理由與信心分數，再新增到 Google Sheet 的「審核資料」。AI 不會代替人工接受或拒絕，新增列一律維持 `pending`。
4. 審核者在 Google Sheet 將狀態改為 `accepted` 或 `rejected`，並可直接修正 AI 欄位。
5. 人工觸發 `Publish accepted policy reviews`。`scripts/publish_google_reviews.py` 只讀取 `accepted`，寫入 `data/input/candidates.csv` 或 `data/input/civic_policy_calls.csv`，重建 JSON，提交到 `main`，並把試算表狀態改成 `published`。
6. `Deploy GitHub Pages` 偵測 `main` 更新後建置並發布前台。

## GitHub 設定

在 repository 的 Settings → Secrets and variables → Actions 新增：

- `OPENAI_API_KEY`：OpenAI 專案 API key。
- `GOOGLE_SERVICE_ACCOUNT_JSON`：Google Cloud service account 金鑰的完整 JSON；不得提交到 repository。

啟用 Google Sheets API，並把試算表分享給 service account JSON 內的 `client_email`，權限設為「編輯者」。

審核表：<https://docs.google.com/spreadsheets/d/1ulT-xd19TY7TsUcC9jBjvHh30ZuUnSbja3bJp2fNh_k/edit>

## 安全界線

- GitHub Actions 看不到使用者的 Google Drive 桌面同步資料夾，只透過 service account 存取指定試算表。
- API key 與 service account JSON 只放 GitHub Actions secrets。
- `pending` 不會發布；只有人工設定為 `accepted` 才能進入正式資料。
