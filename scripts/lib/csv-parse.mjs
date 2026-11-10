/** RFC 4180-style CSV parser (quoted fields, multiline). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 2;
        continue;
      }
      if (c === '"') {
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((x) => String(x).trim() !== "")) rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Header row has duplicate "Pendiente"; normalize to positional field names. */
export const DB_KS_FIELDS = [
  "fecha_venta",
  "cliente",
  "telefono",
  "producto",
  "inicial",
  "valor",
  "porcentaje",
  "periodo_pago",
  "num_cuotas",
  "cuota",
  "fecha_entrega",
  "fecha_cuota",
  "valor_abonado",
  "pendiente",
  "total",
  "ganancia",
  "compra",
  "tarjeta",
  "vendedor",
  "cuota_tarjeta",
  "ganancia_vivi",
  "valor_abonado_vivi",
  "pendiente_vivi",
  "cuotas_pagadas",
];

const DATE_ROW = /^\d{1,2}\/\d{1,2}\/\d{2,4}/;

export function rowsToRecords(matrix) {
  const records = [];
  let pending = null;

  for (let r = 1; r < matrix.length; r++) {
    const raw = matrix[r];
    const first = String(raw[0] ?? "").trim();
  if (DATE_ROW.test(first)) {
      if (pending) records.push(pending);
      pending = objectFromRow(raw);
      continue;
    }
    if (pending) {
      pending.cliente = `${pending.cliente}\n${raw.join("\n")}`.trim();
    }
  }
  if (pending) records.push(pending);
  return records;
}

function objectFromRow(raw) {
  const o = {};
  for (let i = 0; i < DB_KS_FIELDS.length; i++) {
    o[DB_KS_FIELDS[i]] = raw[i] != null ? String(raw[i]).trim() : "";
  }
  return o;
}
