export function num(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  let s = String(value).trim().replace(/\$/g, "").replace(/\s/g, "");
  if (!s) return 0;

  const dotThousands = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s);
  const commaDec = /,\d{1,4}$/.test(s);
  const commaOnly = /^\d+,\d+$/.test(s);
  if (dotThousands || (commaDec && s.includes("."))) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (commaOnly) {
    s = s.replace(",", ".");
  } else if (s.includes(".") && !s.includes(",")) {
    const parts = s.split(".");
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {
      s = s.replace(/\./g, "");
    }
  } else {
    s = s.replace(/,/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function parsePercent(value) {
  const n = num(value);
  if (n > 1 && n <= 100) return n / 100;
  return n;
}

export function parseDateDmY(value, saleYearHint) {
  if (!value) return null;
  const part = String(value).trim().split(/\s+y\s+/i)[0].trim();
  const m = part.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) {
    if (year === 69) year = 2026;
    else year += 2000;
  }
  if (saleYearHint != null && year < saleYearHint - 1 && saleYearHint >= 2024) {
    year = saleYearHint;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizePhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 10) return digits;
  const m = String(value ?? "").match(/\b3\d{9}\b/);
  return m ? m[0] : digits || null;
}

export function normalizeNameKey(name) {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

import { createHash } from "node:crypto";

export function importKey(record) {
  const raw = [
    record.fecha_venta_iso,
    record.telefono_norm,
    record.producto,
    record.valor_num,
    record.total_num,
  ].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 40);
}
