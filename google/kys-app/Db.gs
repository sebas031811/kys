function getSheet_(name) {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Falta la hoja: ' + name + '. Ejecuta KYS → Inicializar (primera vez).');
  return sh;
}

function headersForSheet_(sh) {
  var name = sh.getName();
  var headers = KYS_HEADERS[name];
  if (!headers) throw new Error('Encabezados desconocidos para ' + name);
  return headers;
}

function sheetToObjects_(sh) {
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  var headers = headersForSheet_(sh);
  var lastCol = headers.length;
  var rows = sh.getRange(2, 1, lastRow, lastCol).getValues();
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var obj = rowToObject_(headers, rows[i]);
    if (obj.id !== '' && obj.id != null) out.push(obj);
  }
  return out;
}

function rowToObject_(headers, rowValues) {
  var obj = {};
  for (var c = 0; c < headers.length; c++) {
    obj[headers[c]] = normalizeCell_(rowValues[c]);
  }
  return obj;
}

function normalizeCell_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return v;
}

function findSheetRowById_(sh, id) {
  var headers = headersForSheet_(sh);
  var idCol = headers.indexOf('id') + 1;
  if (idCol < 1) return 0;
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;
  var ids = sh.getRange(2, idCol, lastRow, idCol).getValues();
  id = Number(id);
  for (var i = 0; i < ids.length; i++) {
    if (Number(ids[i][0]) === id) return i + 2;
  }
  return 0;
}

function writeObjects_(sh, objects) {
  var headers = headersForSheet_(sh);
  sh.clearContents();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (!objects.length) return;
  var matrix = objects.map(function (o) {
    return headers.map(function (h) { return o[h] != null ? o[h] : ''; });
  });
  sh.getRange(2, 1, objects.length, headers.length).setValues(matrix);
}

function nextId_(sh) {
  var headers = headersForSheet_(sh);
  var idCol = headers.indexOf('id') + 1;
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return 1;
  var vals = sh.getRange(2, idCol, lastRow, idCol).getValues();
  var max = 0;
  vals.forEach(function (v) {
    var n = Number(v[0]);
    if (!isNaN(n) && n > max) max = n;
  });
  return max + 1;
}

function appendObject_(sh, obj) {
  var headers = headersForSheet_(sh);
  if (!obj.id) obj.id = nextId_(sh);
  var row = headers.map(function (h) { return obj[h] != null ? obj[h] : ''; });
  sh.appendRow(row);
  return obj;
}

function findById_(sh, id) {
  var rowNum = findSheetRowById_(sh, id);
  if (!rowNum) return null;
  var headers = headersForSheet_(sh);
  var values = sh.getRange(rowNum, 1, rowNum, headers.length).getValues()[0];
  return rowToObject_(headers, values);
}

function updateById_(sh, id, patch) {
  var rowNum = findSheetRowById_(sh, id);
  if (!rowNum) return null;
  var headers = headersForSheet_(sh);
  var row = findById_(sh, id);
  Object.keys(patch).forEach(function (k) {
    if (patch[k] !== undefined) row[k] = patch[k];
  });
  var out = headers.map(function (h) { return row[h] != null ? row[h] : ''; });
  sh.getRange(rowNum, 1, rowNum, headers.length).setValues([out]);
  return row;
}

function deleteWhere_(sh, predicate) {
  var rows = sheetToObjects_(sh);
  var kept = rows.filter(function (r) { return !predicate(r); });
  writeObjects_(sh, kept);
}

function deleteRowsWhereColumnEquals_(sh, columnName, value) {
  var headers = headersForSheet_(sh);
  var col = headers.indexOf(columnName) + 1;
  if (col < 1) return;
  var lastRow = sh.getLastRow();
  for (var r = lastRow; r >= 2; r--) {
    var cell = sh.getRange(r, col).getValue();
    if (Number(cell) === Number(value)) sh.deleteRow(r);
  }
}

function num_(v) {
  var n = Number(v);
  return isNaN(n) ? 0 : n;
}

function withDocLock_(fn) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function countPaidInstallments_(installments) {
  var n = 0;
  installments.forEach(function (inst) {
    var st = mapEstadoCuotaFromSheet_(inst.estado || inst.status);
    if (st === 'pagada') n += 1;
  });
  return n;
}

function indexRowsById_(rows) {
  var map = {};
  rows.forEach(function (r) {
    map[Number(r.id)] = r;
  });
  return map;
}

function groupInstallmentsBySaleId_(rows) {
  var bySale = {};
  rows.forEach(function (r) {
    var vid = Number(r.venta_id != null ? r.venta_id : r.sale_id);
    if (!bySale[vid]) bySale[vid] = [];
    bySale[vid].push(r);
  });
  return bySale;
}
