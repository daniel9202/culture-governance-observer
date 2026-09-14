# 雙電腦工作流程

更新日期：2026-09-14（Asia/Taipei）

## 資料流

```text
研究原料（Google Drive）
  → queued（Google Sheet）
  → Danasus：processing + 30 分鐘鎖定
  → AI 完成：complete
  → 人工 Apps Script：accepted / rejected
  → Danasus：正式 CSV → npm run build → commit / push → published
```

同一筆資料同一時間只能由一台電腦處理。Google Sheet 的裝置與鎖定欄位是唯一處理進度依據。

## 換電腦規則

- 專案必須位於 `D:\Projects\文化治理觀察站`，不得放入 Google Drive 或 OneDrive。
- 開始前：`git status --short --branch`；僅在乾淨工作目錄執行 `git pull --rebase`。
- 結束前：`npm run build`、只 stage 已確認檔案、commit、push，並等待 Google Drive 同步完成。
- 不使用 `git add .`、`git clean -fd` 或 `git reset --hard`。

## 舊流程

Cloudflare Worker／D1、GitHub source-lead PR、每日 GitHub inbox 蒐集與 Service Account 發布皆為舊流程，不得啟用或作為新資料來源。
