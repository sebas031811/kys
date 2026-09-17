
/**
 * KYS — Cotizador (Google Sheets + Slides)
 * Copia este archivo en Extensiones > Apps Script.
 */

// ─── Configuración ───────────────────────────────────────────────────────────

const CONFIG = {
  SHEET_SALES: 'Ventas',
  QUOTE_PRESENTATION_ID: 'https://docs.google.com/presentation/d/13PGbv_WmRT1ceR1A2eZrVvwm3eBsnaWGJ5GWqVfm7Q8',
  TARGET_SLIDE_INDEX: 0, // 0 = diapositiva 1, 1 = diapositiva 2, etc.
  DEFAULT_PAYMENT_FREQUENCY: 'Mensual',
  PAYMENT_FREQUENCIES: ['Semanal', 'Quincenal', 'Mensual'],
  SALES_FORMULA_ROWS: 500,
  USE_ENGLISH_FUNCTIONS: true, // Coincide con "Usar siempre nombres de función en inglés"
  DEFAULT_PRODUCT_IMAGE_URL: 'https://dplnews.com/wp-content/uploads/2023/03/dplnews_electrodomesticostv.cel_dn240323.png',
  // Tamaño de la imagen en Slides (puntos). Posición: cuadro {{IMAGEN_PRODUCTO}}.
  PRODUCT_IMAGE: {
    width: 280,
    height: 280,
    centerInMarker: true,
  },
  QUOTE_DEFAULTS: {
    text: '—',
    phone: 'No registrado',
    identification: 'No registrada',
    date: '—',
    number: '0',
    currency: '$0',
  },
  BUSINESS: {
    name: 'KYS',
    whatsapp: '+573002683732 ',
    email: 'kyscred@gmail.com',
    address: 'Itagui, Antioquia',
    instagram: '@kis',
    facebook: 'KyS',
    city: 'Itagui',
  },
};

const COL = {
  QUOTE_NUMBER: 1,
  DATE: 2,
  CLIENT: 3,
  CLIENT_ID: 4,
  PHONE: 5,
  PRODUCT: 6,
  PRODUCT_VALUE: 7,
  DOWN_PAYMENT: 8,
  FINANCED: 9,
  RATE: 10,
  INSTALLMENTS: 11,
  FREQUENCY: 12,
  INSTALLMENT: 13,
  OBSERVATIONS: 14,
  UPDATE: 15,
};

const IMAGE_MARKER = '{{IMAGEN_PRODUCTO}}';
const IMAGE_TAG = 'KYS_PRODUCT_IMAGE';
const BINDINGS_KEY = 'QUOTE_PLACEHOLDER_BINDINGS';
const IMAGE_BOX_KEY = 'PRODUCT_IMAGE_BOX';
const EDIT_TRIGGER_HANDLER = 'onEditInstallable';

const SALES_HEADERS = [
  'N° Cotización', 'Fecha', 'Cliente', 'Identificación', 'Teléfono', 'Producto',
  'Valor Producto', 'Cuota Inicial', 'Saldo Financiado', 'Tasa Crédito (%)',
  'N° Cuotas', 'Frecuencia', 'Valor Cuota', 'Observaciones', 'Actualizar',
];

// ─── Menú ────────────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Créditos')
    .addItem('Actualizar cotización', 'updateQuoteFromSelection')
    .addItem('Agregar columna Actualizar (móvil)', 'addUpdateColumn')
    .addItem('Activar actualización por casilla', 'activateCheckboxUpdate')
    .addSeparator()
    .addItem('Reparar fórmulas Ventas', 'repairSalesFormulas')
    .addItem('Reescanear placeholders Slides', 'rescanSlidePlaceholders')
    .addItem('Verificar presentación', 'verifyQuotePresentation')
    .addItem('Configurar hojas (primera vez)', 'setupSheets')
    .addToUi();
}

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const old = ss.getSheetByName('Cotización');
  if (old) ss.deleteSheet(old);

  let sheet = ss.getSheetByName(CONFIG.SHEET_SALES);
  if (!sheet) sheet = ss.insertSheet(CONFIG.SHEET_SALES);

  sheet.getRange(1, 1, 1, SALES_HEADERS.length).setValues([SALES_HEADERS]);
  formatSalesSheet_(sheet);
  SpreadsheetApp.getUi().alert('Hoja Ventas lista. Edita CONFIG.BUSINESS en Apps Script.');
}

function updateQuoteFromSelection() {
  const sale = getSelectedSale_();
  if (!sale) return;

  try {
    const result = updateQuoteForRow_(sale.row);
    var msg = '\n\nPresentación:\n' + result.url;
    if (result.imageNote) msg += '\n\nImagen: ' + result.imageNote;
    SpreadsheetApp.getUi().alert(
      'Cotización actualizada — ' + sale.clientName + ' (N° ' + sale.quoteNumber + ').' + msg
    );
  } catch (e) {
    SpreadsheetApp.getUi().alert('Error en presentación:\n' + e.message);
  }
}

function addUpdateColumn() {
  const sheet = getSalesSheet_();
  if (!sheet) return;
  setupUpdateColumn_(sheet);
  const triggerMsg = ensureEditTrigger_()
    ? '\n\nTrigger de actualización instalado.'
    : '\n\nTrigger ya estaba activo.';
  SpreadsheetApp.getUi().alert(
    'Columna "Actualizar" lista.' + triggerMsg +
      '\n\nMarca la casilla en móvil o PC para actualizar Slides.'
  );
}

function activateCheckboxUpdate() {
  const created = ensureEditTrigger_();
  SpreadsheetApp.getUi().alert(
    created
      ? 'Listo. Al marcar la casilla "Actualizar" se actualizará Slides.'
      : 'El trigger ya estaba activo. Marca la casilla "Actualizar" para actualizar Slides.'
  );
}

function repairSalesFormulas() {
  const sheet = getSalesSheet_();
  if (!sheet) return;
  freezeQuoteColumns_(sheet);
  applySalesFormulas_(sheet);
  SpreadsheetApp.getUi().alert('Fórmulas actualizadas (filas 2 a ' + formulaLastRow_(sheet) + ').');
}

function rescanSlidePlaceholders() {
  try {
    const pres = openPresentation_();
    const count = Object.keys(scanPlaceholderBindings_(pres, true)).length;
    try { pres.saveAndClose(); } catch (e) { /* ok */ }
    SpreadsheetApp.getUi().alert('Placeholders en ' + count + ' cajas de texto.');
  } catch (e) {
    SpreadsheetApp.getUi().alert('Error:\n' + e.message);
  }
}

function verifyQuotePresentation() {
  try {
    const id = extractFileId_(CONFIG.QUOTE_PRESENTATION_ID);
    const file = DriveApp.getFileById(id);
    openPresentation_();
    SpreadsheetApp.getUi().alert('OK — ' + file.getName() + '\nID: ' + id);
  } catch (e) {
    SpreadsheetApp.getUi().alert('Error:\n' + e.message);
  }
}

// ─── Ventas: leer fila y metadatos ───────────────────────────────────────────

// Trigger simple: solo metadatos (N° cotización / fecha). No puede abrir Slides.
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const sheet = e.range.getSheet();
    if (sheet.getName() !== CONFIG.SHEET_SALES) return;
    if (e.range.getRow() < 2 || e.range.getColumn() !== COL.CLIENT) return;
    ensureQuoteMetadata_(sheet, e.range.getRow());
  } catch (err) { /* no bloquear edición */ }
}

// Trigger instalable: actualiza Slides al marcar la casilla (móvil y PC).
function onEditInstallable(e) {
  try {
    if (!e || !e.range) return;
    const sheet = e.range.getSheet();
    if (sheet.getName() !== CONFIG.SHEET_SALES) return;
    if (e.range.getRow() < 2) return;

    const updateCol = getUpdateColumn_(sheet);
    if (e.range.getColumn() === updateCol && isCheckedValue_(e.value)) {
      handleUpdateCheckboxEdit_(e, sheet, updateCol);
    }
  } catch (err) {
    logQuoteDebug_('onEditInstallable: ' + err.message);
  }
}

function ensureEditTrigger_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const exists = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === EDIT_TRIGGER_HANDLER
      && t.getEventType() === ScriptApp.EventType.ON_EDIT;
  });
  if (exists) return false;

  ScriptApp.newTrigger(EDIT_TRIGGER_HANDLER)
    .forSpreadsheet(ss)
    .onEdit()
    .create();
  return true;
}

function handleUpdateCheckboxEdit_(e, sheet, updateCol) {
  updateCol = updateCol || getUpdateColumn_(sheet);
  if (!isCheckedValue_(e.value)) return;

  const row = e.range.getRow();
  const updateCell = sheet.getRange(row, updateCol);
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    updateCell.setValue(false);
    showQuoteToast_('Otra actualización en curso. Intenta de nuevo.');
    return;
  }

  try {
    if (isBlank_(sheet.getRange(row, COL.CLIENT).getValue())) {
      updateCell.setValue(false);
      showQuoteToast_('La fila ' + row + ' no tiene cliente.');
      return;
    }

    ensureQuoteMetadata_(sheet, row);
    const result = updateQuoteForRow_(row, sheet);
    updateCell.setValue(false);

    var msg = 'Cotización actualizada — ' + result.sale.clientName + ' (N° ' + result.sale.quoteNumber + ')';
    if (result.imageNote) msg += '. ' + result.imageNote;
    showQuoteToast_(msg);
    logQuoteDebug_('OK fila ' + row);
  } catch (err) {
    updateCell.setValue(false);
    showQuoteToast_('Error: ' + err.message);
    logQuoteDebug_('Error fila ' + row + ': ' + err.message);
  } finally {
    lock.releaseLock();
  }
}

function updateQuoteForRow_(row, sheet) {
  sheet = sheet || getSalesSheet_();
  if (!sheet) throw new Error('No existe la hoja Ventas.');
  const sale = rowToSale_(sheet, row);
  const result = updatePresentation_(sale, sheet);
  return { sale: sale, url: result.url, imageNote: result.imageNote };
}

function showQuoteToast_(message) {
  SpreadsheetApp.getActiveSpreadsheet().toast(String(message), 'KYS', 8);
}

function getSelectedSale_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSalesSheet_();
  if (!sheet) return null;

  if (ss.getActiveSheet().getName() !== CONFIG.SHEET_SALES) {
    SpreadsheetApp.getUi().alert('Selecciona una fila en la hoja "' + CONFIG.SHEET_SALES + '".');
    return null;
  }

  const row = ss.getActiveRange() ? ss.getActiveRange().getRow() : 0;
  if (row < 2) {
    SpreadsheetApp.getUi().alert('Selecciona una fila de venta (desde la fila 2).');
    return null;
  }

  if (isBlank_(sheet.getRange(row, COL.CLIENT).getValue())) {
    SpreadsheetApp.getUi().alert('La fila ' + row + ' no tiene cliente.');
    return null;
  }

  ensureQuoteMetadata_(sheet, row);
  return rowToSale_(sheet, row);
}

function rowToSale_(sheet, row) {
  const obsCol = getObservationsColumn_(sheet);
  const lastCol = Math.max(obsCol, COL.INSTALLMENT);
  const range = sheet.getRange(row, 1, 1, lastCol);
  const v = range.getValues()[0];
  const d = range.getDisplayValues()[0];
  const obsValue = sheet.getRange(row, obsCol).getValue();

  return {
    row: row,
    quoteNumber: cellText_(v[COL.QUOTE_NUMBER - 1], d[COL.QUOTE_NUMBER - 1]),
    date: cellDate_(v[COL.DATE - 1], d[COL.DATE - 1]),
    clientName: v[COL.CLIENT - 1],
    clientId: v[COL.CLIENT_ID - 1],
    phone: v[COL.PHONE - 1],
    product: v[COL.PRODUCT - 1],
    productValue: num_(v[COL.PRODUCT_VALUE - 1]),
    downPayment: num_(v[COL.DOWN_PAYMENT - 1]),
    financedBalance: num_(v[COL.FINANCED - 1]),
    monthlyRate: num_(v[COL.RATE - 1]),
    installments: num_(v[COL.INSTALLMENTS - 1]),
    frequency: resolveFrequency_(v[COL.FREQUENCY - 1]),
    installmentValue: num_(v[COL.INSTALLMENT - 1]),
    productImageUrl: normalizeDriveUrl_(obsValue),
  };
}

function ensureQuoteMetadata_(sheet, row) {
  if (row < 2 || isBlank_(sheet.getRange(row, COL.CLIENT).getValue())) return;

  const quoteCell = sheet.getRange(row, COL.QUOTE_NUMBER);
  const dateCell = sheet.getRange(row, COL.DATE);

  if (isBlank_(quoteCell.getValue())) {
    quoteCell.setValue(nextQuoteNumber_(sheet, row));
  }
  if (isBlank_(dateCell.getValue())) {
    dateCell.setValue(new Date());
  }
}

function nextQuoteNumber_(sheet, row) {
  if (row <= 2) return 1;
  const prev = sheet.getRange(2, COL.QUOTE_NUMBER, row - 2, 1).getValues();
  var max = 0;
  prev.forEach(function (r) {
    const n = Number(r[0]);
    if (!isNaN(n) && n > max) max = n;
  });
  return max + 1;
}

// ─── Ventas: fórmulas y formato ──────────────────────────────────────────────

function formatSalesSheet_(sheet) {
  sheet.setFrozenRows(1);
  freezeQuoteColumns_(sheet);
  applySalesFormulas_(sheet);

  sheet.getRange('G2:G').setNumberFormat('$#,##0');
  sheet.getRange('H2:H').setNumberFormat('$#,##0');
  sheet.getRange('I2:I').setNumberFormat('$#,##0');
  sheet.getRange('M2:M').setNumberFormat('$#,##0');
  sheet.getRange('B2:B').setNumberFormat('dd/mm/yyyy');
  sheet.getRange('J2:J').setNumberFormat('0.00%');

  const rows = formulaLastRow_(sheet) - 1;
  const freqRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(CONFIG.PAYMENT_FREQUENCIES, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, COL.FREQUENCY, rows, 1).setDataValidation(freqRule);

  const hdr = sheet.getRange(1, 1, 1, SALES_HEADERS.length);
  hdr.setBackground('#1a365d').setFontColor('#ffffff').setFontWeight('bold');
  sheet.setColumnWidths(1, SALES_HEADERS.length, 120);
  sheet.setColumnWidth(COL.CLIENT, 180);
  sheet.setColumnWidth(COL.PRODUCT, 160);
  sheet.setColumnWidth(COL.FREQUENCY, 110);
  sheet.setColumnWidth(COL.OBSERVATIONS, 220);
  setupUpdateColumn_(sheet);
}

function setupUpdateColumn_(sheet) {
  const header = sheet.getRange(1, COL.UPDATE);
  header.setValue('Actualizar');
  header.setBackground('#1a365d').setFontColor('#ffffff').setFontWeight('bold');

  const rows = formulaLastRow_(sheet) - 1;
  if (rows < 1) return;

  const rule = SpreadsheetApp.newDataValidation()
    .requireCheckbox()
    .build();
  sheet.getRange(2, COL.UPDATE, rows, 1).setDataValidation(rule);
  sheet.setColumnWidth(COL.UPDATE, 90);
}

function getUpdateColumn_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), COL.UPDATE);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim().toLowerCase() === 'actualizar') return i + 1;
  }
  return COL.UPDATE;
}

function getObservationsColumn_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), COL.OBSERVATIONS);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const aliases = ['observaciones', 'link imagen', 'imagen / link', 'imagen o link'];
  for (var i = 0; i < headers.length; i++) {
    if (aliases.indexOf(String(headers[i]).trim().toLowerCase()) !== -1) return i + 1;
  }
  return COL.OBSERVATIONS;
}

function isCheckedValue_(value) {
  if (value === true) return true;
  if (value === false || value === null || value === '') return false;
  return String(value).trim().toUpperCase() === 'TRUE';
}

function logQuoteDebug_(message) {
  try {
    PropertiesService.getScriptProperties().setProperty(
      'LAST_QUOTE_DEBUG',
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss') + ' — ' + message
    );
  } catch (e) { /* ok */ }
}

function freezeQuoteColumns_(sheet) {
  const last = Math.max(sheet.getLastRow(), 2);
  const rows = last - 1;
  if (rows < 1) return;

  const range = sheet.getRange(2, COL.QUOTE_NUMBER, rows, 2);
  range.setValues(range.getValues()); // fórmula → valor fijo

  for (var r = 2; r <= last; r++) {
    ensureQuoteMetadata_(sheet, r);
  }
}

function applySalesFormulas_(sheet) {
  const last = formulaLastRow_(sheet);
  const f = salesFormulas_();
  setColumnFormula_(sheet, COL.FINANCED, last, f.financed);
  setColumnFormula_(sheet, COL.INSTALLMENT, last, f.installment);
}

function salesFormulas_() {
  const s = formulaSep_();
  const IF = CONFIG.USE_ENGLISH_FUNCTIONS ? 'IF' : 'SI';
  const rate = IF + '(J2>1' + s + 'J2/100' + s + 'J2)';

  return {
    financed: '=' + IF + '(G2=""' + s + '""' + s + 'G2-H2)',
    installment: '=' + IF + '(I2=""' + s + '""' + s + IF + '(K2=0' + s + '""' + s + 'I2*(1+' + rate + ')/K2))',
  };
}

function setColumnFormula_(sheet, col, lastRow, formula) {
  const cell = sheet.getRange(2, col);
  cell.setFormula(formula);
  if (lastRow > 2) {
    cell.copyTo(
      sheet.getRange(3, col, lastRow - 2, 1),
      SpreadsheetApp.CopyPasteType.PASTE_FORMULA,
      false
    );
  }
}

function formulaLastRow_(sheet) {
  return Math.max(sheet.getLastRow() + 20, CONFIG.SALES_FORMULA_ROWS);
}

function formulaSep_() {
  const loc = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetLocale() || 'en_US';
  return loc === 'en_US' || loc.indexOf('en') === 0 ? ',' : ';';
}

// ─── Google Slides: texto ────────────────────────────────────────────────────

function updatePresentation_(sale, sheet) {
  sheet = sheet || getSalesSheet_();
  const pres = openPresentation_();
  refreshImageSlot_(pres);
  applySlideText_(pres, buildReplacements_(sale));
  const imageResult = resolveProductImage_(sheet, sale.row);
  const imageNote = insertProductImage_(pres, imageResult);
  try { pres.saveAndClose(); } catch (e) { /* ok */ }
  return { url: pres.getUrl(), imageNote: imageNote };
}

function buildReplacements_(sale) {
  const b = CONFIG.BUSINESS;
  const d = CONFIG.QUOTE_DEFAULTS;
  return {
    '{{CLIENTE}}': textOrDefault_(sale.clientName, d.text),
    '{{PRODUCTO}}': textOrDefault_(sale.product, d.text),
    '{{CUOTA_INICIAL}}': moneyOrDefault_(sale.downPayment, d.currency),
    '{{NUM_CUOTAS}}': textOrDefault_(sale.installments, d.number),
    '{{FRECUENCIA}}': textOrDefault_(sale.frequency, CONFIG.DEFAULT_PAYMENT_FREQUENCY),
    '{{VALOR_CUOTA}}': moneyOrDefault_(sale.installmentValue, d.currency),
    '{{NUM_COTIZACION}}': textOrDefault_(sale.quoteNumber, d.number),
    '{{FECHA}}': textOrDefault_(sale.date, d.date),
    '{{TELEFONO}}': textOrDefault_(sale.phone, d.phone),
    '{{IDENTIFICACION}}': textOrDefault_(sale.clientId, d.identification),
    '{{VALOR_PRODUCTO}}': moneyOrDefault_(sale.productValue, d.currency),
    '{{SALDO_FINANCIADO}}': moneyOrDefault_(sale.financedBalance, d.currency),
    '{{NEGOCIO}}': textOrDefault_(b.name, d.text),
    '{{WHATSAPP}}': textOrDefault_(String(b.whatsapp || '').trim(), d.phone),
    '{{EMAIL}}': textOrDefault_(b.email, d.text),
    '{{DIRECCION}}': textOrDefault_(b.address, d.text),
  };
}

function applySlideText_(pres, replacements) {
  var bindings = loadJson_(BINDINGS_KEY, {});
  const discovered = discoverPlaceholdersOnTargetSlide_(pres);

  // Agrega placeholders nuevos sin borrar plantillas ya guardadas.
  Object.keys(discovered).forEach(function (id) {
    bindings[id] = discovered[id];
  });

  if (Object.keys(bindings).length === 0) {
    throw new Error(
      'No hay placeholders en la diapositiva 1.\n' +
        'Agrega textos como {{CLIENTE}} y ejecuta "Reescanear placeholders Slides".'
    );
  }

  savePlaceholderBindings_(bindings);

  var updated = 0;
  Object.keys(bindings).forEach(function (id) {
    const el = findElementById_(pres, id);
    if (!el) return;
    var text = bindings[id];
    Object.keys(replacements).forEach(function (ph) {
      text = text.split(ph).join(replacements[ph]);
    });
    el.asShape().getText().setText(text);
    updated++;
  });

  if (updated === 0) {
    throw new Error(
      'No se encontraron las cajas de texto guardadas.\n' +
        'Vuelve a poner {{CLIENTE}}, {{FECHA}}, etc. en la diapositiva 1 y ejecuta "Reescanear placeholders Slides".'
    );
  }
}

function discoverPlaceholdersOnTargetSlide_(pres) {
  const bindings = {};
  const target = getTargetSlide_(pres);

  target.slide.getPageElements().forEach(function (el) {
    if (el.getPageElementType() !== SlidesApp.PageElementType.SHAPE) return;
    const content = el.asShape().getText().asString();
    if (content.indexOf('{{') !== -1 && content.indexOf('}}') !== -1) {
      bindings[el.getObjectId()] = content;
    }
  });

  return bindings;
}

function scanPlaceholderBindings_(pres, reset) {
  var bindings = reset ? {} : loadJson_(BINDINGS_KEY, {});
  const discovered = discoverPlaceholdersOnTargetSlide_(pres);

  if (reset) {
    bindings = discovered;
  } else {
    Object.keys(discovered).forEach(function (id) {
      bindings[id] = discovered[id];
    });
  }

  savePlaceholderBindings_(bindings);
  return bindings;
}

function savePlaceholderBindings_(bindings) {
  PropertiesService.getScriptProperties().setProperty(BINDINGS_KEY, JSON.stringify(bindings));
}

// ─── Google Slides: imagen ───────────────────────────────────────────────────

function resolveProductImage_(sheet, row) {
  const col = getObservationsColumn_(sheet);
  const cell = sheet.getRange(row, col);
  const hadCellImage = isCellImageValue_(cell.getValue());

  var blob = getCellImageBlob_(cell);
  if (blob) return { blob: blob, source: 'cell', attemptedLink: false, hadCellImage: true };

  blob = getAnchoredCellImageBlob_(sheet, row, col);
  if (blob) return { blob: blob, source: 'cell', attemptedLink: false, hadCellImage: true };

  var embeddedUri = getEmbeddedCellImageUri_(sheet, row, col);
  if (!isBlank_(embeddedUri)) {
    blob = fetchImageBlob_(embeddedUri);
    if (blob) return { blob: blob, source: 'cell', attemptedLink: false, hadCellImage: true };
  }

  var formulaUrl = extractImageFormulaUrl_(cell);
  if (!isBlank_(formulaUrl)) {
    blob = fetchImageBlob_(formulaUrl);
    if (blob) return { blob: blob, source: 'link', attemptedLink: true, hadCellImage: hadCellImage };
  }

  if (!hadCellImage) {
    var url = normalizeDriveUrl_(cell.getValue());
    if (!isBlank_(url)) {
      blob = fetchImageBlob_(url);
      if (blob) return { blob: blob, source: 'link', attemptedLink: true, hadCellImage: false };
    }
  }

  return {
    blob: null,
    source: hadCellImage ? 'cell' : 'none',
    attemptedLink: !isBlank_(formulaUrl),
    hadCellImage: hadCellImage,
  };
}

function isCellImageValue_(value) {
  if (!value || typeof value !== 'object') return false;
  try {
    if (value.valueType === SpreadsheetApp.ValueType.IMAGE) return true;
  } catch (e) { /* ok */ }
  return typeof value.getContentUrl === 'function';
}

function getCellImageBlob_(cell) {
  const value = cell.getValue();
  if (!isCellImageValue_(value)) return null;

  try {
    const contentUrl = String(value.getContentUrl() || '').trim();
    if (!isBlank_(contentUrl)) {
      var blob = fetchAuthenticatedImageBlob_(contentUrl);
      if (blob) return blob;
      blob = fetchImageBlob_(contentUrl);
      if (blob) return blob;
    }
  } catch (e) {
    logQuoteDebug_('CellImage Observaciones: ' + e.message);
  }

  return null;
}

function fetchAuthenticatedImageBlob_(url) {
  if (isBlank_(url)) return null;

  try {
    // SECURITY-REVIEW: URL firmada de Google Sheets/Drive; requiere token del script.
    const res = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true,
      followRedirects: true,
    });
    if (res.getResponseCode() !== 200) return null;

    const blob = res.getBlob();
    const type = blob.getContentType() || '';
    if (type.indexOf('image') === 0 || type === 'application/octet-stream') return blob;
    return null;
  } catch (e) {
    return null;
  }
}

function getAnchoredCellImageBlob_(sheet, row, col) {
  const images = sheet.getImages();
  for (var i = 0; i < images.length; i++) {
    try {
      const anchor = images[i].getAnchorCell();
      if (anchor && anchor.getRow() === row && anchor.getColumn() === col) {
        return images[i].getBlob();
      }
    } catch (e) { /* siguiente imagen */ }
  }
  return null;
}

function getEmbeddedCellImageUri_(sheet, row, col) {
  const ssId = sheet.getParent().getId();
  const range = encodeURIComponent("'" + sheet.getName().replace(/'/g, "''") + "'!" + cellA1_(row, col));
  const apiUrl = 'https://sheets.googleapis.com/v4/spreadsheets/' + ssId
    + '?ranges=' + range
    + '&fields=sheets.data.rowData.values.userEnteredValue';

  try {
    // SECURITY-REVIEW: lectura de celda propia del spreadsheet vinculado al script.
    const res = UrlFetchApp.fetch(apiUrl, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) return '';

    const payload = JSON.parse(res.getContentText());
    const values = payload.sheets
      && payload.sheets[0]
      && payload.sheets[0].data
      && payload.sheets[0].data[0]
      && payload.sheets[0].data[0].rowData
      && payload.sheets[0].data[0].rowData[0]
      && payload.sheets[0].data[0].rowData[0].values;
    if (!values || !values[0]) return '';

    const image = values[0].userEnteredValue && values[0].userEnteredValue.image;
    if (!image) return '';

    return String(image.sourceUri || image.contentUri || '').trim();
  } catch (e) {
    return '';
  }
}

function extractImageFormulaUrl_(cell) {
  const formula = String(cell.getFormula() || '').trim();
  if (!formula) return '';

  const quoted = formula.match(/^=IMAGE\s*\(\s*"([^"]+)"/i)
    || formula.match(/^=IMAGE\s*\(\s*'([^']+)'/i);
  if (quoted) return quoted[1];

  const unquoted = formula.match(/^=IMAGE\s*\(\s*([^,)]+)/i);
  if (!unquoted) return '';

  return String(unquoted[1] || '').trim().replace(/^["']|["']$/g, '');
}

function cellA1_(row, col) {
  var letters = '';
  var n = col;
  while (n > 0) {
    var rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters + row;
}

function refreshImageSlot_(pres) {
  const target = getTargetSlide_(pres);

  target.slide.getImages().forEach(function (img) {
    if (img.getDescription() === IMAGE_TAG) img.remove();
  });

  if (findShapeWithText_(pres, IMAGE_MARKER)) return;

  const box = loadJson_(IMAGE_BOX_KEY, null) || defaultImageBox_(pres);
  if (!box) return;

  const shape = target.slide.insertShape(SlidesApp.ShapeType.RECTANGLE, box.left, box.top, box.width, box.height);
  shape.getText().setText(IMAGE_MARKER);
  shape.getFill().setTransparent();
  shape.getBorder().getLineFill().setSolidFill('#cbd5e0');
}

function insertProductImage_(pres, imageResult) {
  imageResult = imageResult || { blob: null, source: 'none', attemptedLink: false, hadCellImage: false };

  const slot = findShapeWithText_(pres, IMAGE_MARKER);
  if (!slot) return 'Sin marcador ' + IMAGE_MARKER + ' en la presentación.';

  const box = resolveImageBox_(slot);
  PropertiesService.getScriptProperties().setProperty(IMAGE_BOX_KEY, JSON.stringify(box));
  slot.element.remove();

  var usedDefault = false;
  var blob = imageResult.blob;
  if (!blob && !isBlank_(CONFIG.DEFAULT_PRODUCT_IMAGE_URL)) {
    blob = fetchImageBlob_(CONFIG.DEFAULT_PRODUCT_IMAGE_URL);
    usedDefault = !!blob;
  }

  if (!blob) {
    refreshImageSlot_(pres);
    if (isBlank_(CONFIG.DEFAULT_PRODUCT_IMAGE_URL) && imageResult.source === 'none') {
      return 'Sin imagen (Observaciones vacía y sin DEFAULT_PRODUCT_IMAGE_URL).';
    }
    throw new Error('No se pudo cargar la imagen del producto ni la imagen por defecto.');
  }

  const img = slot.slide.insertImage(blob);
  img.setLeft(box.left).setTop(box.top).setWidth(box.width).setHeight(box.height);
  img.setDescription(IMAGE_TAG);

  if (usedDefault && imageResult.hadCellImage) {
    return 'Se usó la imagen por defecto (no se pudo descargar la imagen en Observaciones).';
  }
  if (usedDefault && imageResult.attemptedLink) {
    return 'Se usó la imagen por defecto (la imagen/link del producto no funcionó).';
  }
  if (usedDefault && imageResult.source === 'cell') {
    return 'Se usó la imagen por defecto (no se pudo leer la imagen de la celda).';
  }
  if (usedDefault) return 'Se usó la imagen por defecto.';
  if (imageResult.source === 'cell') return 'Imagen de Observaciones insertada.';
  if (imageResult.source === 'link') return 'Imagen del link insertada.';
  return 'Imagen actualizada.';
}

function resolveImageBox_(slot) {
  const cfg = CONFIG.PRODUCT_IMAGE || {};
  const markerLeft = slot.element.getLeft();
  const markerTop = slot.element.getTop();
  const markerW = slot.element.getWidth();
  const markerH = slot.element.getHeight();

  const width = cfg.width > 0 ? cfg.width : markerW;
  const height = cfg.height > 0 ? cfg.height : markerH;
  var left = markerLeft;
  var top = markerTop;

  if (cfg.centerInMarker !== false) {
    left = markerLeft + (markerW - width) / 2;
    top = markerTop + (markerH - height) / 2;
  }

  return {
    left: left,
    top: top,
    width: width,
    height: height,
    slideIndex: getTargetSlideIndex_(),
  };
}

function defaultImageBox_(pres) {
  const cfg = CONFIG.PRODUCT_IMAGE || {};
  if (!(cfg.width > 0) || !(cfg.height > 0)) return null;

  getTargetSlide_(pres);

  return {
    left: cfg.left > 0 ? cfg.left : 50,
    top: cfg.top > 0 ? cfg.top : 100,
    width: cfg.width,
    height: cfg.height,
    slideIndex: getTargetSlideIndex_(),
  };
}

function getTargetSlideIndex_() {
  return typeof CONFIG.TARGET_SLIDE_INDEX === 'number' ? CONFIG.TARGET_SLIDE_INDEX : 0;
}

function getTargetSlide_(pres) {
  const slides = pres.getSlides();
  const idx = getTargetSlideIndex_();
  if (idx < 0 || idx >= slides.length) {
    throw new Error('La presentación no tiene la diapositiva ' + (idx + 1) + '.');
  }
  return { slide: slides[idx], index: idx };
}

function fetchImageBlob_(url) {
  const normalized = normalizeDriveUrl_(url);
  if (isBlank_(normalized)) return null;

  const driveId = normalized.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (driveId) {
    try { return DriveApp.getFileById(driveId[1]).getBlob(); } catch (e) { /* http fallback */ }
  }

  if (isGoogleHostedUrl_(normalized)) {
    var authed = fetchAuthenticatedImageBlob_(normalized);
    if (authed) return authed;
  }

  try {
    // SECURITY-REVIEW: URL del usuario o CONFIG; solo para descargar imagen.
    var res = UrlFetchApp.fetch(normalized, { muteHttpExceptions: true, followRedirects: true });
    if (res.getResponseCode() !== 200 && isGoogleHostedUrl_(normalized)) {
      res = UrlFetchApp.fetch(normalized, {
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true,
        followRedirects: true,
      });
    }
    if (res.getResponseCode() !== 200) return null;
    const blob = res.getBlob();
    return (blob.getContentType() || '').indexOf('image') === 0 ? blob : null;
  } catch (e) {
    return null;
  }
}

function isGoogleHostedUrl_(url) {
  return /(?:googleusercontent\.com|google\.com|gstatic\.com|ggpht\.com)/i.test(String(url || ''));
}

// ─── Google Slides: acceso ───────────────────────────────────────────────────

function openPresentation_() {
  const id = extractFileId_(CONFIG.QUOTE_PRESENTATION_ID);
  if (!id) throw new Error('QUOTE_PRESENTATION_ID vacío en CONFIG.');

  let file;
  try { file = DriveApp.getFileById(id); } catch (e) {
    throw new Error('No se encontró la presentación. Revisa QUOTE_PRESENTATION_ID.');
  }

  if (file.getMimeType() !== 'application/vnd.google-apps.presentation') {
    throw new Error('"' + file.getName() + '" no es Google Slides. Usa Archivo → Guardar como Google Slides.');
  }

  try { return SlidesApp.openById(id); } catch (e) {
    throw new Error('Sin permiso de edición en la presentación.');
  }
}

function extractFileId_(urlOrId) {
  const raw = String(urlOrId || '').trim();
  const m = raw.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : raw;
}

// ─── Utilidades Slides ───────────────────────────────────────────────────────

function findShapeWithText_(pres, search) {
  const target = getTargetSlide_(pres);
  var found = null;

  target.slide.getPageElements().forEach(function (el) {
    if (found || el.getPageElementType() !== SlidesApp.PageElementType.SHAPE) return;
    if (el.asShape().getText().asString().indexOf(search) !== -1) {
      found = { slide: target.slide, element: el, slideIndex: target.index };
    }
  });

  return found;
}

function findElementById_(pres, objectId) {
  try {
    return getTargetSlide_(pres).slide.getPageElementById(objectId);
  } catch (e) {
    return null;
  }
}

// ─── Utilidades generales ────────────────────────────────────────────────────

function getSalesSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_SALES);
  if (!sheet) SpreadsheetApp.getUi().alert('No existe la hoja "' + CONFIG.SHEET_SALES + '".');
  return sheet;
}

function loadJson_(key, fallback) {
  const raw = PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch (e) { return fallback; }
}

function isBlank_(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

function num_(v) {
  return Number(v) || 0;
}

function textOrDefault_(v, def) {
  return isBlank_(v) ? def : String(v).trim();
}

function moneyOrDefault_(v, def) {
  return isBlank_(v) ? def : formatMoney_(v);
}

function formatMoney_(v) {
  const n = Math.round(num_(v));
  return '$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatDate_(date) {
  if (!date) return '';
  if (date instanceof Date) {
    return Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  }
  return String(date);
}

function cellText_(raw, display) {
  return isBlank_(display) ? (isBlank_(raw) ? '' : String(raw).trim()) : String(display).trim();
}

function cellDate_(raw, display) {
  if (raw instanceof Date && !isNaN(raw.getTime())) return formatDate_(raw);
  return isBlank_(display) ? formatDate_(raw) : String(display).trim();
}

function resolveFrequency_(v) {
  const t = String(v || '').trim();
  return CONFIG.PAYMENT_FREQUENCIES.indexOf(t) !== -1 ? t : CONFIG.DEFAULT_PAYMENT_FREQUENCY;
}

function normalizeDriveUrl_(url) {
  const raw = String(url || '').trim();
  if (isBlank_(raw)) return '';
  const m = raw.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/)
    || raw.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/)
    || raw.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? 'https://drive.google.com/uc?export=view&id=' + m[1] : raw;
}
