import { api } from "../api.js";
import { getClientes, getCuentas, invalidateAll } from "../cache.js";
import { money, escAttr, escHtml, tableScroll } from "../format.js";
import { openModal, closeModal, modalBody } from "../modal.js";
import {
  periodOptions,
  fechaCuotaOptions,
  formatDiaCuota,
  formatCuotasRatio,
  formatUltimoPago,
  saleMatchesVenceHasta,
  salePaymentRowClassForVence,
  formatProximoVencimiento,
} from "../labels.js";
import { computeSalePricing } from "../pricing.js";
import { readSalePricingPayload, wireSalePricingPreview } from "../sale-pricing.js";
import { accountOptions } from "../accounts.js";
import { wireDataTable } from "../table-tools.js";
import { state, render } from "../app-context.js";
import { el } from "../dom.js";
function statusLabel(s) {
  return s.estado_registro === "cotizacion" ? "Cotización" : "Venta";
}

function saleCuotasLine(sale) {
  const ult = formatUltimoPago(sale.fecha_ultimo_pago);
  const ultTxt = ult !== "—" ? ` · Últ. pago: ${ult}` : "";
  return `Cuotas: ${formatCuotasRatio(sale)} · Día pago: ${formatDiaCuota(sale.fecha_cuota)}${ultTxt}`;
}

function instStatusLabel(status) {
  if (status === "pagada") return "Pagada";
  if (status === "parcial") return "Parcial";
  return "Pendiente";
}

function nextPaymentAmount(sale) {
  const rows = [...(sale.cuotas || [])].sort((a, b) => a.numero_cuota - b.numero_cuota);
  const next = rows.find((i) => i.estado !== "pagada");
  if (!next) return sale.cuota || 0;
  return Math.max(0, (next.monto || 0) - (next.monto_pagado || 0));
}

function saleDetailSummaryHtml(sale, isQuote) {
  return `<div class="card">
    <h1>${isQuote ? "Cotización" : "Venta"} #${sale.id}</h1>
    <p><strong>${escHtml(sale.producto || "")}</strong></p>
    <p class="muted">${escHtml(sale.cliente?.nombre || "")}${sale.cliente?.telefono ? ` · ${escHtml(sale.cliente.telefono)}` : ""}</p>
    <p class="muted">${saleCuotasLine(sale)}</p>
    <p>Abonado ${money(sale.valor_abonado)} · Pendiente ${money(sale.pendiente)} · Total ${money(sale.total)}</p>
    <p class="muted">Ganancia ${money(sale.ganancia)} · Comisión vendedor ${sale.porcentaje_comision ?? 30}%</p>
    <div class="detail-actions">
      <button type="button" id="editSaleBtn">Editar</button>
      ${isQuote ? "" : `<button type="button" id="paySaleBtn">Registrar cobro</button>`}
      ${isQuote ? `<button type="button" class="secondary" id="printBtn">Imprimir cotización</button>` : ""}
      <button type="button" class="secondary" id="deleteSaleBtn">Eliminar</button>
    </div>
  </div>`;
}

function payFormHtml(sale, accOpts, today) {
  return `<p class="muted">${escHtml(sale.cliente?.nombre || "")} · ${escHtml(sale.producto || "")}</p>
    <p class="muted">Pendiente ${money(sale.pendiente)}</p>
    <label>Valor<input id="payAmount" type="number" value="${nextPaymentAmount(sale)}"/></label>
    <label>Fecha de pago<input id="payDate" type="date" value="${today}"/></label>
    <label>Cuenta cobro<select id="payAccount"><option value="">—</option>${accOpts}</select></label>
    <button type="button" id="payBtn">Registrar</button>
    <p class="error" id="payErr"></p>`;
}

function payEditFormHtml(payment, accounts) {
  const fecha = payment.fecha_pago ? String(payment.fecha_pago).slice(0, 10) : "";
  return `<p class="muted">Cobro #${payment.id}</p>
    <label>Valor<input id="payAmount" type="number" value="${Number(payment.monto) || 0}"/></label>
    <label>Fecha de pago<input id="payDate" type="date" value="${escAttr(fecha)}"/></label>
    <label>Cuenta cobro<select id="payAccount"><option value="">—</option>${accountOptions(accounts, payment.cuenta_cobro_id)}</select></label>
    <label>Notas<input id="payNotes" value="${escAttr(payment.notas || "")}"/></label>
    <button type="button" id="paySaveBtn">Guardar abono</button>
    <button type="button" class="secondary" id="payDeleteBtn">Eliminar abono</button>
    <p class="error" id="payErr"></p>`;
}

function openPaymentEditModal(saleId, payment, accounts) {
  openModal(`Editar abono #${payment.id} — venta #${saleId}`, payEditFormHtml(payment, accounts));
  const body = modalBody();
  body.querySelector("#paySaveBtn").onclick = async () => {
    try {
      const acc = body.querySelector("#payAccount").value;
      await api(`/api/sales/${saleId}/payments/${payment.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          monto: Number(body.querySelector("#payAmount").value),
          fecha_pago: body.querySelector("#payDate").value,
          cuenta_cobro_id: acc ? Number(acc) : null,
          notas: body.querySelector("#payNotes").value || null,
        }),
      });
      closeModal();
      invalidateAll();
      render();
    } catch (e) {
      body.querySelector("#payErr").textContent = e.message;
    }
  };
  const delBtn = body.querySelector("#payDeleteBtn");
  if (delBtn) {
    delBtn.onclick = async () => {
      if (!confirm(`¿Eliminar el abono #${payment.id} por ${money(payment.monto)}?`)) return;
      try {
        await api(`/api/sales/${saleId}/payments/${payment.id}`, { method: "DELETE" });
        closeModal();
        invalidateAll();
        render();
      } catch (e) {
        body.querySelector("#payErr").textContent = e.message;
      }
    };
  }
}

function openPaymentModal(saleId, sale, accOpts, today) {
  if (sale.estado_registro === "cotizacion") {
    openModal("Cobro no disponible", `<p class="muted">Convierte la cotización en venta antes de registrar cobros.</p><a href="#/sales/${saleId}">Ir al detalle</a>`);
    return;
  }
  openModal(`Registrar cobro — venta #${saleId}`, payFormHtml(sale, accOpts, today));
  const body = modalBody();
  body.querySelector("#payBtn").onclick = async () => {
    try {
      const acc = body.querySelector("#payAccount").value;
      await api(`/api/sales/${saleId}/payments`, {
        method: "POST",
        body: JSON.stringify({
          monto: Number(body.querySelector("#payAmount").value),
          fecha_pago: body.querySelector("#payDate").value,
          cuenta_cobro_id: acc ? Number(acc) : null,
        }),
      });
      closeModal();
      invalidateAll();
      render();
    } catch (e) {
      body.querySelector("#payErr").textContent = e.message;
    }
  };
}

function saleEditFormHtml(sale, accounts, isQuote) {
  const dateFields = isQuote
    ? `<label>Fecha cotización<input id="fechaCotizacion" type="date" value="${sale.fecha_cotizacion || ""}"/></label>`
    : `<label>Fecha venta<input id="fechaVenta" type="date" value="${sale.fecha_venta || ""}"/>
      <label>Fecha entrega<input id="fechaEntrega" type="date" value="${sale.fecha_entrega || ""}"/></label>`;
  const adminFields =
    state.user?.rol === "admin"
      ? `<label>Cuota tarjeta<input id="cuotaTarjeta" value="${escAttr(sale.cuota_tarjeta)}"/></label>`
      : "";
  return `<p class="muted">${escHtml(sale.cliente?.nombre || "")} · Abonado ${money(sale.valor_abonado)} · Pendiente ${money(sale.pendiente)}</p>
    <label>Producto<input id="producto" value="${escAttr(sale.producto)}"/></label>
    <div class="grid2">
      <label>Valor producto<input id="valor" type="number" value="${sale.valor}"/></label>
      <label>% margen venta<input id="porcentaje" type="number" step="0.01" value="${sale.porcentaje}"/></label>
      <label>% comisión vendedor<input id="porcentajeComision" type="number" step="0.01" value="${sale.porcentaje_comision ?? 30}"/></label>
      <label>Comisión total ($)<input id="comisionMonto" type="number" step="1" value="${sale.comision_monto ?? ""}" placeholder="Opcional"/></label>
      <label>Inicial<input id="inicial" type="number" value="${sale.inicial}"/></label>
      <label># Cuotas<input id="numCuotas" type="number" value="${sale.num_cuotas}"/></label>
      <label>Periodo de pago<select id="periodoPago">${periodOptions(sale.periodo_pago)}</select></label>
      <label>Día de pago (fecha cuota)<select id="fechaCuota">${fechaCuotaOptions(sale.fecha_cuota)}</select></label>
      ${dateFields}
    </div>
    <label>Observaciones<textarea id="observaciones" rows="2">${escHtml(sale.observaciones || "")}</textarea></label>
    <p class="muted" id="preview"></p>
    <label>Compra (URL)<input id="compra" value="${escAttr(sale.compra)}"/></label>
    <label>Tarjeta<input id="tarjeta" value="${escAttr(sale.tarjeta)}"/></label>
    <label>Cuenta compra<select id="cuentaCompra"><option value="">—</option>${accountOptions(accounts, sale.cuenta_compra_id)}</select></label>
    ${adminFields}
    <button type="button" id="saveSaleBtn">Guardar cambios</button>
    <p class="error" id="saveErr"></p>`;
}

function buildSalePatchBody(root) {
  const cuentaCompra = root.querySelector("#cuentaCompra").value;
  const body = {
    producto: root.querySelector("#producto").value,
    valor: Number(root.querySelector("#valor").value),
    porcentaje: Number(root.querySelector("#porcentaje").value),
    porcentaje_comision: Number(root.querySelector("#porcentajeComision")?.value ?? 30),
    comision_monto:
      root.querySelector("#comisionMonto")?.value !== ""
        ? Number(root.querySelector("#comisionMonto").value)
        : null,
    inicial: Number(root.querySelector("#inicial").value),
    num_cuotas: Number(root.querySelector("#numCuotas").value),
    periodo_pago: root.querySelector("#periodoPago").value,
    fecha_cuota: root.querySelector("#fechaCuota").value || null,
    cuenta_compra_id: cuentaCompra ? Number(cuentaCompra) : null,
    compra: root.querySelector("#compra")?.value || null,
    tarjeta: root.querySelector("#tarjeta")?.value || null,
    observaciones: root.querySelector("#observaciones")?.value || null,
  };
  const fechaVenta = root.querySelector("#fechaVenta");
  const fechaEntrega = root.querySelector("#fechaEntrega");
  const fechaCot = root.querySelector("#fechaCotizacion");
  if (fechaVenta?.value) body.fecha_venta = fechaVenta.value;
  if (fechaEntrega?.value) body.fecha_entrega = fechaEntrega.value;
  else if (fechaEntrega) body.fecha_entrega = null;
  if (fechaCot?.value) body.fecha_cotizacion = fechaCot.value;
  const cuotaTarjeta = root.querySelector("#cuotaTarjeta");
  if (cuotaTarjeta) body.cuota_tarjeta = cuotaTarjeta.value || null;
  return body;
}

function wireSaleEditForm(root) {
  wireSalePricingPreview(root);
}

export function salesListHash(extra = {}) {
  const p = new URLSearchParams();
  const estado = extra.filter ?? state.salesFilter;
  const vence = extra.vence !== undefined ? extra.vence : state.salesVenceHasta;
  if (estado) p.set("filter", estado);
  if (vence) p.set("vence", vence);
  const q = p.toString();
  return `#/sales${q ? `?${q}` : ""}`;
}

export async function viewSales(root) {
  const filter = state.salesFilter || "";
  const venceHasta = state.salesVenceHasta || "";
  const qs = filter ? `?estado_registro=${filter === "venta" ? "venta" : "cotizacion"}` : "";
  const today = new Date().toISOString().slice(0, 10);
  const venceInputValue = venceHasta || today;
  const [salesRaw, accounts] = await Promise.all([api(`/api/sales${qs}`), getCuentas(api)]);
  let sales = salesRaw.filter((s) => saleMatchesVenceHasta(s, venceHasta));
  if (venceHasta) {
    sales = [...sales].sort((a, b) =>
      String(a.proximo_vencimiento || "").localeCompare(String(b.proximo_vencimiento || "")),
    );
  }
  const accOpts = accountOptions(accounts, null);
  const showVenceCol = Boolean(venceHasta);
  const dueHint = venceHasta
    ? `<p class="muted sales-dia-hint">Cuotas con vencimiento hasta <strong>${escHtml(venceHasta)}</strong> — verde = pagada; rojo = pendiente.</p>`
    : "";
  const rows = sales
    .map((s) => {
      const rowClass = salePaymentRowClassForVence(s, venceHasta);
      const cuotasCell = formatCuotasRatio(s);
      const cuotasHtml = cuotasCell === "—" ? `<span class="muted">—</span>` : cuotasCell;
      const diaCell = formatDiaCuota(s.fecha_cuota);
      const proxVence = formatProximoVencimiento(s);
      const proxHtml = proxVence === "—" ? `<span class="muted">—</span>` : escHtml(proxVence);
      const ultPago = formatUltimoPago(s.fecha_ultimo_pago);
      const ultHtml = ultPago === "—" ? `<span class="muted">—</span>` : escHtml(ultPago);
      const isVenta = s.estado_registro === "venta";
      const actions = `<a href="#/sales/${s.id}">Detalle</a>${
        isVenta
          ? ` · <button type="button" class="btn-link pay-row-btn" data-sale-id="${s.id}">Cobro</button>`
          : ""
      }`;
      const venceCell = showVenceCol ? `<td>${proxHtml}</td>` : "";
      const vendedorName =
        s.vendedor?.nombre_visible ||
        (state.user && s.vendedor_id === state.user.id ? state.user.nombre_visible : "");
      const vendedorHtml = vendedorName ? escHtml(vendedorName) : `<span class="muted">—</span>`;
      const fechaDisplay = s.fecha_venta || s.fecha_cotizacion || "—";
      const fechaSort = s.fecha_venta || s.fecha_cotizacion || "";
      const estadoTxt = statusLabel(s);
      const clienteNombre = s.cliente?.nombre || String(s.cliente_id ?? "");
      const cuotasSort = `${s.cuotas_pagadas ?? 0}/${s.num_cuotas ?? 0}`;
      return `<tr class="${rowClass}"
        data-estado="${escAttr(estadoTxt)}"
        data-fecha="${escAttr(fechaSort)}"
        data-cliente="${escAttr(clienteNombre)}"
        data-producto="${escAttr(s.producto || "")}"
        data-vendedor="${escAttr(vendedorName)}"
        data-cuotas="${escAttr(cuotasSort)}"
        data-prox-vence="${escAttr(s.proximo_vencimiento || "")}"
        data-dia="${escAttr(String(s.fecha_cuota ?? ""))}"
        data-ult-pago="${escAttr(s.fecha_ultimo_pago || "")}"
        data-pendiente="${Number(s.pendiente) || 0}"
      ><td>${estadoTxt}</td><td>${escHtml(fechaDisplay)}</td><td>${escHtml(clienteNombre)}</td><td>${escHtml(s.producto || "")}</td><td>${vendedorHtml}</td><td class="num">${cuotasHtml}</td>${venceCell}<td class="num">${escHtml(diaCell)}</td><td>${ultHtml}</td><td class="num">${money(s.pendiente)}</td><td class="actions-cell">${actions}</td></tr>`;
    })
    .join("");
  const colspan = showVenceCol ? 11 : 10;
  const venceHead = showVenceCol
    ? `<th class="th-sortable" data-sort="prox-vence" tabindex="0" role="button">Próx. vence</th>`
    : "";
  root.appendChild(
    el(`<div class="card"><div class="card-head"><h1>Ventas y cotizaciones</h1>
    <div class="dash-actions">
      <a class="dash-action dash-action--primary" href="#/sales/new">Nueva venta</a>
      <a class="dash-action" href="#/sales/new?cotizacion=1">Nueva cotización</a>
    </div></div>
    <p class="sales-filter-links">
      <a href="${salesListHash({ filter: "" })}">Todas</a> ·
      <a href="${salesListHash({ filter: "cotizacion" })}">Cotizaciones</a> ·
      <a href="${salesListHash({ filter: "venta" })}">Ventas</a>
    </p>
    <div class="sales-vence-filter">
      <label>Vence hasta (incluye ese día)<input type="date" id="salesVenceFilter" value="${escAttr(venceInputValue)}"/></label>
      <button type="button" class="secondary" id="salesVenceApply">Filtrar</button>
      ${venceHasta ? `<a href="${salesListHash({ vence: "" })}" class="sales-vence-clear">Quitar filtro</a>` : ""}
    </div>
    ${dueHint}
    ${tableScroll(`<table class="data-table"><thead><tr>
      <th class="th-sortable" data-sort="estado" tabindex="0" role="button">Estado</th>
      <th class="th-sortable" data-sort="fecha" tabindex="0" role="button">Fecha</th>
      <th class="th-sortable" data-sort="cliente" tabindex="0" role="button">Cliente</th>
      <th class="th-sortable" data-sort="producto" tabindex="0" role="button">Producto</th>
      <th class="th-sortable" data-sort="vendedor" tabindex="0" role="button">Vendedor</th>
      <th class="th-sortable" data-sort="cuotas" tabindex="0" role="button">Cuotas</th>
      ${venceHead}
      <th class="th-sortable" data-sort="dia" tabindex="0" role="button">Día pago</th>
      <th class="th-sortable" data-sort="ult-pago" tabindex="0" role="button">Últ. pago</th>
      <th class="th-sortable" data-sort="pendiente" data-sort-type="number" tabindex="0" role="button">Pendiente</th>
      <th>Acciones</th>
    </tr></thead><tbody>${rows || `<tr><td colspan=${colspan} class=muted>Sin registros</td></tr>`}</tbody></table>`)}</div>`)
  );

  const salesCard = root.querySelector(".card");
  wireDataTable(salesCard, { searchPlaceholder: "Buscar por cliente, producto, vendedor…" });

  const applyVence = () => {
    const val = root.querySelector("#salesVenceFilter").value;
    if (val) location.hash = salesListHash({ vence: val });
  };
  root.querySelector("#salesVenceApply").onclick = applyVence;
  root.querySelector("#salesVenceFilter").addEventListener("keydown", (e) => {
    if (e.key === "Enter") applyVence();
  });

  root.querySelectorAll(".pay-row-btn").forEach((btn) => {
    btn.onclick = async () => {
      const saleId = btn.dataset.saleId;
      let sale = sales.find((s) => String(s.id) === String(saleId));
      try {
        sale = await api(`/api/sales/${saleId}`);
      } catch {
        /* use list row */
      }
      if (sale) openPaymentModal(saleId, sale, accOpts, today);
    };
  });
}

export async function viewSaleDetail(root, id) {
  const sale = await api(`/api/sales/${id}`);
  const accounts = sale.cuentas || (await getCuentas(api));
  const instRows = [...(sale.cuotas || [])]
    .sort((a, b) => a.numero_cuota - b.numero_cuota)
    .map(
      (i) =>
        `<tr data-numero="${i.numero_cuota}" data-vence="${escAttr(i.fecha_vencimiento || "")}" data-valor="${Number(i.monto) || 0}" data-estado="${escAttr(instStatusLabel(i.estado))}" data-fecha-pago="${escAttr(i.fecha_pago || "")}" data-abonado="${Number(i.monto_pagado) || 0}"><td>${i.numero_cuota === 0 ? "Inicial (0)" : i.numero_cuota}</td><td>${i.fecha_vencimiento || "—"}</td><td class="num">${money(i.monto)}</td><td>${instStatusLabel(i.estado)}</td><td>${i.fecha_pago || "—"}</td><td class="num">${money(i.monto_pagado)}</td></tr>`,
    )
    .join("");
  const accOpts = accountOptions(accounts, null);
  const isQuote = sale.estado_registro === "cotizacion";
  const today = new Date().toISOString().slice(0, 10);

  const convertBlock = isQuote
    ? `<div class="card" style="margin-top:1rem;border-color:var(--accent)">
    <label class="check-row"><input type="checkbox" id="confirmAsSale"/> Convertir a venta</label>
    <p class="muted">Marca la casilla, revisa abonos y confirma para crear el plan de cuotas.</p>
    <div id="confirmFields" hidden>
      <div class="grid2">
        <label>Fecha venta<input id="confirmSoldAt" type="date" value="${today}"/></label>
        <label>Fecha entrega<input id="confirmDelivered" type="date" value="${sale.fecha_entrega || ""}"/></label>
        <label>Valor abonado hasta hoy<input id="confirmPaid" type="number" value="${sale.inicial}"/></label>
      </div>
      <button id="confirmBtn">Confirmar venta</button>
      <p class="error" id="confirmErr"></p>
    </div></div>`
    : "";

  const installmentsBlock = isQuote
    ? ""
    : `<div class="card"><h2>Cuotas</h2>
    <p class="muted">${saleCuotasLine(sale)}</p>
    ${tableScroll(`<table class="data-table"><thead><tr>
      <th class="th-sortable" data-sort="numero" data-sort-type="number" tabindex="0" role="button">#</th>
      <th class="th-sortable" data-sort="vence" tabindex="0" role="button">Vence</th>
      <th class="th-sortable" data-sort="valor" data-sort-type="number" tabindex="0" role="button">Valor</th>
      <th class="th-sortable" data-sort="estado" tabindex="0" role="button">Estado</th>
      <th class="th-sortable" data-sort="fecha-pago" tabindex="0" role="button">Fecha pago</th>
      <th class="th-sortable" data-sort="abonado" data-sort-type="number" tabindex="0" role="button">Abonado</th>
    </tr></thead><tbody>${instRows}</tbody></table>`)}</div>`;

  const payRows = [...(sale.pagos || [])]
    .map(
      (p) =>
        `<tr data-pay-id="${p.id}"><td>${p.fecha_pago || "—"}</td><td class="num">${money(p.monto)}</td><td>${escHtml(accounts.find((a) => a.id === p.cuenta_cobro_id)?.nombre || "—")}</td><td>${escHtml(p.notas || "")}</td><td class="actions-cell"><button type="button" class="secondary edit-pay-btn" data-pay-id="${p.id}">Editar</button> <button type="button" class="secondary delete-pay-btn" data-pay-id="${p.id}">Eliminar</button></td></tr>`,
    )
    .join("");
  const paymentsBlock = isQuote
    ? ""
    : `<div class="card"><h2>Abonos registrados</h2>
    <p class="muted">Al editar o eliminar un abono se recalculan cuotas, abonado y pendiente de la venta.</p>
    ${tableScroll(`<table class="data-table"><thead><tr><th>Fecha</th><th>Valor</th><th>Cuenta cobro</th><th>Notas</th><th></th></tr></thead>
    <tbody>${payRows || "<tr><td colspan=5 class=muted>Sin abonos</td></tr>"}</tbody></table>`)}</div>`;

  root.appendChild(
    el(`<div>
    ${saleDetailSummaryHtml(sale, isQuote)}
    ${convertBlock}
    ${paymentsBlock}
    ${installmentsBlock}
    </div>`)
  );

  root.querySelectorAll(".edit-pay-btn").forEach((btn) => {
    const payId = Number(btn.dataset.payId);
    const payment = (sale.pagos || []).find((p) => Number(p.id) === payId);
    if (payment) btn.onclick = () => openPaymentEditModal(id, payment, accounts);
  });

  root.querySelectorAll(".delete-pay-btn").forEach((btn) => {
    const payId = Number(btn.dataset.payId);
    const payment = (sale.pagos || []).find((p) => Number(p.id) === payId);
    if (!payment) return;
    btn.onclick = async () => {
      if (!confirm(`¿Eliminar el abono #${payment.id} por ${money(payment.monto)}?`)) return;
      try {
        await api(`/api/sales/${id}/payments/${payment.id}`, { method: "DELETE" });
        invalidateAll();
        render();
      } catch (e) {
        alert(e.message);
      }
    };
  });

  root.querySelectorAll(".card:has(table.data-table)").forEach((card) => {
    wireDataTable(card, { searchPlaceholder: card.querySelector("h2")?.textContent?.includes("Abonos") ? "Buscar abono…" : "Buscar cuota…" });
  });

  const openEditModal = () => {
    openModal(isQuote ? `Editar cotización #${sale.id}` : `Editar venta #${sale.id}`, saleEditFormHtml(sale, accounts, isQuote));
    const body = modalBody();
    wireSaleEditForm(body);
    body.querySelector("#saveSaleBtn").onclick = async () => {
      try {
        await api(`/api/sales/${id}`, { method: "PATCH", body: JSON.stringify(buildSalePatchBody(body)) });
        closeModal();
        invalidateAll();
        render();
      } catch (e) {
        body.querySelector("#saveErr").textContent = e.message;
      }
    };
  };

  root.querySelector("#editSaleBtn").onclick = openEditModal;
  const deleteSaleBtn = root.querySelector("#deleteSaleBtn");
  if (deleteSaleBtn) {
    deleteSaleBtn.onclick = async () => {
      const label = isQuote ? "cotización" : "venta";
      if (
        !confirm(
          `¿Eliminar ${label} #${sale.id} (${sale.producto || ""})? Se borrarán también cuotas y cobros asociados.`,
        )
      ) {
        return;
      }
      try {
        await api(`/api/sales/${id}`, { method: "DELETE" });
        invalidateAll();
        location.hash = "#/sales";
        render();
      } catch (e) {
        alert(e.message);
      }
    };
  }
  const payOpenBtn = root.querySelector("#paySaleBtn");
  if (payOpenBtn) payOpenBtn.onclick = () => openPaymentModal(id, sale, accOpts, today);

  const printBtn = root.querySelector("#printBtn");
  if (printBtn) {
    printBtn.onclick = async () => {
      const { html } = await api(`/api/quotes/${id}/print`);
      const win = window.open("", "_blank");
      win.document.write(html);
      win.document.close();
    };
  }
  const confirmCheck = root.querySelector("#confirmAsSale");
  const confirmFields = root.querySelector("#confirmFields");
  if (confirmCheck && confirmFields) {
    confirmCheck.onchange = () => {
      confirmFields.hidden = !confirmCheck.checked;
    };
  }
  const confirmBtn = root.querySelector("#confirmBtn");
  if (confirmBtn) {
    confirmBtn.onclick = async () => {
      try {
        const delivered = root.querySelector("#confirmDelivered").value;
        if (!root.querySelector("#confirmAsSale")?.checked) {
          root.querySelector("#confirmErr").textContent = "Marca «Convertir a venta» primero.";
          return;
        }
        await api(`/api/sales/${id}/confirm`, {
          method: "POST",
          body: JSON.stringify({
            fecha_venta: root.querySelector("#confirmSoldAt").value,
            fecha_entrega: delivered || null,
            valor_abonado: Number(root.querySelector("#confirmPaid").value),
          }),
        });
        invalidateAll();
        location.hash = `#/sales/${id}`;
        render();
      } catch (e) {
        root.querySelector("#confirmErr").textContent = e.message;
      }
    };
  }
}

export async function viewNewSale(root, startAsQuote = false) {
  const [clients, accounts, users] = await Promise.all([
    getClientes(api),
    getCuentas(api),
    state.user.rol === "admin" ? api("/api/auth/users") : Promise.resolve([]),
  ]);
  const clientOpts = clients.map((c) => `<option value="${c.id}">${escHtml(c.nombre)}</option>`).join("");
  const accOpts = accounts.map((a) => `<option value="${a.id}">${escHtml(a.nombre)}</option>`).join("");
  const sellerOpts = users
    .filter((u) => u.rol === "seller")
    .map((u) => `<option value="${u.id}">${escHtml(u.nombre_visible)}</option>`)
    .join("");
  const today = new Date().toISOString().slice(0, 10);

  root.appendChild(
    el(`<div class="card"><h1>Nueva venta / cotización</h1>
    <label class="check-row"><input type="checkbox" id="isQuote" ${startAsQuote ? "checked" : ""}/> Solo cotización (aún no es venta)</label>
    <label>Cliente<select id="clienteId"><option value="">—</option>${clientOpts}</select></label>
    <label>Producto<input id="producto" /></label>
    <div class="grid2">
      <label>Valor producto<input id="valor" type="number" /></label>
      <label>% margen venta<input id="porcentaje" type="number" step="0.01" value="0.3" /></label>
      <label>% comisión vendedor<input id="porcentajeComision" type="number" step="0.01" value="30" /></label>
      <label>Inicial<input id="inicial" type="number" value="0" /></label>
      <label># Cuotas<input id="numCuotas" type="number" value="4" /></label>
      <label>Periodo de pago<select id="periodoPago">${periodOptions("Mensual")}</select></label>
      <label>Día de pago (fecha cuota)<select id="fechaCuota">${fechaCuotaOptions("30 de cada mes")}</select></label>
      <label>Fecha entrega<input id="fechaEntrega" type="date" value="${today}"/></label>
      <p class="muted">Los vencimientos de cuotas se calculan desde la entrega (15 / 30).</p>
    </div>
    <label>Observaciones<textarea id="observaciones" rows="2"></textarea></label>
    <p class="muted" id="preview"></p>
    <label>Cuenta compra<select id="cuentaCompra"><option value="">—</option>${accOpts}</select></label>
    ${state.user.rol === "admin" ? `<label>Vendedor<select id="vendedorId"><option value="">—</option>${sellerOpts}</select></label>` : ""}
    <label>Compra (URL)<input id="compra" /></label>
    <label>Tarjeta<input id="tarjeta" /></label>
    <button id="saveSale">Guardar</button>
    <p class="error" id="saleErr"></p></div>`)
  );

  wireSalePricingPreview(root);

  root.querySelector("#saveSale").onclick = async () => {
    try {
      const p = computeSalePricing(readSalePricingPayload(root));
      const payload = {
        cliente_id: Number(root.querySelector("#clienteId").value),
        producto: root.querySelector("#producto").value,
        valor: Number(root.querySelector("#valor").value),
        porcentaje: Number(root.querySelector("#porcentaje").value),
        porcentaje_comision: Number(root.querySelector("#porcentajeComision").value || 30),
        inicial: Number(root.querySelector("#inicial").value),
        num_cuotas: Number(root.querySelector("#numCuotas").value),
        periodo_pago: root.querySelector("#periodoPago").value,
        fecha_cuota: root.querySelector("#fechaCuota").value || null,
        observaciones: root.querySelector("#observaciones").value || null,
        cuenta_compra_id: root.querySelector("#cuentaCompra").value
          ? Number(root.querySelector("#cuentaCompra").value)
          : null,
        compra: root.querySelector("#compra").value || null,
        tarjeta: root.querySelector("#tarjeta").value || null,
        total: p.total,
        cuota: p.cuota,
        ganancia: p.ganancia,
        estado_registro: root.querySelector("#isQuote").checked ? "cotizacion" : "venta",
        fecha_cotizacion: root.querySelector("#isQuote").checked ? today : null,
        fecha_entrega: root.querySelector("#isQuote").checked
          ? null
          : root.querySelector("#fechaEntrega").value || today,
      };
      const sellerEl = root.querySelector("#vendedorId");
      if (sellerEl?.value) payload.vendedor_id = Number(sellerEl.value);
      const sale = await api("/api/sales", { method: "POST", body: JSON.stringify(payload) });
      invalidateAll();
      location.hash = `#/sales/${sale.id}`;
      render();
    } catch (e) {
      root.querySelector("#saleErr").textContent = e.message;
    }
  };
}