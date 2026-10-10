# 資料欄位

正式資料請編輯 `data/input/` 內的 CSV；JSON 由部署流程自動產生，不要直接修改。

各資料的 `topics` 保留原細標籤；建置依 `config/topic_categories.csv` 產生 `topic_categories`（大類陣列）與 `topic_subcategories`（子類別陣列）。適用於 `candidates`、`civic_policy_calls`、`pledge_fulfillment`、`local_cultural_issues`、`shared_policy_groups`。目前唯一子類別值為 `文化資產／保存`。細標籤未出現在對照表時建置會警告；對照表含 24 類以外的大類時建置會報錯。

## `candidates.csv`

每筆記錄包含：`id`、`city`、`office`、`candidate`、`party`、`publish_id`、`review_status`、`topics`、`summary`、`policy_argument`、`concrete_proposals`、`related_statements`、`editor_notes`、`published_date`、`source_title`、`source_url`、`source_type`、`last_verified`、`proposer_role`、`content_nature`、`role_evidence`、`correction_log`、`related_sources`、`policy_title`。`publish_id` 對應「審核資料」中的發布ID與「發布紀錄」中的發布ID；新資料必填，既有資料暫缺時建置會警告，從其他正式資料表遷入的既有資料亦適用舊資料警告規則。`review_status` 可為 `人工審核` 或 `AI初審待複核`；空值等同 `人工審核`。`editor_notes` 記錄本站的檢核與編輯備註，與候選人發言分開呈現；多項以 `||` 分隔，建置輸出為陣列。`policy_title` 為選填欄位，照來源原文記錄候選人自己的政策名稱；沒有明確名稱時留空，建置輸出空字串。`policy_argument` 記錄整體政策論述；`concrete_proposals` 記錄可辨識的具體措施；`related_statements` 記錄候選人或團隊可核實、但未必構成承諾的公開說法。上述多項欄位皆以 `||` 分隔。候選人資料一列代表候選人自己的單一政策單元；同一政策被多則報導提到時盡量合併一列，其他來源放入 `related_sources`，避免重複收錄。`concrete_proposals` 依來源原順序與用詞以 `||` 分隔；來源有編號時保留順序但不需重複加編號。子項下的細項暫與該子項寫在一起，不另拆列或自創層級。原始資料無法細分時，`concrete_proposals` 留空，只填 `summary` 與 `policy_argument`，不得為了湊分點而硬拆。`topics` 僅作本站篩選與標籤，不用來拆解或重組候選人政策結構。`office` 目前使用 `縣市長` 與 `縣市議員` 兩種值，網站據此分別呈現於首頁與議員政見頁。候選人官網與新聞內容重複時，以官網為主要來源，新聞列入 `related_sources` 作為輔助來源。

`proposer_role` 供前台標示來源中的提出身分，只能使用 `候選人`、`推定現任議員`、`待判定`。`content_nature` 區分資料語境，可使用 `本屆競選政見`、`現任議員個人頁內容`、`現任問政／提案`；`現任首長施政` 僅適用於 `office＝縣市長`，呈現現任首長任內文化施政，不計入本屆競選政見。`role_evidence` 必須說明判定依據；「推定現任議員」僅適用於同時核對到中選會本屆名冊與議會個人頁者，並非議會提供的現任身分保證。

## `civic_policy_calls.csv`

每筆記錄包含：`id`、`city`、`proposer`、`proposer_type`、`review_status`、`topics`、`summary`、`requested_action`、`published_date`、`source_title`、`source_url`、`source_type`、`last_verified`、`correction_log`。`review_status` 可為 `人工審核` 或 `AI初審待複核`；空值等同 `人工審核`。此類資料記錄地方居民或團體的政策訴求，不代表候選人立場。

## `governments.csv`

每筆記錄包含：`id`、`city`、`year`、`cultural_expenditure_budget`、`cultural_expenditure_final`、`bureau_budget`、`bureau_final`、`total_budget`、`bureau_scope_note`、`methodology`、`official_source_title`、`official_source_url`、`key_policies`、`last_verified`、`notes`。政事別文化支出與文化局（處）的機關別預決算分開保存；`bureau_scope_note` 用來標記兼辦觀光或年度中改制等口徑問題。顯示金額及比例由系統產生。

## `region_metrics.csv`

每個縣市、年度一筆，記錄文化資產、文化場館、藝文活動、藝術節慶、藝文團體、街頭藝人，以及文化部「社區營造」與「博物館及地方文化館」計畫的中央核定補助和地方配合款。這些欄位只代表上述特定計畫，不代表中央對地方的全部補助；相關經費另列，不併入地方文化局預算或政事別文化支出。原始來源檔名保留於 `source_files`，並記錄 `source_url` 與 `last_verified`。

## `pledge_fulfillment.csv`

每筆記錄一項可查證的文化政策承諾，包含承諾內容、來源、職權範圍、查核狀態與證據。`status` 使用 `fulfilled`、`partial`、`in_progress`、`no_verified_progress`、`not_assessable` 五種值。主要證據填 `evidence_source_title` 與 `evidence_source_url`；同一筆若有多份佐證，填 `additional_evidence`，每筆格式為 `標題::網址`，多筆以 `||` 分隔。

## `shared_policy_groups.csv`

收錄由多位候選人共同提出、但不應誤認為任何一人單獨提出的政見。以 `scope` 區分兩種適用範圍：`party` 為政黨共同政見，依 `party` 與 `office` 套用至已收錄的同黨候選人；`regional` 為區域共同政見，另以 `city`、`office`、`party` 與 `candidates`（多位姓名以 `||` 分隔）指定適用對象。前台會在候選人卡片分開顯示「政黨共同政見」與「區域共同政見」；個人政見與兩類共同政見的來源維持分開。
## `registered_candidates.csv`

中選會「候選人登記彙總表」的轉檔結果，用於計算各縣市參選人數，**不是本站查核的政見資料**。由 `scripts/import_cec_registrations.py` 從中選會 PDF 產生，請勿手動逐筆編輯。欄位：`city`、`office`（`縣市長` 或 `縣市議員`；直轄市長、直轄市議員分別併入）、`district`（選舉區，議員為「臺北市第1選舉區」等）、`candidate`（照名冊登錄，可能含原住民族傳統名字）、`party`（推薦之政黨，未推薦為「無」）、`registered_date`、`incumbent`（僅用「是」或留空；標示現任縣市長，依 2026-10-10 的現任職務與中選會登記名冊判定，僅供地圖樣式使用）、`source_title`、`source_url`、`as_of`（名冊製表日期）。全表須共用同一來源與 `as_of`；輸出的 JSON 只在檔案層級記錄一次 `source`。
