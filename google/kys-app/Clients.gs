function clientOut_(row) {
  return {
    id: Number(row.id),
    nombre: row.nombre || row.name,
    telefono: row.telefono || row.phone || null,
    identificacion: row.identificacion || row.identification || null,
    email: row.email || null,
    direccion: row.direccion || row.address || null,
    texto_cliente: row.texto_cliente || row.raw_client_text || null,
    notas: row.notas || row.notes || null,
  };
}

function listClients_() {
  return sheetToObjects_(getSheet_(KYS_CONFIG.SHEETS.CLIENTS))
    .sort(function (a, b) {
      var na = a.nombre || a.name || '';
      var nb = b.nombre || b.name || '';
      return String(na).localeCompare(String(nb));
    })
    .slice(0, 500)
    .map(clientOut_);
}

function createClient_(body) {
  var c = KYS_FIELDS.CLIENTE;
  var data = {};
  data[c.nombre] = body.nombre || body.name || 'Sin nombre';
  data[c.telefono] = body.telefono || body.phone || '';
  data[c.identificacion] = body.identificacion || body.identification || '';
  data[c.email] = body.email || '';
  data[c.direccion] = body.direccion || body.address || '';
  data[c.texto_cliente] = body.texto_cliente || body.raw_client_text || '';
  data[c.notas] = body.notas || body.notes || '';

  if (data[c.texto_cliente] && !data[c.identificacion]) {
    var parsed = parseClientBlock_(data[c.texto_cliente], data[c.telefono]);
    if (parsed.identification) data[c.identificacion] = parsed.identification;
    if (parsed.phone) data[c.telefono] = parsed.phone;
    if (parsed.email) data[c.email] = parsed.email;
    if (parsed.address) data[c.direccion] = parsed.address;
    if (parsed.name && (!data[c.nombre] || data[c.nombre] === 'Sin nombre')) data[c.nombre] = parsed.name;
    if (parsed.raw_client_text) data[c.texto_cliente] = parsed.raw_client_text;
  }
  return clientOut_(appendObject_(getSheet_(KYS_CONFIG.SHEETS.CLIENTS), data));
}

function parseClientRequest_(body) {
  var parsed = parseClientBlock_(body.texto_cliente || body.raw_client_text || body.nombre || body.name, body.telefono || body.phone);
  return {
    nombre: parsed.name,
    telefono: parsed.phone,
    identificacion: parsed.identification,
    email: parsed.email,
    direccion: parsed.address,
    texto_cliente: parsed.raw_client_text,
    notas: body.notas || body.notes || null,
  };
}

function getClientById_(id) {
  return findById_(getSheet_(KYS_CONFIG.SHEETS.CLIENTS), id);
}
