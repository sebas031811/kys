var KYS_WEB_APP_URL_PROPERTY = 'KYS_WEB_APP_URL';

function kysSetupSheets() {
  ensureSpreadsheetBound_();
  var ss = getSpreadsheet_();
  Object.keys(KYS_HEADERS).forEach(function (sheetName) {
    var sh = ss.getSheetByName(sheetName);
    if (!sh) sh = ss.insertSheet(sheetName);
    var headers = KYS_HEADERS[sheetName];
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  });
  seedAdminIfEmpty_();
  SpreadsheetApp.getUi().alert(
    'Hojas KYS listas.\n\n' +
      '1) Copia Index.html (npm run build) en Apps Script\n' +
      '2) Deploy → Web app\n' +
      '3) KYS → Guardar URL de la app'
  );
}

function kysBindSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('Abre el proyecto desde Extensiones → Apps Script en tu Google Sheet.');
  }
  setSpreadsheetId_(ss.getId());
  kysSetupSheets();
}

function kysFirstTimeSetup() {
  kysBindSpreadsheet();
  showDeployGuideDialog_();
}

function showDeployGuideDialog_() {
  var html = HtmlService.createHtmlOutput(
    '<style>body{font-family:system-ui;padding:8px;line-height:1.5}' +
      'ol{padding-left:1.2rem}code{background:#eee;padding:2px 6px;border-radius:4px}</style>' +
      '<h2>Base de datos lista</h2>' +
      '<p>Esta hoja tiene las pestañas: Ventas, Cuotas, Pagos, Clientes, Cuentas, Usuarios.</p>' +
      '<p><strong>Para la página de formularios:</strong></p>' +
      '<ol>' +
      '<li>En tu PC: <code>cd frontend</code> → <code>npm run build</code></li>' +
      '<li>Apps Script: pega <code>Index.html</code> del repo</li>' +
      '<li><strong>Implementar → Nueva implementación → App web</strong><br/>' +
      'Ejecutar como: Yo · Acceso: Cualquier persona</li>' +
      '<li>Copia la URL <code>/exec</code></li>' +
      '<li>Menú <strong>KYS → Guardar URL de la app</strong></li>' +
      '</ol>' +
      '<p>Login inicial: <code>admin@kyscred.com</code> / <code>admin123</code></p>'
  )
    .setWidth(480)
    .setHeight(420);
  SpreadsheetApp.getUi().showModalDialog(html, 'KYS — Página de formularios');
}

function kysSetWebAppUrl() {
  var ui = SpreadsheetApp.getUi();
  var existing = PropertiesService.getScriptProperties().getProperty(KYS_WEB_APP_URL_PROPERTY) || '';
  var r = ui.prompt('URL de la app web (termina en /exec)', existing, ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var url = String(r.getResponseText() || '').trim();
  if (!url) return;
  PropertiesService.getScriptProperties().setProperty(KYS_WEB_APP_URL_PROPERTY, url);
  ui.alert('URL guardada. Usa KYS → Abrir app (formularios).');
}

function kysOpenWebApp() {
  var url = PropertiesService.getScriptProperties().getProperty(KYS_WEB_APP_URL_PROPERTY);
  if (!url) {
    SpreadsheetApp.getUi().alert('Primero: KYS → Guardar URL de la app (después del Deploy).');
    return;
  }
  var safe = url.replace(/"/g, '');
  var html = HtmlService.createHtmlOutput(
    '<p><a href="' + safe + '" target="_blank" rel="noopener noreferrer">Abrir KYS en nueva pestaña</a></p>' +
    '<script>window.open("' + safe + '");</script>'
  )
    .setWidth(320)
    .setHeight(80);
  SpreadsheetApp.getUi().showModalDialog(html, 'KYS');
}

function ensureSpreadsheetBound_() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) setSpreadsheetId_(ss.getId());
  } catch (e) { /* standalone script */ }
}

function onOpen() {
  ensureSpreadsheetBound_();
  SpreadsheetApp.getUi()
    .createMenu('KYS')
    .addItem('Inicializar (primera vez)', 'kysFirstTimeSetup')
    .addSeparator()
    .addItem('Abrir app (formularios)', 'kysOpenWebApp')
    .addItem('Guardar URL de la app', 'kysSetWebAppUrl')
    .addSeparator()
    .addItem('Reparar hojas / datos', 'kysSetupSheets')
    .addToUi();
}
