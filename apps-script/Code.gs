const SPREADSHEET_ID = '1ulT-xd19TY7TsUcC9jBjvHh30ZuUnSbja3bJp2fNh_k';
const BUILD = '2026-11-14-1';
const REVIEW_SHEET = '審核資料';
const HEADERS = ['資料類型','收集時間','縣市','發布日期','來源名稱','來源標題','來源網址','審核狀態','AI摘要','AI分類','AI判斷理由','AI信心分數','候選人／提出者','政黨／提出者類型','職務','政策主張／具體訴求','人工備註','審核者','審核時間','發布ID'];
function duplicateText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '').replace(/[「」『』《》〈〉、，。！？：；（）()［］\[\]【】"']/g, '');
}

function addDuplicateHints(rows) {
  const byUrl = {};
  const byTitleActorCity = {};
  rows.forEach(row => {
    const url = String(row['來源網址'] || '').trim().toLowerCase();
    if (url) { if (!byUrl[url]) byUrl[url] = []; byUrl[url].push(row.rowNumber); }
    const title = duplicateText(row['來源標題']);
    const actor = duplicateText(row['候選人／提出者']);
    const city = duplicateText(row['縣市']);
    if (title && actor && city) { const key = `${title}|${actor}|${city}`; if (!byTitleActorCity[key]) byTitleActorCity[key] = []; byTitleActorCity[key].push(row.rowNumber); }
  });
  rows.forEach(row => {
    const hints = [];
    const url = String(row['來源網址'] || '').trim().toLowerCase();
    const sameUrl = (byUrl[url] || []).filter(rowNumber => rowNumber !== row.rowNumber);
    if (sameUrl.length) hints.push(`同來源網址：第 ${sameUrl.join('、')} 列`);
    const title = duplicateText(row['來源標題']);
    const actor = duplicateText(row['候選人／提出者']);
    const city = duplicateText(row['縣市']);
    const sameTitle = title && actor && city ? (byTitleActorCity[`${title}|${actor}|${city}`] || []).filter(rowNumber => rowNumber !== row.rowNumber) : [];
    if (sameTitle.length) hints.push(`同標題、提出者與縣市：第 ${sameTitle.join('、')} 列`);
    row['疑似重複'] = hints.join('；');
  });
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index').setTitle('文化治理觀察站｜雲端審核台').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getBuildInfo() {
  return {build: BUILD, url: ScriptApp.getService().getUrl() || ''};
}

function getDashboard(filters) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(REVIEW_SHEET);
  const lastRow = sheet.getLastRow();
  const headers = sheet.getRange(1, 1, 1, HEADERS.length).getDisplayValues()[0];
  if (HEADERS.some((header, index) => headers[index] !== header)) throw new Error('審核資料欄位與程式版本不符。');
  const rowCount = Math.max(lastRow - 1, 0);
  const statusValues = rowCount ? sheet.getRange(2, 8, rowCount, 1).getDisplayValues() : [];
  const leftValues = rowCount ? sheet.getRange(2, 1, rowCount, 7).getDisplayValues() : [];
  const detailValues = rowCount ? sheet.getRange(2, 9, rowCount, 9).getDisplayValues() : [];
  const rows = leftValues.map((left, index) => {
    const row = left.concat([statusValues[index][0]], detailValues[index]);
    const item = Object.fromEntries(HEADERS.slice(0, 17).map((header, column) => [header, row[column] || '']));
    item.rowNumber = index + 2;
    return item;
  });
  addDuplicateHints(rows);
  const counts = {all: rows.length, pending: 0, accepted: 0, rejected: 0, split: 0};
  rows.forEach(row => { if (Object.prototype.hasOwnProperty.call(counts, row['審核狀態'])) counts[row['審核狀態']] += 1; });
  filters = filters || {};
  const filtered = rows.filter(row => {
    if (filters.status && filters.status !== 'all' && row['審核狀態'] !== filters.status) return false;
    if (filters.city && filters.city !== 'all' && row['縣市'] !== filters.city) return false;
    if (filters.kind && filters.kind !== 'all' && row['資料類型'] !== filters.kind) return false;
    const query = String(filters.query || '').toLowerCase().trim();
    return !query || [row['來源標題'], row['AI摘要'], row['候選人／提出者'], row['縣市'], row['人工備註']].join(' ').toLowerCase().includes(query);
  });
  const direction = filters.sort === 'oldest' ? 1 : -1;
  filtered.sort((a, b) => direction * String(a['收集時間']).localeCompare(String(b['收集時間']), 'zh-Hant', {numeric: true}));
  const offset = Math.max(0, Number(filters.offset) || 0);
  const limit = Math.min(200, Math.max(1, Number(filters.limit) || 200));
  const items = filtered.slice(offset, offset + limit);
  addPublishedUrlHints_(items);
  return {counts, items, totalFiltered: filtered.length, cities: [...new Set(rows.map(row => row['縣市']).filter(Boolean))].sort()};
}

const OFFICE_VALUES = ['縣市長', '縣轄市長', '縣市議員', '不適用'];
// 舊資料的「職務」是 AI 自由填的，先把寫法不同但意思明確的對應回四個選項；
// 對應不到的保持原樣，由審核者在介面上重新選。
const OFFICE_ALIASES = {
  '議員': '縣市議員', '市議員': '縣市議員', '縣議員': '縣市議員', '縣市議員': '縣市議員',
  '直轄市議員': '縣市議員', '市議員候選人': '縣市議員', '議員候選人': '縣市議員',
  '市長': '縣市長', '縣長': '縣市長', '縣市長': '縣市長', '直轄市長': '縣市長',
  '縣市長候選人': '縣市長', '市長候選人': '縣市長',
  '縣轄市長': '縣轄市長',
  '不適用': '不適用', '無': '不適用', '民間團體': '不適用', '公民團體': '不適用',
};
// 縣轄市的市長是縣以下的層級，和「縣市長」不同。OFFICE_ALIASES 是整串比對，
// 「竹北市長」不會被「市長」那一條吃掉，但也對應不到任何選項，所以先比對市名。
const COUNTY_CITY_MAYOR = /^(竹北|頭份|苗栗|彰化|員林|南投|斗六|太保|朴子|屏東|宜蘭|花蓮|臺東|台東|馬公)市長(候選人)?$/;
function normalizeOffice(value) {
  const text = String(value || '').trim();
  if (COUNTY_CITY_MAYOR.test(text)) return '縣轄市長';
  return OFFICE_ALIASES[text] || text;
}

function saveReview(payload) {
  if (!payload || !['pending', 'accepted', 'rejected'].includes(payload.status)) throw new Error('審核狀態不合法。');
  // 拒絕或退回待審核都不該先要求把資料分類好；只有「接受並送比對」才檢查。
  const office = normalizeOffice(payload.office);
  if (payload.status === 'accepted' && !OFFICE_VALUES.includes(office)) {
    throw new Error('請先選擇職務／提出者身分再接受這筆資料。');
  }
  payload.office = office;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(REVIEW_SHEET);
    const row = Number(payload.rowNumber);
    if (!Number.isInteger(row) || row < 2 || row > sheet.getLastRow()) throw new Error('找不到指定資料列。');
    if (sheet.getRange(row, 7).getDisplayValue() !== payload.sourceUrl) throw new Error('資料列已變更，請重新整理後再審核。');
    // H:S is contiguous, so write the whole review in one Sheets request.
    sheet.getRange(row, 8, 1, 12).setValues([[
      payload.status,
      payload.summary || '', payload.category || '', payload.reason || '', payload.confidence || '',
      payload.actor || '', payload.actorType || '', payload.office || '', payload.policy || '',
      payload.note || '', Session.getActiveUser().getEmail() || 'Google 審核者', new Date()
    ]]);
    return {ok: true, rowNumber: row, status: payload.status};
  } finally { lock.releaseLock(); }
}

function saveReviews(payload) {
  if (!payload || !['accepted', 'rejected'].includes(payload.status) || !Array.isArray(payload.items) || !payload.items.length || payload.items.length > 50) {
    throw new Error('批次審核資料不合法。');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(REVIEW_SHEET);
    const items = payload.items.map(item => {
      const row = Number(item.rowNumber);
      if (!Number.isInteger(row) || row < 2 || row > sheet.getLastRow()) throw new Error('找不到指定資料列。');
      if (sheet.getRange(row, 7).getDisplayValue() !== item.sourceUrl) throw new Error('有資料列已變更，請重新整理後再批次審核。');
      return { row, item };
    });
    const reviewer = Session.getActiveUser().getEmail() || 'Google 審核者';
    const reviewedAt = new Date();
    items.forEach(({ row, item }) => {
      sheet.getRange(row, 8, 1, 12).setValues([[
        payload.status,
        item.summary || '', item.category || '', item.reason || '', item.confidence || '',
        item.actor || '', item.actorType || '', item.office || '', item.policy || '',
        item.note || '', reviewer, reviewedAt
      ]]);
    });
    return { ok: true, status: payload.status, rowNumbers: items.map(({ row }) => row) };
  } finally {
    lock.releaseLock();
  }
}


function ensureReviewStatusValidation_(sheet) {
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(REVIEW_STATUSES, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 8, Math.max(sheet.getMaxRows() - 1, 1), 1).setDataValidation(rule);
}

function splitReview(payload) {
  if (!payload || !Array.isArray(payload.items) || payload.items.length < 2 || payload.items.length > 20) {
    throw new Error('請至少建立 2 位候選人的拆分資料。');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(REVIEW_SHEET);
    const row = Number(payload.rowNumber);
    if (!Number.isInteger(row) || row < 2 || row > sheet.getLastRow()) throw new Error('找不到指定資料列。');
    if (sheet.getRange(row, 7).getDisplayValue() !== payload.sourceUrl) throw new Error('資料列已變更，請重新整理後再拆分。');
    const source = sheet.getRange(row, 1, 1, HEADERS.length).getValues()[0];
    const items = payload.items.map(item => ({
      actor: String(item.actor || '').trim(), actorType: String(item.actorType || '').trim(),
      office: String(item.office || '').trim(), summary: String(item.summary || '').trim(),
      policy: String(item.policy || '').trim()
    }));
    items.forEach(item => { item.office = normalizeOffice(item.office); });
    if (items.some(item => !OFFICE_VALUES.includes(item.office))) throw new Error('請為每位候選人選擇職務／提出者身分。');
    if (items.some(item => !item.actor || !item.office || !item.policy)) {
      throw new Error('每位候選人都必須填寫姓名、職務與政策線索。');
    }
    ensureReviewStatusValidation_(sheet);
    const startRow = sheet.getLastRow() + 1;
    const lastColumn = Math.max(sheet.getLastColumn(), HEADERS.length);
    sheet.getRange(row, 1, 1, lastColumn).copyTo(sheet.getRange(startRow, 1, items.length, lastColumn), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    const reviewer = Session.getActiveUser().getEmail() || 'Google 審核者';
    const reviewedAt = new Date();
    const rows = items.map(item => {
      const next = source.slice();
      next[7] = 'accepted';
      next[8] = item.summary || source[8] || '';
      next[12] = item.actor;
      next[13] = item.actorType || source[13] || '';
      next[14] = item.office;
      next[15] = item.policy;
      next[16] = '由第 ' + row + ' 列拆分；與同批候選人共用此來源。';
      next[17] = reviewer;
      next[18] = reviewedAt;
      next[19] = '';
      return next;
    });
    sheet.getRange(startRow, 1, rows.length, HEADERS.length).setValues(rows);
    sheet.getRange(row, 8, 1, 12).setValues([[
      'split', source[8] || '', source[9] || '', source[10] || '', source[11] || '',
      source[12] || '', source[13] || '', source[14] || '', source[15] || '',
      '已拆分為第 ' + startRow + '–' + (startRow + rows.length - 1) + ' 列，原始綜合列不送整合。', reviewer, reviewedAt
    ]]);
    return {ok: true, sourceRow: row, newRows: rows.map((_, index) => startRow + index)};
  } finally { lock.releaseLock(); }
}

// ── 比對與發布（docs/REVIEW-CONSOLE-COMPARE.md）────────────────────────────
// accepted＝待比對；使用者在比對頁核准後才變成 ready_to_write，寫入 CSV 的 AI 只處理 ready_to_write。
const REVIEW_STATUSES = ['pending', 'accepted', 'rejected', 'split', 'published', 'ready_to_write', 'written', 'pending_check', 'not_included'];
const COMPARE_STATUSES = ['accepted', 'pending_check', 'ready_to_write', 'written', 'not_included'];
// 新欄位放在 AR:AV（第 44–48 欄）；AF:AQ 沒有欄名但部分有資料，不能動。
const COMPARE_HEADERS = ['處理方式', '對應原筆ID', '寫入內容', '更正理由', '寫入commit'];
const COMPARE_FIRST_COLUMN = 44;
const OPERATIONS = {
  '新增政見': 'ready_to_write', '更新既有資料': 'ready_to_write', '只補來源': 'ready_to_write',
  '不收錄': 'not_included', '待查': 'pending_check'
};
// 寫入內容只收這些 CSV 欄位；多值欄位用 CSV 寫法（topics 用 |，其他用 ||）。
const CONTENT_FIELDS = ['policy_title', 'summary', 'policy_argument', 'concrete_proposals', 'related_statements', 'topics', 'editor_notes'];
const BETA_JSON_URL = 'https://raw.githubusercontent.com/daniel9202/culture-governance-observer/beta/data/candidates.json';

function reviewSheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(REVIEW_SHEET);
}

// 依欄名找欄位；比對欄位不存在時建在 AR:AV（該處欄名必須是空的才寫）。
function compareColumns_(sheet, create) {
  const lastColumn = Math.max(sheet.getLastColumn(), COMPARE_FIRST_COLUMN + COMPARE_HEADERS.length - 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const map = {};
  headers.forEach((header, index) => { if (header && !(header in map)) map[header] = index + 1; });
  const missing = COMPARE_HEADERS.filter(header => !map[header]);
  if (missing.length && create) {
    const target = headers.slice(COMPARE_FIRST_COLUMN - 1, COMPARE_FIRST_COLUMN - 1 + COMPARE_HEADERS.length);
    if (target.some(Boolean)) throw new Error('AR:AV 已有其他欄名，請先確認欄位位置。');
    sheet.getRange(1, COMPARE_FIRST_COLUMN, 1, COMPARE_HEADERS.length).setValues([COMPARE_HEADERS]);
    COMPARE_HEADERS.forEach((header, index) => { map[header] = COMPARE_FIRST_COLUMN + index; });
  }
  return map;
}

function readRows_(sheet) {
  const lastRow = sheet.getLastRow(), lastColumn = sheet.getLastColumn();
  if (lastRow < 2) return [];
  const values = sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues();
  const headers = values[0];
  return values.slice(1).map((row, index) => {
    const item = {rowNumber: index + 2};
    headers.forEach((header, column) => { if (header && !(header in item)) item[header] = row[column] || ''; });
    return item;
  });
}

// 公開的 beta 資料，切塊快取 10 分鐘（CacheService 單一值上限 100KB）。
function betaRecords_() {
  const cache = CacheService.getScriptCache();
  const meta = cache.get('beta_records_n');
  if (meta) {
    const keys = Array.from({length: Number(meta)}, (_, i) => 'beta_records_' + i);
    const parts = cache.getAll(keys);
    if (keys.every(key => parts[key] !== undefined)) return JSON.parse(keys.map(key => parts[key]).join(''));
  }
  const response = UrlFetchApp.fetch(BETA_JSON_URL, {muteHttpExceptions: true});
  if (response.getResponseCode() !== 200) throw new Error('讀不到 beta 分支的 candidates.json（HTTP ' + response.getResponseCode() + '）。');
  const join = value => Array.isArray(value) ? value.join('||') : String(value || '');
  const records = (JSON.parse(response.getContentText()).records || []).map(r => ({
    id: r.id, city: r.city, office: r.office, candidate: r.candidate, party: r.party,
    policy_title: r.policy_title || '', summary: join(r.summary), policy_argument: join(r.policy_argument),
    concrete_proposals: join(r.concrete_proposals), related_statements: join(r.related_statements),
    topics: Array.isArray(r.topics) ? r.topics.join('|') : String(r.topics || ''), editor_notes: join(r.editor_notes), source_url: r.source_url || '',
    related_sources: Array.isArray(r.related_sources) ? r.related_sources : [], last_verified: r.last_verified || '',
    correction_log: Array.isArray(r.corrections) ? r.corrections : [], content_nature: r.content_nature || ''
  }));
  const text = JSON.stringify(records), size = 25000, parts = {};
  for (let i = 0; i * size < text.length; i++) parts['beta_records_' + i] = text.slice(i * size, (i + 1) * size);
  try { cache.putAll(parts, 600); cache.put('beta_records_n', String(Object.keys(parts).length), 600); } catch (e) { /* 快取失敗不影響結果 */ }
  return records;
}

function normalizeUrl_(url) {
  return String(url || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[#?].*$/, '').replace(/\/+$/, '');
}

// 只用來排序：字元二元組的重疊比例。
function similarity_(a, b) {
  const grams = text => { const t = duplicateText(text), set = {}; for (let i = 0; i < t.length - 1; i++) set[t.slice(i, i + 2)] = 1; return set; };
  const ga = grams(a), gb = grams(b), ka = Object.keys(ga);
  if (!ka.length) return 0;
  const hit = ka.filter(k => gb[k]).length;
  return hit / Math.sqrt(ka.length * Math.max(Object.keys(gb).length, 1));
}

function parseContent_(text) {
  if (!text) return null;
  try { const value = JSON.parse(text); return value && typeof value === 'object' ? value : null; } catch (e) { return null; }
}

function getCompareDashboard(filters) {
  filters = filters || {};
  const sheet = reviewSheet_();
  const rows = readRows_(sheet);
  const counts = {};
  COMPARE_STATUSES.forEach(status => { counts[status] = 0; });
  rows.forEach(row => { if (row['審核狀態'] in counts) counts[row['審核狀態']] += 1; });
  const status = COMPARE_STATUSES.includes(filters.status) ? filters.status : 'accepted';
  const query = String(filters.query || '').toLowerCase().trim();
  const filtered = rows.filter(row => {
    if (row['審核狀態'] !== status) return false;
    if (filters.city && filters.city !== 'all' && row['縣市'] !== filters.city) return false;
    return !query || [row['來源標題'], row['AI摘要'], row['候選人／提出者'], row['縣市'], row['人工備註']].join(' ').toLowerCase().includes(query);
  });
  const direction = filters.sort === 'oldest' ? 1 : -1;
  filtered.sort((a, b) => direction * String(a['收集時間']).localeCompare(String(b['收集時間']), 'zh-Hant', {numeric: true}));
  const offset = Math.max(0, Number(filters.offset) || 0);
  const limit = Math.min(50, Math.max(1, Number(filters.limit) || 50));
  const page = filtered.slice(offset, offset + limit);
  const records = page.length ? betaRecords_() : [];
  const urlIndex = {};
  records.forEach(r => [r.source_url].concat(r.related_sources).forEach(url => {
    const key = normalizeUrl_(url); if (key) (urlIndex[key] = urlIndex[key] || []).push(r.id);
  }));
  const items = page.map(row => {
    const item = Object.assign({}, row);
    const actor = String(row['候選人／提出者'] || '').trim(), office = normalizeOffice(row['職務']);
    const content = parseContent_(row['寫入內容']) || {};
    const basis = [content.policy_title, content.concrete_proposals, content.summary, row['政策主張／具體訴求'], row['AI摘要']].join(' ');
    item.existing = records
      .filter(r => r.candidate === actor && r.city === row['縣市'] && (!OFFICE_VALUES.includes(office) || office === '不適用' || r.office === office))
      .map(r => Object.assign({score: Math.round(similarity_(basis, [r.policy_title, r.concrete_proposals, r.summary, r.topics].join(' ')) * 100)}, r))
      .sort((a, b) => b.score - a.score);
    item.urlHits = [...new Set(urlIndex[normalizeUrl_(row['來源網址'])] || [])];
    item.content = content;
    return item;
  });
  return {counts, items, totalFiltered: filtered.length, cities: [...new Set(rows.map(row => row['縣市']).filter(Boolean))].sort()};
}

function checkRow_(sheet, payload, allowed) {
  const row = Number(payload && payload.rowNumber);
  if (!Number.isInteger(row) || row < 2 || row > sheet.getLastRow()) throw new Error('找不到指定資料列。');
  if (sheet.getRange(row, 7).getDisplayValue() !== payload.sourceUrl) throw new Error('資料列已變更，請重新整理後再審核。');
  const current = sheet.getRange(row, 8).getDisplayValue();
  if (!allowed.includes(current)) throw new Error('這筆目前是「' + current + '」，不能在比對頁修改。');
  return row;
}

function saveComparisonDecision(payload) {
  if (!payload || !Object.prototype.hasOwnProperty.call(OPERATIONS, payload.operation)) throw new Error('請選擇處理方式。');
  const operation = payload.operation, targetId = String(payload.targetId || '').trim();
  const reason = String(payload.reason || '').trim(), note = String(payload.note || '').trim();
  const content = {};
  CONTENT_FIELDS.forEach(field => { const value = String((payload.content || {})[field] || '').trim(); if (value) content[field] = value; });
  if (operation === '新增政見' && !content.concrete_proposals && !content.summary && !content.policy_title) throw new Error('新增政見至少要有政見名稱、摘要或具體主張。');
  if ((operation === '更新既有資料' || operation === '只補來源') && !targetId) throw new Error('請指定原筆 ID。');
  if (operation === '更新既有資料' && !reason) throw new Error('更新既有資料要填更正理由。');
  if ((operation === '不收錄' || operation === '待查') && !note) throw new Error(operation === '待查' ? '請寫下待查事項。' : '請寫下不收錄的原因。');
  if (targetId && operation !== '新增政見' && !betaRecords_().some(r => r.id === targetId)) throw new Error('beta 資料裡找不到原筆 ID：' + targetId);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = reviewSheet_();
    const row = checkRow_(sheet, payload, ['accepted', 'pending_check', 'ready_to_write']);
    const columns = compareColumns_(sheet, true);
    ensureReviewStatusValidation_(sheet);
    const status = OPERATIONS[operation];
    sheet.getRange(row, 8).setValue(status);
    if (note) sheet.getRange(row, 17).setValue(note);
    sheet.getRange(row, 18, 1, 2).setValues([[Session.getActiveUser().getEmail() || 'Google 審核者', new Date()]]);
    sheet.getRange(row, columns['處理方式']).setValue(operation);
    sheet.getRange(row, columns['對應原筆ID']).setValue(operation === '新增政見' ? '' : targetId);
    sheet.getRange(row, columns['寫入內容']).setValue(operation !== '不收錄' && Object.keys(content).length ? JSON.stringify(content) : '');
    sheet.getRange(row, columns['更正理由']).setValue(operation === '更新既有資料' ? reason : '');
    return {ok: true, rowNumber: row, status};
  } finally { lock.releaseLock(); }
}

// 比對頁「退回資訊蒐集」：回到 pending，保留已填的比對欄位供下次參考。
function returnToSources(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = reviewSheet_();
    const row = checkRow_(sheet, payload, ['accepted', 'pending_check', 'ready_to_write']);
    sheet.getRange(row, 8).setValue('pending');
    return {ok: true, rowNumber: row, status: 'pending'};
  } finally { lock.releaseLock(); }
}

// 資訊蒐集卡片：來源網址已在 beta 資料某筆的 source_url／related_sources 出現時提示。讀不到 beta 資料時不提示，不擋審核。
function addPublishedUrlHints_(items) {
  if (!items.length) return;
  let records;
  try { records = betaRecords_(); } catch (e) { return; }
  const index = {};
  records.forEach(r => [r.source_url].concat(r.related_sources).forEach(url => {
    const key = normalizeUrl_(url); if (key) (index[key] = index[key] || []).push(r.id);
  }));
  items.forEach(item => { item.urlHits = [...new Set(index[normalizeUrl_(item['來源網址'])] || [])]; });
}
