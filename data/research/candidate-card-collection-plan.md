# 候選人卡片新結構：資料重整與蒐集流程

2026-10-30 定案，交給資料端（Codex）執行。欄位定義以 `data/schema.md`「候選人卡片結構」一節為準；AGENTS.md 的資料規則（忠於原文、政策論述定義、政黨與身分判定）照舊適用。

## 目標

每位候選人的卡片分兩區，一列 CSV 對應一張子卡：

1. **官網政見**：來源是候選人官網、官方社群或政黨候選人頁。官網有主題的，主題原名填 `official_topic`，子計畫填 `official_subtopic`；沒有主題的整段敘述或條列，依內容拆成數列，`official_topic` 留空。
2. **相關新聞**：一則新聞一列，只放官網沒有的政見。`source_type` 填 `新聞報導`，媒體名稱填 `source_outlet`。

範本：蘇巧慧（`candidate-ntpc-mayor-su-chiao-hui-*` 與相關 `candidate-auto-*`）、周春米（`candidate-auto-c83f64edbb4c`）已依新結構整理，commit 時可對照。

## 現況（2026-10-30）

- 本屆競選政見 198 列、83 位候選人；官方來源 58 列、32 位候選人；51 位沒有任何官方來源。
- `source_type` 有 12 種寫法；官方類四種（候選人原文、候選人官方網站、政黨候選人頁、候選人頁），新聞類兩種以上（新聞／公開網頁、新聞報導）。
- `policy_argument` 只有 5 列有值；`policy_title` 有 72 列空白。
- 已知問題：出自同一官網主題頁的項目散在不同列（例如原本把官網原文標成新聞）；新聞列混有官網已有的項目。

## 第一階段：既有資料重整（不需新來源）

依縣市逐一處理，一次一位候選人，處理完跑 `npm run build`。

1. **統一 `source_type`**：官方類改為 `候選人官網`／`候選人官方社群`／`政黨候選人頁`；新聞類改為 `新聞報導`。依 `source_url` 的網域判斷，不依原本的寫法。
2. **補 `official_topic`／`official_subtopic`**：打開官網頁面確認主題原名，照官網標題照貼，不縮寫、不改字。
3. **歸位**：同一主題頁的項目合併到同一列，順序依官網頁面。被移走項目的那一列，在 `editor_notes` 註明移到哪裡；兩邊的 `correction_log` 都記一筆。
4. **新聞比對**：逐項和該候選人的官網資料比對，重複的項目刪除並在 `editor_notes` 註明。一句話同時含重複與獨有內容時整句保留，並在 `editor_notes` 註明。刪到一項都不剩的新聞列，改把網址放進對應官網列的 `related_sources`，然後刪除該列。
5. **補 `source_outlet`**：從 `source_title` 的「媒體｜標題」取媒體名稱；`source_title` 本身不改。
6. **獨立成卡的新聞不刪節**：`concrete_proposals` 原本以「……」刪節的，回來源補完整原句。
7. **政策論述**：官網主題頁開頭的背景或立場段落，依 AGENTS.md「政策論述」定義放進 `policy_argument`。若目前放在 `summary`，先列出清單給使用者，不要自行搬（見「待使用者決定」第 1 點）。

完成一個縣市就 commit 一次，訊息格式：`data: <縣市> 候選人依新卡片結構重整`。push 前經使用者確認。

## 第二階段：補蒐集官網政見

對象：51 位沒有官方來源的候選人，優先順序為縣市長 → 直轄市議員 → 其他議員。

1. **找官方來源**：依序查候選人官網、Facebook 粉專、Instagram、政黨候選人頁。找到的網址先記在 `data/research/` 的追蹤表（建議 `official_source_survey.csv`：city、office、candidate、url、platform、checked_at、has_culture_content、note），沒找到也要記一列。
2. **判斷有無主題**：官網分主題的，只收文化相關主題，或其他主題中的文化相關項目（比照蘇巧慧的觀光、青年政見）；沒有主題的，依內容拆列，`official_topic` 留空。
3. **送審**：新內容一律走既有流程：寫入 Google Sheet「審核資料」→ 使用者在審核台核准 → 才寫進 `data/input/candidates.csv`。核准前不得出現在 CSV 或公開網站。
4. **社群貼文**：一則貼文就是一個來源。同一政見在官網和社群都有時，以官網為主，社群網址放 `related_sources`。

## 第三階段：持續蒐集的新聞

Apps Script 自動蒐集到的新聞，在審核台核准前就要先比對官網：

1. 新聞內容官網已有：不另開列，網址放進官網列的 `related_sources`。
2. 部分重複：只收官網沒有的項目。
3. 完全沒有對應：新開一列 `新聞報導`。

建議在審核台加一個提示，例如「此候選人已有官網政見 N 列」，讓使用者核准時能比對。介面調整屬資料端的 `apps-script/`，要先寫需求給使用者確認。

## 檢查清單（每位候選人）

- [ ] 官方類列都有正確的 `source_type`；有主題的都填了 `official_topic`
- [ ] 同一主題只有一列，項目順序與官網一致
- [ ] 新聞列沒有官網已有的項目；每列都有 `source_outlet`
- [ ] 新聞列的 `concrete_proposals` 沒有「……」刪節
- [ ] `policy_argument` 與 `summary` 不是同一句
- [ ] 移動、刪除都記在 `editor_notes` 與 `correction_log`
- [ ] `npm run build` 通過

## 待使用者決定

1. **`summary` 與 `policy_argument`**：官網主題頁的開頭段落目前放在 `summary`（例如原住民族政見的「新北市原住民族預算翻轉計畫……」）。新卡片只顯示 `policy_argument`，不顯示 `summary`。要不要把這類段落搬到 `policy_argument`？搬了之後 `summary` 必填，要填什麼？
2. **一句話同時含重複與獨有內容**（例如匯流新聞網的三金博物館＋觀光十字廊帶）：整句保留，還是視為重複刪除？
3. **官網上的單篇文章**（例如 `candidate-ntpc-mayor-su-chiao-hui-001`，chiao.tw 的「國影中心二期留新莊」貼文）：歸在官網政見區（無主題），還是比照新聞處理？
4. 候選人官網沒有、只有政黨網站的：要歸「官網政見」嗎？目前 `政黨候選人頁` 算官網類。

## 交接

- 機器標示：commit 由 hook 加 `Machine:`；Google Sheet 的處理者欄填 `<電腦名稱>-Codex`。
- 前台（設計端）依 `official_topic`、`official_subtopic`、`source_outlet`、`source_type` 分區呈現，不需要等資料全部重整完；欄位空白的列，前台會依 `source_type` 放進對應區域。
