
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
  IMAGE_URL: 14,
};

const IMAGE_MARKER = '{{IMAGEN_PRODUCTO}}';
const IMAGE_TAG = 'KYS_PRODUCT_IMAGE';
const BINDINGS_KEY = 'QUOTE_PLACEHOLDER_BINDINGS';
const IMAGE_BOX_KEY = 'PRODUCT_IMAGE_BOX';

const SALES_HEADERS = [
  'N° Cotización', 'Fecha', 'Cliente', 'Identificación', 'Teléfono', 'Producto',
  'Valor Producto', 'Cuota Inicial', 'Saldo Financiado', 'Tasa Crédito (%)',
  'N° Cuotas', 'Frecuencia', 'Valor Cuota', 'Link Imagen',
];

// ─── Menú ────────────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Créditos')
    .addItem('Actualizar cotización', 'updateQuoteFromSelection')
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

  var msg = '';
  try {
    const result = updatePresentation_(sale);
    msg = '\n\nPresentación:\n' + result.url;
    if (result.imageNote) msg += '\n\nImagen: ' + result.imageNote;
  } catch (e) {
    msg = '\n\nError en presentación:\n' + e.message;
  }

  SpreadsheetApp.getUi().alert(
    'Cotización actualizada — ' + sale.clientName + ' (N° ' + sale.quoteNumber + ').' + msg
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

function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const sheet = e.range.getSheet();
    if (sheet.getName() !== CONFIG.SHEET_SALES) return;
    if (e.range.getRow() < 2 || e.range.getColumn() !== COL.CLIENT) return;
    ensureQuoteMetadata_(sheet, e.range.getRow());
  } catch (err) { /* no bloquear edición */ }
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
  const range = sheet.getRange(row, 1, 1, COL.IMAGE_URL);
  const v = range.getValues()[0];
  const d = range.getDisplayValues()[0];

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
    productImageUrl: normalizeDriveUrl_(v[COL.IMAGE_URL - 1]),
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
  sheet.setColumnWidth(COL.IMAGE_URL, 220);
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

function updatePresentation_(sale) {
  const pres = openPresentation_();
  refreshImageSlot_(pres);
  applySlideText_(pres, buildReplacements_(sale));
  const imageNote = insertProductImage_(pres, sale.productImageUrl);
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

function insertProductImage_(pres, imageUrl) {
  const slot = findShapeWithText_(pres, IMAGE_MARKER);
  if (!slot) return 'Sin marcador ' + IMAGE_MARKER + ' en la presentación.';

  const box = resolveImageBox_(slot);
  PropertiesService.getScriptProperties().setProperty(IMAGE_BOX_KEY, JSON.stringify(box));
  slot.element.remove();

  var usedDefault = false;
  var blob = fetchImageBlob_(imageUrl);
  if (!blob && !isBlank_(CONFIG.DEFAULT_PRODUCT_IMAGE_URL)) {
    blob = fetchImageBlob_(CONFIG.DEFAULT_PRODUCT_IMAGE_URL);
    usedDefault = !!blob;
  }

  if (!blob) {
    refreshImageSlot_(pres);
    if (isBlank_(CONFIG.DEFAULT_PRODUCT_IMAGE_URL) && isBlank_(imageUrl)) {
      return 'Sin imagen (columna N vacía y sin DEFAULT_PRODUCT_IMAGE_URL).';
    }
    throw new Error('No se pudo cargar la imagen del producto ni la imagen por defecto.');
  }

  const img = slot.slide.insertImage(blob);
  img.setLeft(box.left).setTop(box.top).setWidth(box.width).setHeight(box.height);
  img.setDescription(IMAGE_TAG);

  if (usedDefault && !isBlank_(imageUrl)) {
    return 'Se usó la imagen por defecto (el link del producto no funcionó).';
  }
  if (usedDefault) return 'Se usó la imagen por defecto.';
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

  try {
    // SECURITY-REVIEW: URL del usuario o CONFIG; solo para descargar imagen.
    const res = UrlFetchApp.fetch(normalized, { muteHttpExceptions: true, followRedirects: true });
    if (res.getResponseCode() !== 200) return null;
    const blob = res.getBlob();
    return (blob.getContentType() || '').indexOf('image') === 0 ? blob : null;
  } catch (e) {
    return null;
  }
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
