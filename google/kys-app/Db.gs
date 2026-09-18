function getSheet_(name) {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Missing sheet: ' + name + '. Run kysSetupSheets from the script editor.');
  return sh;
}

function sheetToObjects_(sh) {
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var rows = sh.getRange(2, 1, lastRow, lastCol).getValues();
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      obj[String(headers[c])] = normalizeCell_(rows[i][c]);
    }
    if (obj.id !== '' && obj.id != null) out.push(obj);
  }
  return out;
}

function normalizeCell_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return v;
}

function writeObjects_(sh, objects) {
  var name = sh.getName();
  var headers = KYS_HEADERS[name];
  if (!headers) throw new Error('Unknown sheet headers for ' + name);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.clearContents();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (!objects.length) return;
  var matrix = objects.map(function (o) {
    return headers.map(function (h) { return o[h] != null ? o[h] : ''; });
  });
  sh.getRange(2, 1, objects.length, headers.length).setValues(matrix);
}

function nextId_(sh) {
  var rows = sheetToObjects_(sh);
  var max = 0;
  rows.forEach(function (r) {
    var id = Number(r.id);
    if (!isNaN(id) && id > max) max = id;
  });
  return max + 1;
}

function appendObject_(sh, obj) {
  var name = sh.getName();
  var headers = KYS_HEADERS[name];
  if (!obj.id) obj.id = nextId_(sh);
  var row = headers.map(function (h) { return obj[h] != null ? obj[h] : ''; });
  sh.appendRow(row);
  return obj;
}

function findById_(sh, id) {
  var rows = sheetToObjects_(sh);
  id = Number(id);
  for (var i = 0; i < rows.length; i++) {
    if (Number(rows[i].id) === id) return rows[i];
  }
  return null;
}

function updateById_(sh, id, patch) {
  var rows = sheetToObjects_(sh);
  id = Number(id);
  var found = false;
  var updated = rows.map(function (r) {
    if (Number(r.id) !== id) return r;
    found = true;
    var copy = {};
    Object.keys(r).forEach(function (k) { copy[k] = r[k]; });
    Object.keys(patch).forEach(function (k) {
      if (patch[k] !== undefined) copy[k] = patch[k];
    });
    return copy;
  });
  if (!found) return null;
  writeObjects_(sh, updated);
  return findById_(sh, id);
}

function deleteWhere_(sh, predicate) {
  var rows = sheetToObjects_(sh);
  var kept = rows.filter(function (r) { return !predicate(r); });
  writeObjects_(sh, kept);
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
