# 官網索引覆核紀錄

2026-10-28。此為部分完成；沒有改動 config/ 的內容。現有 config/candidate_policy_pages.csv 有 160 列、16 人。工作包列舉的「9 人＋其餘 7 人」共 16 人；「18 人」其餘兩人未具名，不能猜測。

- 柯志恩：https://kochihen2026.tw/policy ，實際瀏覽器顯示九分類合計 60 頁（7+9+7+4+10+8+2+7+6），與既有 60 筆一致；仍未逐項逐類校對完整清單。
- 賴瑞隆：https://www.zenolai.tw/policy ，實際瀏覽器逐一展開五類，4+4+4+5+2＝19 個卡片；各頁標題與網址見 policy-pages-titles.md。舊索引的 zenolai.oen.tw 是募款頁，不是政見官網；既有單筆索引不完整。
- 陳文賓：https://wenbin2026.com/policy ，頁面顯示五個主張，前 3 項有「了解更多」連到獨立頁；第 4「民生育樂，全面兼顧」與第 5「文賓築夢，彰化圓夢」只在索引頁顯示標題與一句說明，沒有可見的詳情連結。不能因此證明其他頁尚未上線或不存在。未變更 index_item_count。
- 甘崇緯：https://akan.oen.tw/ 為候選人單頁，網頁直接顯示「八大主張」及各段，需把同頁主張與獨立頁分別記數，不能逕稱八個詳情頁。
- 其餘吳宗憲、林國漳、何欣純、葉人文、韓瑩、鄒明諺、林筱薇、蘇巧慧、江啟臣、張嘉郡、童子瑋、沈伯洋：保留舊索引，尚未全部重新展開並核對，也尚不能確認官網是否已改域名或失效。

# 其他工作包線索

- 謝閔弘 https://ahong.oen.tw/ ：直接讀取到捐款頁及個人介紹，可見頁面未提供政見分類或其他網站連結；不排除社群或其他入口，不能推論整個網路都無政見。
- 柯志恩單篇 https://kochihen2026.tw/policy/文化觀光/原住民族政策 ：瀏覽器實查正文容器為 .policy-detail-content；60 頁的正文雜湊尚未完成。工作包同時要求補雜湊及禁止修改 config/，因此不得直接改 config/candidate_policy_pages.csv；先提交現有 160 列備份。
- 綠黨頁目前可確認三位：甘崇緯 https://akan.oen.tw/ 、王振庭 https://web.greenparty.org.tw/posts/news/2026candidate-chengting/ 、張佑輔在綠黨總頁 https://web.greenparty.org.tw/posts/news/2026candidate/ 有個人段落；舊獨立網址 https://web.greenparty.org.tw/posts/news/2026tai-wan-lu-dang-xin-bei-shi-yi-yuan-zhong-zheng-wan-hua-can-xuan-ren-wang-zhen-ting/ 回報 `Redirect loop detected`，不應稱為可正常使用的個人頁。此三人為目前可辨識者，尚未找到先前所稱「抓到的 3 人」完整原始作業紀錄，無法保證與當時統計完全相同。
- data/inbox/councilor_sources.csv 六列：pending 王振庭、吳程澤、蘇智弦、葉國文；resolution_error 張佑輔（個人頁網址解析失敗）、洪英雄（官方姓名與登記名冊完整姓名不符）。
- 第三批 64 筆：依 6bf02a3 與其父提交的 candidates.csv 比對找出原始 ID，64 列均已回填 Sheet T 欄，V 欄均為 HPDAN-Codex，全部讀回驗證。其中 12 筆原始 ID 已不在現行 CSV，T 欄保留歷史來源紀錄；11 個指定孤兒的人工備註均已追加合併去向。

## 後續核對補充

- 第三批原本以候選人欄及網址比對漏掉 1 筆：徐欣瑩「講客新竹」 https://twpowernews.com/news_pagein.php?n_id=295468 ，Sheet 第 459 列候選人欄空白，但來源網址完全相同且標題明示徐欣瑩；已回填 candidate-auto-e49d838e70a8，讀回驗證。故 64 筆全部找到；其中 52 個 ID 仍在現行 CSV、12 個已移出。
- 2026-10-27 的 11 個指定孤兒與補充 2 個蘇巧慧孤兒已全部在人工備註追加指定合併或移出說明並讀回，既有內容保留。前一批 11 個含古秀英，另 2 個蘇巧慧合計 13 列；其中 12 列屬第三批。
- 直接開啟 LINE TODAY 的瀏覽器操作遭網站安全政策阻擋（`The site-safety policy blocks this action`）；沒有試圖繞過。網址及原始媒體待在可正常使用的來源核對。
- 何欣純 https://a-chun.tw/future 可讀取且含區域政見；吳宗憲 https://www.yilan2026.tw/#policy、林國漳 https://2026openchang.tw/#vision、韓瑩 https://2026yilan-win.tw/#vision、鄒明諺 https://mymytsou.com/、林筱薇 https://www.imvlin.com/whatvdo 直接讀取成功，但本輪尚未逐分類完整展開。葉人文 https://tainanyesman.oen.tw/ 讀取回報 `Timeout fetching`；不能判定網站失效。

- 何欣純：https://a-chun.tw/future 以真實瀏覽器展開：14 個區域卡片，以及交通、教育、青年、婦幼、治安、勞工、長輩照顧、寵物共 8 個領域分頁；各分頁包含 53 個主張標題，合計 67 個區域卡片／領域主張。內容在同一網址，並非 67 個獨立頁。標題已列於 policy-pages-titles.md；舊單頁索引無法作為分類內容完整性證據。

## 2026-10-28 後續：主線同步與網站索引

- 張嘉郡：https://www.devotetoyunlin.com/Policies ，瀏覽器展開可見 13 個分類及 18 個詳情卡片；18 個網址與既有索引逐一相符。舊索引 18 列的 page_title 全部誤為網站名稱，已改為各卡片標題，分類寫在 note，has_culture 未更動。
- 童子瑋：https://t-ziwei.com/ ，「領域政見」共 14 張卡片，14 個目標網址與既有索引吻合；「區域政績」為另一區塊，不能自動視為本屆政見。已用卡片標題更新標題清單與索引，has_culture 未更動。
- 沈伯洋：https://puma.taipei/policies ，14 張政策卡片，五個 HEART 主軸篩選彼此可重疊（例如同一政策同時屬多個主軸）；分類卡片加總不能直接作為去重後頁面數。現有 14 個不同詳情網址與索引頁顯示的標題吻合；尚未逐一測試每個篩選頁是否存在只在該篩選才出現的額外卡片。
- 江啟臣：https://taichungway.tw/future ，首頁除了十大亮點與詳情連結，另有「五大面向・百大新政」列 117 項同頁項目；既有 28 個詳情網址未完成逐分類核驗，不能只用網址數認定政策清單完整。

## 2026-10-29 使用者人工確認

- 江啟臣、沈伯洋、柯志恩：使用者已親自瀏覽整個官網政見頁，有文化相關的頁面都已貼給本站；不再需要逐分類、逐篩選比對，柯志恩 60 頁正文雜湊也不再列為待辦。
- 吳宗憲：使用者確認官網 https://www.yilan2026.tw/#policy 沒有列文化政見；文化政見以已收錄的新聞報導為準。
- 林國漳：使用者確認官網 https://2026openchang.tw/#vision 只有「宜蘭客家一七GO」一張文化卡片，卡片連到 https://www.facebook.com/photo/?fbid=122129655237086317&set=a.122101310919086317 ；其他官網政見非文化類。已依貼文原文更新 candidate-auto-e47fc0942b03，其餘文化政見以新聞為準。
- 韓瑩（https://2026yilan-win.tw/#vision）：使用者 2026-10-29 確認官網沒有文化政見；鄒明諺（https://mymytsou.com/ ，政見頁 https://mymytsou.com/official/policies ）：使用者同日確認官網政見頁沒有任何政見，不只是沒有文化政見；兩人文化政見以新聞為準。
- 葉人文（https://tainanyesman.oen.tw/）：使用者 2026-10-29 確認官網只有「臺南街頭藝術文化示範場域」一項文化政見，已在 candidate-auto-31bdd006bbe5，依原文修正。
