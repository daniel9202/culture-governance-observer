const SPREADSHEET_ID = '1ulT-xd19TY7TsUcC9jBjvHh30ZuUnSbja3bJp2fNh_k';
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
    if (url) (byUrl[url] ||= []).push(row.rowNumber);
    const title = duplicateText(row['來源標題']);
    const actor = duplicateText(row['候選人／提出者']);
    const city = duplicateText(row['縣市']);
    if (title && actor && city) (byTitleActorCity[`${title}|${actor}|${city}`] ||= []).push(row.rowNumber);
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

function getDashboard(filters) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(REVIEW_SHEET);
  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length || HEADERS.some((header, index) => values[0][index] !== header)) throw new Error('審核資料欄位與程式版本不符。');
  const rows = values.slice(1).map((row, index) => {
    const item = Object.fromEntries(HEADERS.map((header, column) => [header, row[column] || '']));
    item.rowNumber = index + 2;
    return item;
  });
  addDuplicateHints(rows);
  const counts = {all: rows.length, pending: 0, accepted: 0, rejected: 0, published: 0};
  rows.forEach(row => { if (Object.prototype.hasOwnProperty.call(counts, row['審核狀態'])) counts[row['審核狀態']] += 1; });
  filters = filters || {};
  const filtered = rows.filter(row => {
    if (filters.status && filters.status !== 'all' && row['審核狀態'] !== filters.status) return false;
    if (filters.city && filters.city !== 'all' && row['縣市'] !== filters.city) return false;
    if (filters.kind && filters.kind !== 'all' && row['資料類型'] !== filters.kind) return false;
    const query = String(filters.query || '').toLowerCase().trim();
    return !query || [row['來源標題'], row['AI摘要'], row['候選人／提出者'], row['縣市']].join(' ').toLowerCase().includes(query);
  });
  return {counts, items: filtered.slice(0, 200), cities: [...new Set(rows.map(row => row['縣市']).filter(Boolean))].sort()};
}

function saveReview(payload) {
  if (!payload || !['pending', 'accepted', 'rejected'].includes(payload.status)) throw new Error('審核狀態不合法。');
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

const DRAFT_SHEET = '整合草稿';
const DRAFT_HEADERS = ['草稿ID','草稿狀態','資料類型','縣市','職務','候選人／提出者','政黨／提出者類型','政策論述','具體主張','相關發言','來源清單','整合依據','前台處理方式','建立時間','最後更新'];
function integrationSheet_() {
  const book = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = book.getSheetByName(DRAFT_SHEET);
  if (!sheet) { sheet = book.insertSheet(DRAFT_SHEET); sheet.getRange(1, 1, 1, DRAFT_HEADERS.length).setValues([DRAFT_HEADERS]); sheet.setFrozenRows(1); }
  const headers = sheet.getRange(1, 1, 1, DRAFT_HEADERS.length).getDisplayValues()[0];
  if (DRAFT_HEADERS.some((header, index) => headers[index] !== header)) throw new Error('整合草稿欄位與程式版本不符。');
  return sheet;
}
function getIntegrationDashboard(filters) {
  const sheet = integrationSheet_();
  const values = sheet.getDataRange().getDisplayValues();
  const rows = values.slice(1).filter(row => row.some(Boolean)).map((row, index) => {
    const item = Object.fromEntries(DRAFT_HEADERS.map((header, column) => [header, row[column] || '']));
    item.rowNumber = index + 2;
    return item;
  });
  filters = filters || {};
  const filtered = rows.filter(row => {
    if (filters.status && filters.status !== 'all' && row['草稿狀態'] !== filters.status) return false;
    if (filters.city && filters.city !== 'all' && row['縣市'] !== filters.city) return false;
    const query = String(filters.query || '').trim().toLowerCase();
    return !query || [row['候選人／提出者'], row['政策論述'], row['具體主張'], row['縣市']].join(' ').toLowerCase().includes(query);
  });
  const counts = {draft_ready: 0, rework: 0, published: 0};
  rows.forEach(row => { if (Object.prototype.hasOwnProperty.call(counts, row['草稿狀態'])) counts[row['草稿狀態']] += 1; });
  return {counts, items: filtered.slice(0, 100), cities: [...new Set(rows.map(row => row['縣市']).filter(Boolean))].sort()};
}
function saveIntegrationDecision(payload) {
  if (!payload || !['published', 'rework'].includes(payload.status)) throw new Error('整合稿狀態不合法。');
  const sheet = integrationSheet_();
  const row = Number(payload.rowNumber);
  if (!Number.isInteger(row) || row < 2 || row > sheet.getLastRow()) throw new Error('找不到整合稿。');
  if (sheet.getRange(row, 1).getDisplayValue() !== payload.draftId) throw new Error('整合稿已變更，請重新整理。');
  sheet.getRange(row, 2).setValue(payload.status);
  sheet.getRange(row, 15).setValue(new Date());
  return {ok: true, rowNumber: row, status: payload.status};
}