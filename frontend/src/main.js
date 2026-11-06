import { api, clearSession } from "./api.js";
import { getClientes, getCuentas, invalidateClientes, invalidateCuentas, invalidateAll } from "./cache.js";
import { money, escAttr, escHtml, pricingSummaryText, tableScroll } from "./format.js";
import { initLoading } from "./loading.js";
import { openModal, closeModal, modalBody } from "./modal.js";
import {
  periodOptions,
  fechaCuotaOptions,
  formatDiaCuota,
  formatCuotasRatio,
  formatUltimoPago,
  saleMatchesVenceHasta,
  salePaymentRowClassForVence,
  formatProximoVencimiento,
} from "./labels.js";
import { computeSalePricing } from "./pricing.js";

initLoading();

const isProd = import.meta.env.PROD;
let state = { user: null, route: "", params: "", salesFilter: "", salesVenceHasta: "" };

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

function accountOptions(accounts, selectedId) {
  return accounts
    .map(
      (a) =>
        `<option value="${a.id}" ${a.id === selectedId ? "selected" : ""}>${escHtml(a.nombre || a.name || "")}</option>`,
    )
    .join("");
}

function saleDetailSummaryHtml(sale, isQuote) {
  return `<div class="card">
    <h1>${isQuote ? "Cotización" : "Venta"} #${sale.id}</h1>
    <p><strong>${escHtml(sale.producto || "")}</strong></p>
    <p class="muted">${escHtml(sale.cliente?.nombre || "")}${sale.cliente?.telefono ? ` · ${escHtml(sale.cliente.telefono)}` : ""}</p>
    <p class="muted">${saleCuotasLine(sale)}</p>
    <p>Abonado ${money(sale.valor_abonado)} · Pendiente ${money(sale.pendiente)} · Total ${money(sale.total)}</p>
    <div class="detail-actions">
      <button type="button" id="editSaleBtn">Editar</button>
      ${isQuote ? "" : `<button type="button" id="paySaleBtn">Registrar cobro</button>`}
      ${isQuote ? `<button type="button" class="secondary" id="printBtn">Imprimir cotización</button>` : ""}
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
  const partnerFields =
    state.user?.rol === "admin"
      ? `<label>Cuota tarjeta<input id="cuotaTarjeta" value="${escAttr(sale.cuota_tarjeta)}"/></label>
      <label>Ganancia Vivi<input id="gananciaVivi" type="number" value="${sale.ganancia_vivi || 0}"/></label>
      <label>Valor abonado Vivi<input id="abonadoVivi" type="number" value="${sale.abonado_vivi || 0}"/></label>`
      : "";
  return `<p class="muted">${escHtml(sale.cliente?.nombre || "")} · Abonado ${money(sale.valor_abonado)} · Pendiente ${money(sale.pendiente)}</p>
    <label>Producto<input id="producto" value="${escAttr(sale.producto)}"/></label>
    <div class="grid2">
      <label>Valor producto<input id="valor" type="number" value="${sale.valor}"/></label>
      <label>%<input id="porcentaje" type="number" step="0.01" value="${sale.porcentaje}"/></label>
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
    ${partnerFields}
    <button type="button" id="saveSaleBtn">Guardar cambios</button>
    <p class="error" id="saveErr"></p>`;
}

function buildSalePatchBody(root) {
  const cuentaCompra = root.querySelector("#cuentaCompra").value;
  const body = {
    producto: root.querySelector("#producto").value,
    valor: Number(root.querySelector("#valor").value),
    porcentaje: Number(root.querySelector("#porcentaje").value),
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
  const gananciaVivi = root.querySelector("#gananciaVivi");
  const abonadoVivi = root.querySelector("#abonadoVivi");
  if (cuotaTarjeta) body.cuota_tarjeta = cuotaTarjeta.value || null;
  if (gananciaVivi) body.ganancia_vivi = Number(gananciaVivi.value || 0);
  if (abonadoVivi) body.abonado_vivi = Number(abonadoVivi.value || 0);
  return body;
}

function wireSaleEditForm(root) {
  root.addEventListener("input", (e) => {
    if (["valor", "porcentaje", "inicial", "numCuotas", "periodoPago"].includes(e.target.id)) pricingPreview(root);
  });
  pricingPreview(root);
}

function pricingPreview(root) {
  const body = {
    valor: Number(root.querySelector("#valor")?.value || 0),
    porcentaje: Number(root.querySelector("#porcentaje")?.value || 0),
    inicial: Number(root.querySelector("#inicial")?.value || 0),
    num_cuotas: Number(root.querySelector("#numCuotas")?.value || 1),
    periodo_pago: root.querySelector("#periodoPago")?.value || "Mensual",
  };
  const p = computeSalePricing(body);
  const el = root.querySelector("#preview");
  if (el) el.textContent = pricingSummaryText(p);
  return p;
}

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstChild;
}

function navLink(href, label, section) {
  const active = state.navSection === section ? ' class="nav-active"' : "";
  return `<a href="${href}"${active}>${label}</a>`;
}

function nav() {
  const links = state.user
    ? `${navLink("#/dashboard", "Inicio", "dashboard")}
       ${navLink("#/sales", "Ventas", "sales")}
       ${navLink("#/clients", "Clientes", "clients")}
       ${navLink("#/accounts", "Cuentas", "accounts")}
       <a href="#" id="logout">Salir (${escHtml(state.user.nombre_visible)})</a>`
    : navLink("#/login", "Entrar", "login");
  return `<header class="app-header"><strong>KYS</strong> <span class="muted">ventas · cuotas · clientes</span></header><nav>${links}</nav>`;
}

async function loadUser() {
  try {
    state.user = await api("/api/auth/me");
  } catch {
    state.user = null;
  }
}

async function viewLogin(root) {
  const devHint = isProd
    ? ""
    : `<p class="muted">Desarrollo: admin@kyscred.com / admin123</p>`;
  root.appendChild(el(`<div class="card"><h1>KYS — Entrar</h1>
    <label>Email<input id="email" type="email" value="${isProd ? "" : "admin@kyscred.com"}"/></label>
    <label>Contraseña<input id="password" type="password" value="${isProd ? "" : "admin123"}"/></label>
    <button id="loginBtn">Entrar</button>
    ${devHint}
    <p class="error" id="err"></p></div>`));
  root.querySelector("#loginBtn").onclick = async () => {
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: root.querySelector("#email").value,
          password: root.querySelector("#password").value,
        }),
      });
      await loadUser();
      location.hash = "#/dashboard";
      render();
    } catch (e) {
      root.querySelector("#err").textContent = e.message;
    }
  };
}

function accountBalanceClass(balance) {
  const n = Number(balance) || 0;
  if (n > 0) return "balance-pos";
  if (n < 0) return "balance-neg";
  return "";
}

async function viewDashboard(root) {
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
    ${accountsSection}
    <div class="card"><h2>Próximas cuotas</h2>
    ${tableScroll(`<table><thead><tr><th>Fecha</th><th>Cliente</th><th>Producto</th><th>Cuota</th><th>Valor</th><th></th></tr></thead>
    <tbody>${cuotaRows || "<tr><td colspan=6 class=muted>Sin cuotas próximas</td></tr>"}</tbody></table>`)}</div>`)
  );
}

function salesListHash(extra = {}) {
  const p = new URLSearchParams();
  const estado = extra.filter ?? state.salesFilter;
  const vence = extra.vence !== undefined ? extra.vence : state.salesVenceHasta;
  if (estado) p.set("filter", estado);
  if (vence) p.set("vence", vence);
  const q = p.toString();
  return `#/sales${q ? `?${q}` : ""}`;
}

async function viewSales(root) {
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
      return `<tr class="${rowClass}"><td>${statusLabel(s)}</td><td>${escHtml(s.fecha_venta || s.fecha_cotizacion || "—")}</td><td>${escHtml(s.cliente?.nombre || String(s.cliente_id ?? ""))}</td><td>${escHtml(s.producto || "")}</td><td class="num">${cuotasHtml}</td>${venceCell}<td class="num">${escHtml(diaCell)}</td><td>${ultHtml}</td><td>${money(s.pendiente)}</td><td class="actions-cell">${actions}</td></tr>`;
    })
    .join("");
  const colspan = showVenceCol ? 10 : 9;
  const venceHead = showVenceCol ? "<th>Próx. vence</th>" : "";
  root.appendChild(
    el(`<div class="card"><h1>Ventas y cotizaciones</h1>
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
    ${tableScroll(`<table><thead><tr><th>Estado</th><th>Fecha</th><th>Cliente</th><th>Producto</th><th>Cuotas</th>${venceHead}<th>Día pago</th><th>Últ. pago</th><th>Pendiente</th><th>Acciones</th></tr></thead><tbody>${rows || `<tr><td colspan=${colspan} class=muted>Sin registros</td></tr>`}</tbody></table>`)}</div>`)
  );

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

async function viewSaleDetail(root, id) {
  const sale = await api(`/api/sales/${id}`);
  const accounts = sale.cuentas || (await getCuentas(api));
  const instRows = [...(sale.cuotas || [])]
    .sort((a, b) => a.numero_cuota - b.numero_cuota)
    .map(
      (i) =>
        `<tr><td>${i.numero_cuota === 0 ? "Inicial (0)" : i.numero_cuota}</td><td>${i.fecha_vencimiento || "—"}</td><td>${money(i.monto)}</td><td>${instStatusLabel(i.estado)}</td><td>${i.fecha_pago || "—"}</td><td>${money(i.monto_pagado)}</td></tr>`
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
    ${tableScroll(`<table><thead><tr><th>#</th><th>Vence</th><th>Valor</th><th>Estado</th><th>Fecha pago</th><th>Abonado</th></tr></thead><tbody>${instRows}</tbody></table>`)}</div>`;

  root.appendChild(
    el(`<div>
    ${saleDetailSummaryHtml(sale, isQuote)}
    ${convertBlock}
    ${installmentsBlock}
    </div>`)
  );

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

async function viewNewSale(root, startAsQuote = false) {
  const [clients, accounts, users] = await Promise.all([
    getClientes(api),
    getCuentas(api),
    state.user.rol === "admin" ? api("/api/auth/users") : Promise.resolve([]),
  ]);
  const clientOpts = clients.map((c) => `<option value="${c.id}">${escHtml(c.nombre)}</option>`).join("");
  const accOpts = accounts.map((a) => `<option value="${a.id}">${escHtml(a.nombre)}</option>`).join("");
  const sellerOpts = users.map((u) => `<option value="${u.id}">${escHtml(u.nombre_visible)}</option>`).join("");
  const today = new Date().toISOString().slice(0, 10);

  root.appendChild(
    el(`<div class="card"><h1>Nueva venta / cotización</h1>
    <label class="check-row"><input type="checkbox" id="isQuote" ${startAsQuote ? "checked" : ""}/> Solo cotización (aún no es venta)</label>
    <label>Cliente<select id="clienteId"><option value="">—</option>${clientOpts}</select></label>
    <label>Producto<input id="producto" /></label>
    <div class="grid2">
      <label>Valor producto<input id="valor" type="number" /></label>
      <label>%<input id="porcentaje" type="number" step="0.01" value="0.3" /></label>
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

  function refreshPreview() {
    const body = {
      valor: Number(root.querySelector("#valor").value || 0),
      porcentaje: Number(root.querySelector("#porcentaje").value || 0),
      inicial: Number(root.querySelector("#inicial").value || 0),
      num_cuotas: Number(root.querySelector("#numCuotas").value || 1),
      periodo_pago: root.querySelector("#periodoPago").value,
    };
    const p = computeSalePricing(body);
    root.querySelector("#preview").textContent = pricingSummaryText(p);
  }
  root.addEventListener("input", (e) => {
    if (["valor", "porcentaje", "inicial", "numCuotas", "periodoPago"].includes(e.target.id)) refreshPreview();
  });
  refreshPreview();

  root.querySelector("#saveSale").onclick = async () => {
    try {
      const p = computeSalePricing({
        valor: Number(root.querySelector("#valor").value),
        porcentaje: Number(root.querySelector("#porcentaje").value),
        inicial: Number(root.querySelector("#inicial").value),
        num_cuotas: Number(root.querySelector("#numCuotas").value),
        periodo_pago: root.querySelector("#periodoPago").value,
      });
      const payload = {
        cliente_id: Number(root.querySelector("#clienteId").value),
        producto: root.querySelector("#producto").value,
        valor: Number(root.querySelector("#valor").value),
        porcentaje: Number(root.querySelector("#porcentaje").value),
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

function clientFormHtml() {
  return `<label>Pegar bloque cliente<textarea id="raw" rows="4"></textarea></label>
    <button type="button" id="parseBtn" class="secondary">Analizar texto</button>
    <label>Nombre<input id="cName"/></label>
    <label>Teléfono<input id="cPhone"/></label>
    <label>Email<input id="cEmail" type="email"/></label>
    <label>Dirección<input id="cAddress"/></label>
    <label>Identificación<input id="cId"/></label>
    <button type="button" id="addClient">Guardar cliente</button>
    <p class="error" id="clientErr"></p>`;
}

function wireClientForm(container) {
  container.querySelector("#parseBtn").onclick = async () => {
    const parsed = await api("/api/clients/parse", {
      method: "POST",
      body: JSON.stringify({ nombre: "", texto_cliente: container.querySelector("#raw").value }),
    });
    container.querySelector("#cName").value = parsed.nombre || "";
    container.querySelector("#cPhone").value = parsed.telefono || "";
    container.querySelector("#cEmail").value = parsed.email || "";
    container.querySelector("#cAddress").value = parsed.direccion || "";
    container.querySelector("#cId").value = parsed.identificacion || "";
  };
  container.querySelector("#addClient").onclick = async () => {
    try {
      await api("/api/clients", {
        method: "POST",
        body: JSON.stringify({
          nombre: container.querySelector("#cName").value,
          telefono: container.querySelector("#cPhone").value,
          email: container.querySelector("#cEmail").value || null,
          direccion: container.querySelector("#cAddress").value || null,
          identificacion: container.querySelector("#cId").value,
          texto_cliente: container.querySelector("#raw").value,
        }),
      });
      closeModal();
      invalidateClientes();
      render();
    } catch (e) {
      container.querySelector("#clientErr").textContent = e.message;
    }
  };
}

async function viewClients(root) {
  const clients = await getClientes(api);
  root.appendChild(
    el(`<div class="card"><div class="card-head"><h1>Clientes</h1><button type="button" id="openClientModal">Agregar cliente</button></div>
    ${tableScroll(`<table><thead><tr><th>Nombre</th><th>Teléfono</th><th>Email</th><th>Dirección</th></tr></thead>
    <tbody>${clients
      .map(
        (c) =>
          `<tr><td>${escHtml(c.nombre)}</td><td>${escHtml(c.telefono || "")}</td><td>${escHtml(c.email || "")}</td><td>${escHtml(c.direccion || "")}</td></tr>`
      )
      .join("") || `<tr><td colspan="4" class="muted">Sin clientes</td></tr>`}</tbody></table>`)}</div>`),
  );
  root.querySelector("#openClientModal").onclick = () => {
    openModal("Agregar cliente", clientFormHtml());
    wireClientForm(modalBody());
  };
}

function accountTypeLabel(t) {
  if (t === "purchase") return "Compra";
  if (t === "collection") return "Cobro";
  return "Ambas";
}

async function viewAccounts(root, focusAccountId) {
  const summary = await api("/api/accounts/summary");
  const accounts = summary.cuentas || summary.accounts || [];
  let movements = summary.movimientos || summary.movements || [];
  const isAdmin = state.user.rol === "admin";
  const focusId = focusAccountId ? Number(focusAccountId) : null;
  const focusAcc = focusId ? accounts.find((a) => Number(a.id) === focusId) : null;

  if (focusId && focusAcc) {
    movements = movements.filter((m) => Number(m.cuenta_id ?? m.account_id) === focusId);
  }

  const adminToolbar = isAdmin
    ? `<button type="button" id="openAccModal">Agregar cuenta</button>`
    : `<p class="muted">Solo administrador puede crear cuentas.</p>`;

  const focusBanner = focusAcc
    ? `<div class="card account-focus" id="account-balance">
    <p class="muted"><a href="#/accounts">← Todas las cuentas</a></p>
    <h1>${escHtml(focusAcc.nombre || focusAcc.name)}</h1>
    <p class="stat ${accountBalanceClass(focusAcc.balance)}">${money(focusAcc.balance)}</p>
    <div class="grid2 account-focus__grid">
      <div><p class="muted">Saldo inicial</p><p>${money(focusAcc.saldo_inicial ?? focusAcc.opening_balance)}</p></div>
      <div><p class="muted">Cobrado</p><p class="text-ok">${money(focusAcc.total_recibido ?? focusAcc.total_received)}</p></div>
      <div><p class="muted">Comprado</p><p class="text-warn">${money(focusAcc.total_comprado ?? focusAcc.total_purchased)}</p></div>
      <div><p class="muted">Tipo</p><p>${accountTypeLabel(focusAcc.tipo_cuenta || focusAcc.account_type)}</p></div>
    </div>
    <p class="muted">Balance = saldo inicial + cobrado − comprado</p>
  </div>`
    : "";

  const balanceRows = accounts
    .map(
      (a) =>
        `<tr data-id="${a.id}" class="${focusId === Number(a.id) ? "row-focus" : ""} ${focusId && focusId !== Number(a.id) ? "row-dim" : ""}">
      <td>${focusId ? `<a href="#/accounts/${a.id}">${escHtml(a.nombre || a.name)}</a>` : escHtml(a.nombre || a.name)}</td>
      <td>${accountTypeLabel(a.tipo_cuenta || a.account_type)}</td>
      <td>${money(a.total_comprado ?? a.total_purchased)}</td>
      <td>${money(a.total_recibido ?? a.total_received)}</td>
      <td>${
        isAdmin
          ? `<input type="number" class="opening-input" value="${a.saldo_inicial ?? a.opening_balance}" style="max-width:120px"/>`
          : money(a.saldo_inicial ?? a.opening_balance)
      }</td>
      <td><strong class="${accountBalanceClass(a.balance)}">${money(a.balance)}</strong></td>
      <td><a href="#/accounts/${a.id}">Balance</a></td>
      ${isAdmin ? `<td><button type="button" class="secondary save-opening">Guardar saldo</button></td>` : ""}
    </tr>`
    )
    .join("");

  const movementRows = movements
    .map((m) => {
      const accId = m.cuenta_id ?? m.account_id;
      const acc = accounts.find((a) => a.id === accId);
      const tipo = (m.tipo || m.kind) === "compra" || m.kind === "purchase" ? "Compra" : "Cobro";
      const sign = tipo === "Compra" ? "−" : "+";
      return `<tr><td>${m.fecha || m.date || "—"}</td><td>${escHtml(acc?.nombre || acc?.name || accId)}</td><td>${tipo}</td><td>${sign} ${money(m.monto ?? m.amount)}</td><td>${escHtml(m.referencia || m.reference)}</td><td class="muted">${escHtml(m.descripcion || m.description)}</td></tr>`;
    })
    .join("");

  root.appendChild(
    el(`<div>
    ${focusBanner}
    <div class="card"><div class="card-head"><h1>${focusAcc ? "Resumen de cuentas" : "Cuentas"}</h1>${adminToolbar}</div>
    <p class="muted">Comprado = valor de ventas con esa cuenta de compra. Recibido = cobros con esa cuenta. Balance = saldo inicial + recibido − comprado.</p>
    ${tableScroll(`<table class="table-spaced"><thead><tr>
      <th>Cuenta</th><th>Tipo</th><th>Comprado</th><th>Recibido</th><th>Saldo inicial</th><th>Balance</th><th></th>${isAdmin ? "<th></th>" : ""}
    </tr></thead><tbody>${balanceRows || `<tr><td colspan=${isAdmin ? 8 : 7} class=muted>Sin cuentas</td></tr>`}</tbody></table>`)}</div>
    <div class="card"><h2>${focusAcc ? `Movimientos — ${escHtml(focusAcc.nombre || focusAcc.name)}` : "Movimientos"}</h2>
    ${tableScroll(`<table><thead><tr><th>Fecha</th><th>Cuenta</th><th>Tipo</th><th>Valor</th><th>Ref</th><th>Detalle</th></tr></thead>
    <tbody>${movementRows || "<tr><td colspan=6 class=muted>Sin movimientos (asigna cuenta en ventas y cobros)</td></tr>"}</tbody></table>`)}</div></div>`)
  );

  const openAccBtn = root.querySelector("#openAccModal");
  if (openAccBtn) {
    openAccBtn.onclick = () => {
      openModal(
        "Agregar cuenta",
        `<div class="grid2">
          <label>Nombre<input id="accName"/></label>
          <label>Tipo<select id="accType"><option value="both">Ambas</option><option value="purchase">Compra</option><option value="collection">Cobro</option></select></label>
          <label>Saldo inicial<input id="accOpening" type="number" value="0"/></label>
        </div>
        <button type="button" id="addAcc">Guardar cuenta</button>
        <p class="error" id="accErr"></p>`,
      );
      const body = modalBody();
      body.querySelector("#addAcc").onclick = async () => {
        try {
          await api("/api/accounts", {
            method: "POST",
            body: JSON.stringify({
              nombre: body.querySelector("#accName").value,
              tipo_cuenta: body.querySelector("#accType").value,
              saldo_inicial: Number(body.querySelector("#accOpening").value || 0),
            }),
          });
          closeModal();
          invalidateCuentas();
          render();
        } catch (e) {
          body.querySelector("#accErr").textContent = e.message;
        }
      };
    };
  }

  if (focusAcc) {
    requestAnimationFrame(() => {
      document.getElementById("account-balance")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  root.querySelectorAll(".save-opening").forEach((btn) => {
    btn.onclick = async () => {
      const tr = btn.closest("tr");
      const id = tr.dataset.id;
      const opening = Number(tr.querySelector(".opening-input").value || 0);
      try {
        await api(`/api/accounts/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ saldo_inicial: opening }),
        });
        render();
      } catch (e) {
        alert(e.message);
      }
    };
  });
}

function wireNavLinks(app) {
  app.querySelectorAll("nav a[href^='#']").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const href = a.getAttribute("href");
      if (href) location.hash = href;
    });
  });
}

async function render() {
  let hashRaw = location.hash.slice(1) || "/dashboard";
  if (hashRaw === "/quotes/new" || hashRaw.startsWith("/quotes/new?")) {
    location.replace("#/sales/new?cotizacion=1");
    return;
  }

  const [hashPath, hashQuery] = hashRaw.split("?");
  const salesParams = new URLSearchParams(hashQuery || "");
  state.salesFilter = salesParams.get("filter") || "";
  state.salesVenceHasta = salesParams.get("vence") || "";
  const [path, param] = hashPath.split("/").filter(Boolean);
  const route = path || "dashboard";
  state.navSection =
    route === "login"
      ? "login"
      : route === "dashboard"
        ? "dashboard"
        : route === "sales" || route === "quotes"
          ? "sales"
          : route === "clients"
            ? "clients"
            : route === "accounts"
              ? "accounts"
              : "dashboard";

  closeModal();
  const app = document.getElementById("app");
  app.innerHTML = nav();
  wireNavLinks(app);
  const logout = document.getElementById("logout");
  if (logout) {
    logout.onclick = async (e) => {
      e.preventDefault();
      await api("/api/auth/logout", { method: "POST" });
      clearSession();
      state.user = null;
      location.hash = "#/login";
      render();
    };
  }
  const root = document.createElement("div");

  if (!state.user && route !== "login") {
    location.hash = "#/login";
    await viewLogin(root);
    app.appendChild(root);
    return;
  }

  try {
    if (route === "login") await viewLogin(root);
    else if (route === "dashboard") await viewDashboard(root);
    else if (route === "sales" && !param) await viewSales(root);
    else if (route === "sales" && param === "new") {
      const preQuote = new URLSearchParams(hashQuery || "").get("cotizacion") === "1";
      await viewNewSale(root, preQuote);
    }
    else if (route === "sales" && param) await viewSaleDetail(root, param);
    else if (route === "clients") await viewClients(root);
    else if (route === "accounts") await viewAccounts(root, param);
    else await viewDashboard(root);
  } catch (e) {
    root.appendChild(el(`<p class="error">${escHtml(e.message)}</p>`));
  }
  app.appendChild(root);
}

window.addEventListener("hashchange", render);
loadUser().then(render);
