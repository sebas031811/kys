function clientOut_(row) {
  return {
    id: Number(row.id),
    name: row.name,
    phone: row.phone || null,
    identification: row.identification || null,
    email: row.email || null,
    address: row.address || null,
    raw_client_text: row.raw_client_text || null,
    notes: row.notes || null,
  };
}

function listClients_() {
  return sheetToObjects_(getSheet_(KYS_CONFIG.SHEETS.CLIENTS))
    .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); })
    .slice(0, 500)
    .map(clientOut_);
}

function createClient_(body) {
  var data = {
    name: body.name || 'Sin nombre',
    phone: body.phone || '',
    identification: body.identification || '',
    email: body.email || '',
    address: body.address || '',
    raw_client_text: body.raw_client_text || '',
    notes: body.notes || '',
  };
  if (body.raw_client_text && !body.identification) {
    var parsed = parseClientBlock_(body.raw_client_text, body.phone);
    Object.keys(parsed).forEach(function (k) {
      if (parsed[k] && !data[k]) data[k] = parsed[k];
    });
    if (!data.name || data.name === 'Sin nombre') data.name = parsed.name;
  }
  return clientOut_(appendObject_(getSheet_(KYS_CONFIG.SHEETS.CLIENTS), data));
}

function parseClientRequest_(body) {
  var parsed = parseClientBlock_(body.raw_client_text || body.name, body.phone);
  return {
    name: parsed.name,
    phone: parsed.phone,
    identification: parsed.identification,
    email: parsed.email,
    address: parsed.address,
    raw_client_text: parsed.raw_client_text,
    notes: body.notes || null,
  };
}

function getClientById_(id) {
  return findById_(getSheet_(KYS_CONFIG.SHEETS.CLIENTS), id);
}
