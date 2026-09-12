const SPREADSHEET_ID = '1ulT-xd19TY7TsUcC9jBjvHh30ZuUnSbja3bJp2fNh_k';
const REVIEW_SHEET = '審核資料';
const HEADERS = ['資料類型','收集時間','縣市','發布日期','來源名稱','來源標題','來源網址','審核狀態','AI摘要','AI分類','AI判斷理由','AI信心分數','候選人／提出者','政黨／提出者類型','職務','政策主張／具體訴求','人工備註','審核者','審核時間','發布ID'];

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
  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(REVIEW_SHEET);
    const row = Number(payload.rowNumber);
    if (!Number.isInteger(row) || row < 2 || row > sheet.getLastRow()) throw new Error('找不到指定資料列。');
    if (sheet.getRange(row, 7).getDisplayValue() !== payload.sourceUrl) throw new Error('資料列已變更，請重新整理後再審核。');
    sheet.getRange(row, 8).setValue(payload.status);
    sheet.getRange(row, 9, 1, 8).setValues([[payload.summary || '', payload.category || '', payload.reason || '', payload.confidence || '', payload.actor || '', payload.actorType || '', payload.office || '', payload.policy || '']]);
    sheet.getRange(row, 17).setValue(payload.note || '');
    sheet.getRange(row, 18).setValue(Session.getActiveUser().getEmail() || 'Google 審核者');
    sheet.getRange(row, 19).setValue(new Date());
    SpreadsheetApp.flush();
    return {ok: true, rowNumber: row, status: payload.status};
  } finally { lock.releaseLock(); }
}
