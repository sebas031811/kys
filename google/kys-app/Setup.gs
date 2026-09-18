function kysSetupSheets() {
  var ss = getSpreadsheet_();
  Object.keys(KYS_HEADERS).forEach(function (sheetName) {
    var sh = ss.getSheetByName(sheetName);
    if (!sh) sh = ss.insertSheet(sheetName);
    var headers = KYS_HEADERS[sheetName];
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  });
  seedAdminIfEmpty_();
  SpreadsheetApp.getUi().alert('KYS sheets ready. Deploy the web app (Deploy → New deployment → Web app).');
}

function kysBindSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  setSpreadsheetId_(ss.getId());
  kysSetupSheets();
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('KYS')
    .addItem('Setup sheets', 'kysSetupSheets')
    .addItem('Bind this spreadsheet', 'kysBindSpreadsheet')
    .addToUi();
}
