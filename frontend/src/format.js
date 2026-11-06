export function money(n) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n || 0);
}

export function escAttr(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

export function escHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function pricingSummaryText(pricing) {
  return `Ganancia ${money(pricing.ganancia)} · Total ${money(pricing.total)} · Saldo financiado ${money(pricing.saldo_financiado)} · Cuota ${money(pricing.cuota)}`;
}

export function tableScroll(tableHtml) {
  return `<div class="table-scroll">${tableHtml}</div>`;
}
