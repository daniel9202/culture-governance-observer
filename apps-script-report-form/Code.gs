const REPORT_FORM_TITLE = '文化治理觀察站｜錯誤回報';
const REPORT_FORM_DESCRIPTION = '發現資料有誤、來源失效或遺漏，請告訴我們。查核後的修改會列在網站的更新紀錄。';
const RESPONSE_SPREADSHEET_NAME = '文化治理觀察站－雲端審核資料庫';
const RESPONSE_SHEET_NAME = '錯誤回報';
const SPREADSHEET_MIME_TYPE = 'application/vnd.google-apps.spreadsheet';

/**
 * 建立公開的錯誤回報表單，並把回覆寫入指定的雲端審核資料庫。
 * 請只執行一次；執行後請從 Apps Script 的執行記錄取得網址。
 */
function createReportForm() {
  const spreadsheet = findResponseSpreadsheet_();
  ensureResponseSheetNameAvailable_(spreadsheet);

  const existingSheetIds = new Set(spreadsheet.getSheets().map(sheet => sheet.getSheetId()));
  const form = FormApp.create(REPORT_FORM_TITLE);

  form
    .setDescription(REPORT_FORM_DESCRIPTION)
    .setCollectEmail(false)
    .setLimitOneResponsePerUser(false)
    .setConfirmationMessage('謝謝回報，我們會查核後處理。');

  const dataIdItem = form.addTextItem()
    .setTitle('資料 ID（由網站自動帶入，不用填）')
    .setRequired(false);
  const pageUrlItem = form.addTextItem()
    .setTitle('頁面網址（由網站自動帶入，不用填）')
    .setRequired(false);
  const recordItem = form.addTextItem()
    .setTitle('哪一筆資料')
    .setHelpText('例如：新竹市長候選人莊競程的文化政見。從卡片上的「回報錯誤」進來的會自動帶入。')
    .setRequired(false);
  form.addMultipleChoiceItem()
    .setTitle('問題類型')
    .setChoiceValues(['內容有誤', '來源失效', '分類不對', '遺漏資料', '其他'])
    .setRequired(true);
  form.addParagraphTextItem()
    .setTitle('說明')
    .setHelpText('請寫哪裡有誤，以及正確的內容是什麼。')
    .setRequired(true);
  form.addTextItem()
    .setTitle('佐證來源網址')
    .setRequired(false);
  form.addTextItem()
    .setTitle('聯絡方式')
    .setHelpText('需要回覆才填。')
    .setRequired(false);

  form.setDestination(FormApp.DestinationType.SPREADSHEET, spreadsheet.getId());

  const prefilledUrl = form.createResponse()
    .withItemResponse(dataIdItem.createResponse('TEST_ID'))
    .withItemResponse(pageUrlItem.createResponse('TEST_URL'))
    .withItemResponse(recordItem.createResponse('TEST_NAME'))
    .toPrefilledUrl();

  console.log('表單公開網址：' + form.getPublishedUrl());
  console.log('預先填入網址：' + prefilledUrl);

  try {
    renameNewResponseSheet_(spreadsheet, existingSheetIds);
  } catch (error) {
    console.warn('表單回覆目的地已設定，但無法自動改名為「' + RESPONSE_SHEET_NAME + '」。請手動將新工作表改名為「' + RESPONSE_SHEET_NAME + '」。原因：' + error.message);
  }
}

function findResponseSpreadsheet_() {
  const files = DriveApp.getFilesByName(RESPONSE_SPREADSHEET_NAME);
  const matches = [];
  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType() === SPREADSHEET_MIME_TYPE) matches.push(file);
  }
  if (matches.length !== 1) {
    throw new Error('找不到唯一的「' + RESPONSE_SPREADSHEET_NAME + '」試算表；請確認名稱與存取權。');
  }
  return SpreadsheetApp.open(matches[0]);
}

function ensureResponseSheetNameAvailable_(spreadsheet) {
  if (spreadsheet.getSheetByName(RESPONSE_SHEET_NAME)) {
    throw new Error('試算表已經有「' + RESPONSE_SHEET_NAME + '」工作表，為避免覆寫，未建立表單。');
  }
}

function renameNewResponseSheet_(spreadsheet, existingSheetIds) {
  const deadline = Date.now() + 10000;
  SpreadsheetApp.flush();
  while (Date.now() < deadline) {
    const newSheets = spreadsheet.getSheets().filter(sheet => !existingSheetIds.has(sheet.getSheetId()));
    if (newSheets.length === 1) {
      newSheets[0].setName(RESPONSE_SHEET_NAME);
      return;
    }
    Utilities.sleep(500);
    SpreadsheetApp.flush();
  }
  throw new Error('等待新建回覆工作表逾時。');
}
