function kysMigrarEncabezados() {
  ensureSpreadsheetBound_();
  var ss = getSpreadsheet_();
  var ui = SpreadsheetApp.getUi();
  Object.keys(KYS_HEADERS).forEach(function (sheetName) {
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return;
    migrateSheetHeaders_(sh, sheetName);
  });
  ui.alert('Migración completada. Encabezados en español y columnas nuevas aplicadas.');
}

function migrateSheetHeaders_(sh, sheetName) {
  var targetHeaders = KYS_HEADERS[sheetName];
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var lastRow = Math.max(sh.getLastRow(), 1);
  if (lastRow < 1) lastRow = 1;

  var currentHeaders = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return String(h || '').trim();
  });

  var legacyMap = KYS_LEGACY_HEADER_MAP_[sheetName] || {};
  var headerIndex = {};
  currentHeaders.forEach(function (h, i) {
    if (h) headerIndex[h] = i;
  });

  var needsDataRewrite = false;
  Object.keys(legacyMap).forEach(function (oldKey) {
    if (headerIndex[oldKey] != null && headerIndex[legacyMap[oldKey]] == null) {
      needsDataRewrite = true;
    }
  });

  if (needsDataRewrite && lastRow > 1) {
    var dataRows = sh.getRange(2, 1, lastRow, lastCol).getValues();
    var rewritten = dataRows.map(function (row) {
      var obj = {};
      currentHeaders.forEach(function (h, c) {
        if (h) obj[h] = row[c];
      });
      Object.keys(legacyMap).forEach(function (oldKey) {
        if (obj[oldKey] !== undefined && obj[legacyMap[oldKey]] === undefined) {
          obj[legacyMap[oldKey]] = obj[oldKey];
          delete obj[oldKey];
        }
      });
      if (sheetName === 'Cuotas' && obj.estado) {
        obj.estado = mapEstadoCuotaToSheet_(obj.estado);
      }
      return obj;
    });
    writeObjectsFromHeaders_(sh, targetHeaders, rewritten);
    return;
  }

  ensureSheetHeaderRow_(sh, targetHeaders);
}

function ensureSheetHeaderRow_(sh, targetHeaders) {
  var lastCol = Math.max(sh.getLastColumn(), targetHeaders.length);
  var current = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return String(h || '').trim();
  });
  var set = {};
  current.forEach(function (h) {
    if (h) set[h] = true;
  });
  targetHeaders.forEach(function (h) {
    if (!set[h]) {
      var col = sh.getLastColumn() + 1;
      sh.getRange(1, col).setValue(h);
      set[h] = true;
    }
  });
  sh.getRange(1, 1, 1, targetHeaders.length).setValues([targetHeaders]);
  sh.setFrozenRows(1);
}

function writeObjectsFromHeaders_(sh, headers, objects) {
  sh.clearContents();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (!objects.length) return;
  var matrix = objects.map(function (o) {
    return headers.map(function (h) {
      return o[h] != null ? o[h] : '';
    });
  });
  sh.getRange(2, 1, objects.length, headers.length).setValues(matrix);
}

function ensureMissingColumnsOnSetup_(sh, sheetName) {
  ensureSheetHeaderRow_(sh, KYS_HEADERS[sheetName]);
}
