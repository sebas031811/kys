import { api } from "../api.js";
import { money, escHtml, tableScroll } from "../format.js";
import { wireDataTable } from "../table-tools.js";
import { state } from "../app-context.js";
import { el, accountBalanceClass } from "../dom.js";

export async function viewDashboard(root) {
  const [d, summary] = await Promise.all([
    api("/api/sales/dashboard/seller"),
    api("/api/accounts/summary"),
  ]);
  const accounts = summary.cuentas || summary.accounts || [];
  const cuotaRows = d.proximas_cuotas
    .map(
      (u) =>
        `<tr><td>${escHtml(u.fecha_vencimiento || "—")}</td><td>${escHtml(u.cliente_nombre)}</td><td>${escHtml(u.producto)}</td><td>${u.numero_cuota === 0 ? "Inicial" : "#" + u.numero_cuota}</td><td>${money(u.monto)}</td><td><a href="#/sales/${u.venta_id}">Ver</a></td></tr>`,
    )
    .join("");

  const accountCards = accounts
    .map((a) => {
      const bal = a.balance ?? 0;
      const rec = a.total_recibido ?? a.total_received ?? 0;
      const comp = a.total_comprado ?? a.total_purchased ?? 0;
      return `<a class="account-card ${accountBalanceClass(bal)}" href="#/accounts/${a.id}">
        <span class="account-card__name">${escHtml(a.nombre || a.name)}</span>
        <span class="account-card__balance">${money(bal)}</span>
        <span class="account-card__meta muted">Cobrado ${money(rec)} · Comprado ${money(comp)}</span>
        <span class="account-card__link">Ver balance →</span>
      </a>`;
    })
    .join("");

  const accountsSection =
    accounts.length > 0
      ? `<div class="card"><div class="card-head"><h2>Cuentas</h2><a href="#/accounts">Todas las cuentas</a></div>
    <div class="account-grid">${accountCards}</div></div>`
      : `<div class="card"><h2>Cuentas</h2><p class="muted">Sin cuentas. <a href="#/accounts">Configurar cuentas</a></p></div>`;

  const c = d.comision || {};
  const comisionSection = `<div class="card"><h2>Comisión de ventas</h2>
    <p class="muted">El % de comisión se define en cada venta (por defecto 30% sobre la ganancia).</p>
    <div class="grid2">
      <div><p class="muted">Ganancia total (ventas)</p><p class="stat">${money(c.ganancia_total_ventas)}</p></div>
      <div><p class="muted">Comisión si todo estuviera cobrado</p><p class="stat">${money(c.comision_total_ventas)}</p></div>
      <div><p class="muted">Comisión por recaudos</p><p class="stat text-ok">${money(c.comision_total_recaudo)}</p></div>
      <div><p class="muted">Ya pagado al vendedor</p><p class="stat">${money(d.valor_pagado ?? c.comision_pagada)}</p></div>
    </div>
    <p class="muted">Pendiente de pago (comisión por recaudos − pagado): <strong>${money(c.comision_pendiente_pago)}</strong></p>
    ${state.user.rol === "admin" ? `<p class="muted"><a href="#/vendedores">Registrar pagos de comisión a vendedores</a></p>` : ""}
    </div>`;

  root.appendChild(
    el(`<div class="card"><h1>Inicio — ${d.nombre_vendedor}</h1>
    <div class="dash-actions">
      <a class="dash-action dash-action--primary" href="#/sales/new">Nueva venta</a>
      <a class="dash-action" href="#/sales/new?cotizacion=1">Nueva cotización</a>
    </div>
    <div class="grid2">
      <div><p class="muted">Recuperado</p><p class="stat text-ok">${money(d.total_recuperado)}</p></div>
      <div><p class="muted">Pendiente</p><p class="stat text-warn">${money(d.total_pendiente)}</p></div>
    </div>
    <p class="muted">${d.num_ventas} ventas</p></div>
    ${comisionSection}
    ${accountsSection}
    <div class="card"><h2>Próximas cuotas</h2>
    ${tableScroll(`<table class="data-table"><thead><tr><th>Fecha</th><th>Cliente</th><th>Producto</th><th>Cuota</th><th>Valor</th><th></th></tr></thead>
    <tbody>${cuotaRows || "<tr><td colspan=6 class=muted>Sin cuotas próximas</td></tr>"}</tbody></table>`)}</div>`),
  );
  const cuotasDashCard = root.querySelector(".card:has(table.data-table)");
  if (cuotasDashCard) wireDataTable(cuotasDashCard, { searchPlaceholder: "Buscar cuota…" });
}
