function accountOut_(row) {
  return {
    id: Number(row.id),
    name: row.name,
    account_type: row.account_type || 'both',
    notes: row.notes || null,
  };
}

function listAccounts_() {
  return sheetToObjects_(getSheet_(KYS_CONFIG.SHEETS.ACCOUNTS))
    .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); })
    .map(accountOut_);
}

function createAccount_(body, token) {
  var me = requireUser_(token);
  if (me.role !== 'admin') throw new Error('Admin only');
  var rows = sheetToObjects_(getSheet_(KYS_CONFIG.SHEETS.ACCOUNTS));
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].name).toLowerCase() === String(body.name).toLowerCase()) {
      throw new Error('Account name exists');
    }
  }
  return accountOut_(appendObject_(getSheet_(KYS_CONFIG.SHEETS.ACCOUNTS), {
    name: body.name,
    account_type: body.account_type || 'both',
    notes: body.notes || '',
  }));
}
