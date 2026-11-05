import { api, clearSession } from "./api.js";
import { periodOptions } from "./labels.js";

let state = { user: null, route: "", params: "" };

function money(n) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n || 0);
}

function statusLabel(s) {
  return s.estado_registro === "cotizacion" ? "Cotización" : "Venta";
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
    .map((a) => `<option value="${a.id}" ${a.id === selectedId ? "selected" : ""}>${a.nombre}</option>`)
    .join("");
}

function escAttr(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function escHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  return `<div class="card">
    <h2>${isQuote ? `Cotización N° ${sale.id}` : "Editar venta"}</h2>
    <p class="muted">${sale.cliente?.nombre || ""} · ${sale.cliente?.telefono || ""}</p>
    <p>Valor abonado ${money(sale.valor_abonado)} · Pendiente ${money(sale.pendiente)}</p>
    <label>Producto<input id="producto" value="${escAttr(sale.producto)}"/></label>
    <div class="grid2">
      <label>Valor producto<input id="valor" type="number" value="${sale.valor}"/></label>
      <label>%<input id="porcentaje" type="number" step="0.01" value="${sale.porcentaje}"/></label>
      <label>Inicial<input id="inicial" type="number" value="${sale.inicial}"/></label>
      <label># Cuotas<input id="numCuotas" type="number" value="${sale.num_cuotas}"/></label>
      <label>Periodo de pago<select id="periodoPago">${periodOptions(sale.periodo_pago)}</select></label>
      <label>Fecha cuota<input id="fechaCuota" value="${escAttr(sale.fecha_cuota)}"/></label>
      ${dateFields}
    </div>
    <label>Observaciones<textarea id="observaciones" rows="2">${escHtml(sale.observaciones || "")}</textarea></label>
    <p class="muted" id="preview"></p>
    <label>Compra (URL)<input id="compra" value="${escAttr(sale.compra)}"/></label>
    <label>Tarjeta<input id="tarjeta" value="${escAttr(sale.tarjeta)}"/></label>
    <label>Cuenta compra<select id="cuentaCompra"><option value="">—</option>${accountOptions(accounts, sale.cuenta_compra_id)}</select></label>
    ${partnerFields}
    <button type="button" class="secondary" id="saveSaleBtn">Guardar cambios</button>
    <p class="error" id="saveErr"></p>
  </div>`;
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

async function pricingPreview(root) {
  const body = {
    valor: Number(root.querySelector("#valor")?.value || 0),
    porcentaje: Number(root.querySelector("#porcentaje")?.value || 0),
    inicial: Number(root.querySelector("#inicial")?.value || 0),
    num_cuotas: Number(root.querySelector("#numCuotas")?.value || 1),
    periodo_pago: root.querySelector("#periodoPago")?.value || "Mensual",
  };
  const p = await api("/api/pricing/preview", { method: "POST", body: JSON.stringify(body) });
  const el = root.querySelector("#preview");
  if (el) {
    el.textContent =
      `Ganancia ${money(p.ganancia)} · Total ${money(p.total)} · Saldo financiado ${money(p.saldo_financiado)} · Cuota ${money(p.cuota)}`;
  }
  return p;
}

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstChild;
}

function nav() {
  const links = state.user
    ? `<a href="#/dashboard">Panel de control</a>
       <a href="#/sales">Ventas</a>
       <a href="#/sales/new">Nueva venta / cotización</a>
       <a href="#/clients">Clientes</a>
       <a href="#/accounts">Cuentas</a>
       <a href="#" id="logout">Salir (${state.user.nombre_visible})</a>`
    : `<a href="#/login">Entrar</a>`;
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
  root.appendChild(el(`<div class="card"><h1>KYS — Entrar</h1>
    <label>Email<input id="email" type="email" value="admin@kyscred.com"/></label>
    <label>Contraseña<input id="password" type="password" value="admin123"/></label>
    <button id="loginBtn">Entrar</button>
    <p class="muted">Usuario inicial: admin@kyscred.com / admin123 (cámbialo en producción)</p>
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

async function viewDashboard(root) {
  const d = await api("/api/sales/dashboard/seller");
  const rows = d.proximas_cuotas
    .map(
      (u) =>
        `<tr><td>${u.fecha_vencimiento || "—"}</td><td>${u.cliente_nombre}</td><td>${u.producto}</td><td>${u.numero_cuota === 0 ? "Inicial" : "#" + u.numero_cuota}</td><td>${money(u.monto)}</td><td><a href="#/sales/${u.venta_id}">Ver</a></td></tr>`
    )
    .join("");
  root.appendChild(
    el(`<div class="card"><h1>Panel de control — ${d.nombre_vendedor}</h1>
    <div class="grid2">
      <div><p class="muted">Recuperado</p><p class="stat" style="color:var(--ok)">${money(d.total_recuperado)}</p></div>
      <div><p class="muted">Pendiente</p><p class="stat" style="color:var(--warn)">${money(d.total_pendiente)}</p></div>
    </div>
    <p class="muted">${d.num_ventas} ventas</p></div>
    <div class="card"><h2>Próximas cuotas</h2>
    <table><thead><tr><th>Fecha</th><th>Cliente</th><th>Producto</th><th>Cuota</th><th>Valor</th><th></th></tr></thead>
    <tbody>${rows || "<tr><td colspan=6 class=muted>Sin cuotas próximas</td></tr>"}</tbody></table></div>`)
  );
}

async function viewSales(root) {
  const filter = state.salesFilter || "";
  const qs = filter ? `?estado_registro=${filter === "venta" ? "venta" : "cotizacion"}` : "";
  const sales = await api(`/api/sales${qs}`);
  const rows = sales
    .map(
      (s) =>
        `<tr><td>${statusLabel(s)}</td><td>${s.fecha_venta || s.fecha_cotizacion || "—"}</td><td>${s.cliente?.nombre || s.cliente_id}</td><td>${s.producto}</td><td>${money(s.pendiente)}</td><td><a href="#/sales/${s.id}">Detalle</a></td></tr>`
    )
    .join("");
  root.appendChild(
    el(`<div class="card"><h1>Ventas y cotizaciones</h1>
    <p>
      <a href="#/sales">Todas</a> ·
      <a href="#/sales?filter=cotizacion">Cotizaciones</a> ·
      <a href="#/sales?filter=venta">Ventas</a>
    </p>
    <table><thead><tr><th>Estado</th><th>Fecha</th><th>Cliente</th><th>Producto</th><th>Pendiente</th><th></th></tr></thead><tbody>${rows || "<tr><td colspan=6 class=muted>Sin registros</td></tr>"}</tbody></table></div>`)
  );
}

async function viewSaleDetail(root, id) {
  const sale = await api(`/api/sales/${id}`);
  const accounts = await api("/api/accounts");
  const instRows = [...(sale.cuotas || [])]
    .sort((a, b) => a.numero_cuota - b.numero_cuota)
    .map(
      (i) =>
        `<tr><td>${i.numero_cuota === 0 ? "Inicial (0)" : i.numero_cuota}</td><td>${i.fecha_vencimiento || "—"}</td><td>${money(i.monto)}</td><td>${instStatusLabel(i.estado)}</td><td>${money(i.monto_pagado)}</td></tr>`
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
    <p class="muted">Cuotas pagadas: ${sale.cuotas_pagadas ?? "—"}</p>
    <table><thead><tr><th>#</th><th>Vence</th><th>Valor</th><th>Estado</th><th>Abonado</th></tr></thead><tbody>${instRows}</tbody></table></div>`;

  const payBlock = isQuote
    ? ""
    : `<div class="card"><h2>Registrar cobro</h2>
    <p class="muted">Cliente: ${escHtml(sale.cliente?.nombre || "")} · Vendedor: ${escHtml(state.user?.nombre_visible || "")}</p>
    <label>Valor<input id="payAmount" type="number" value="${nextPaymentAmount(sale)}"/></label>
    <label>Fecha de pago<input id="payDate" type="date" value="${today}"/></label>
    <label>Cuenta cobro<select id="payAccount"><option value="">—</option>${accOpts}</select></label>
    <button id="payBtn">Registrar</button>
    <p class="error" id="payErr"></p></div>`;

  root.appendChild(
    el(`<div>
    <p><strong>${statusLabel(sale)}</strong> #${sale.id}</p>
    ${saleEditFormHtml(sale, accounts, isQuote)}
    <button type="button" class="secondary" id="printBtn">Imprimir cotización</button>
    ${convertBlock}
    ${installmentsBlock}
    ${payBlock}
    </div>`)
  );

  wireSaleEditForm(root);
  root.querySelector("#saveSaleBtn").onclick = async () => {
    try {
      await api(`/api/sales/${id}`, { method: "PATCH", body: JSON.stringify(buildSalePatchBody(root)) });
      render();
    } catch (e) {
      root.querySelector("#saveErr").textContent = e.message;
    }
  };
  root.querySelector("#printBtn").onclick = async () => {
    const { html } = await api(`/api/quotes/${id}/print`);
    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
  };
  const payBtn = root.querySelector("#payBtn");
  if (payBtn) {
    payBtn.onclick = async () => {
      try {
        const acc = root.querySelector("#payAccount").value;
        await api(`/api/sales/${id}/payments`, {
          method: "POST",
          body: JSON.stringify({
            monto: Number(root.querySelector("#payAmount").value),
            fecha_pago: root.querySelector("#payDate").value,
            cuenta_cobro_id: acc ? Number(acc) : null,
          }),
        });
        render();
      } catch (e) {
        root.querySelector("#payErr").textContent = e.message;
      }
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
        const purchaseAccEl = root.querySelector("#cuentaCompra");
        await api(`/api/sales/${id}/confirm`, {
          method: "POST",
          body: JSON.stringify({
            fecha_venta: root.querySelector("#confirmSoldAt").value,
            fecha_entrega: delivered || null,
            inicial: Number(root.querySelector("#inicial").value),
            valor_abonado: Number(root.querySelector("#confirmPaid").value),
            fecha_cuota: root.querySelector("#fechaCuota").value || null,
            cuenta_compra_id: purchaseAccEl?.value ? Number(purchaseAccEl.value) : null,
          }),
        });
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
    api("/api/clients"),
    api("/api/accounts"),
    state.user.rol === "admin" ? api("/api/auth/users") : Promise.resolve([]),
  ]);
  const clientOpts = clients.map((c) => `<option value="${c.id}">${c.nombre}</option>`).join("");
  const accOpts = accounts.map((a) => `<option value="${a.id}">${a.nombre}</option>`).join("");
  const sellerOpts = users.map((u) => `<option value="${u.id}">${u.nombre_visible}</option>`).join("");
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
      <label>Fecha cuota<input id="fechaCuota" placeholder="30 de cada mes" /></label>
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

  async function refreshPreview() {
    const body = {
      valor: Number(root.querySelector("#valor").value || 0),
      porcentaje: Number(root.querySelector("#porcentaje").value || 0),
      inicial: Number(root.querySelector("#inicial").value || 0),
      num_cuotas: Number(root.querySelector("#numCuotas").value || 1),
      periodo_pago: root.querySelector("#periodoPago").value,
    };
    const p = await api("/api/pricing/preview", { method: "POST", body: JSON.stringify(body) });
    root.querySelector("#preview").textContent =
      `Ganancia ${money(p.ganancia)} · Total ${money(p.total)} · Saldo financiado ${money(p.saldo_financiado)} · Cuota ${money(p.cuota)}`;
  }
  root.addEventListener("input", (e) => {
    if (["valor", "porcentaje", "inicial", "numCuotas", "periodoPago"].includes(e.target.id)) refreshPreview();
  });
  refreshPreview();

  root.querySelector("#saveSale").onclick = async () => {
    try {
      const p = await api("/api/pricing/preview", {
        method: "POST",
        body: JSON.stringify({
          valor: Number(root.querySelector("#valor").value),
          porcentaje: Number(root.querySelector("#porcentaje").value),
          inicial: Number(root.querySelector("#inicial").value),
          num_cuotas: Number(root.querySelector("#numCuotas").value),
          periodo_pago: root.querySelector("#periodoPago").value,
        }),
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
      };
      const sellerEl = root.querySelector("#vendedorId");
      if (sellerEl?.value) payload.vendedor_id = Number(sellerEl.value);
      const sale = await api("/api/sales", { method: "POST", body: JSON.stringify(payload) });
      location.hash = `#/sales/${sale.id}`;
      render();
    } catch (e) {
      root.querySelector("#saleErr").textContent = e.message;
    }
  };
}

async function viewClients(root) {
  const clients = await api("/api/clients");
  root.appendChild(
    el(`<div class="card"><h1>Clientes</h1>
    <label>Pegar bloque cliente<textarea id="raw" rows="4"></textarea></label>
    <button id="parseBtn" class="secondary">Analizar texto</button>
    <label>Nombre<input id="cName"/></label>
    <label>Teléfono<input id="cPhone"/></label>
    <label>Email<input id="cEmail" type="email"/></label>
    <label>Dirección<input id="cAddress"/></label>
    <label>Identificación<input id="cId"/></label>
    <button id="addClient">Agregar</button>
    <table style="margin-top:1rem"><thead><tr><th>Nombre</th><th>Teléfono</th><th>Email</th><th>Dirección</th></tr></thead>
    <tbody>${clients
      .map(
        (c) =>
          `<tr><td>${escHtml(c.nombre)}</td><td>${escHtml(c.telefono || "")}</td><td>${escHtml(c.email || "")}</td><td>${escHtml(c.direccion || "")}</td></tr>`
      )
      .join("")}</tbody></table></div>`)
  );
  root.querySelector("#parseBtn").onclick = async () => {
    const parsed = await api("/api/clients/parse", {
      method: "POST",
      body: JSON.stringify({ nombre: "", texto_cliente: root.querySelector("#raw").value }),
    });
    root.querySelector("#cName").value = parsed.nombre || "";
    root.querySelector("#cPhone").value = parsed.telefono || "";
    root.querySelector("#cEmail").value = parsed.email || "";
    root.querySelector("#cAddress").value = parsed.direccion || "";
    root.querySelector("#cId").value = parsed.identificacion || "";
  };
  root.querySelector("#addClient").onclick = async () => {
    await api("/api/clients", {
      method: "POST",
      body: JSON.stringify({
        nombre: root.querySelector("#cName").value,
        telefono: root.querySelector("#cPhone").value,
        email: root.querySelector("#cEmail").value || null,
        direccion: root.querySelector("#cAddress").value || null,
        identificacion: root.querySelector("#cId").value,
        texto_cliente: root.querySelector("#raw").value,
      }),
    });
    render();
  };
}

function accountTypeLabel(t) {
  if (t === "purchase") return "Compra";
  if (t === "collection") return "Cobro";
  return "Ambas";
}

async function viewAccounts(root) {
  const summary = await api("/api/accounts/summary");
  const accounts = summary.cuentas || summary.accounts || [];
  const movements = summary.movimientos || summary.movements || [];
  const isAdmin = state.user.rol === "admin";

  const adminForm = isAdmin
    ? `<div class="grid2">
    <label>Nombre<input id="accName"/></label>
    <label>Tipo<select id="accType"><option value="both">Ambas</option><option value="purchase">Compra</option><option value="collection">Cobro</option></select></label>
    <label>Saldo inicial<input id="accOpening" type="number" value="0"/></label>
    </div>
    <button id="addAcc">Agregar cuenta</button>`
    : `<p class="muted">Solo administrador puede crear cuentas.</p>`;

  const balanceRows = accounts
    .map(
      (a) =>
        `<tr data-id="${a.id}">
      <td>${escHtml(a.nombre || a.name)}</td>
      <td>${accountTypeLabel(a.tipo_cuenta || a.account_type)}</td>
      <td>${money(a.total_comprado ?? a.total_purchased)}</td>
      <td>${money(a.total_recibido ?? a.total_received)}</td>
      <td>${
        isAdmin
          ? `<input type="number" class="opening-input" value="${a.saldo_inicial ?? a.opening_balance}" style="max-width:120px"/>`
          : money(a.saldo_inicial ?? a.opening_balance)
      }</td>
      <td><strong>${money(a.balance)}</strong></td>
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
    <div class="card"><h1>Cuentas</h1>
    <p class="muted">Comprado = valor de ventas con esa cuenta de compra. Recibido = cobros con esa cuenta. Balance = saldo inicial + recibido − comprado.</p>
    ${adminForm}
    <table style="margin-top:1.25rem"><thead><tr>
      <th>Cuenta</th><th>Tipo</th><th>Comprado</th><th>Recibido</th><th>Saldo inicial</th><th>Balance</th>${isAdmin ? "<th></th>" : ""}
    </tr></thead><tbody>${balanceRows || "<tr><td colspan=7 class=muted>Sin cuentas</td></tr>"}</tbody></table></div>
    <div class="card"><h2>Movimientos</h2>
    <table><thead><tr><th>Fecha</th><th>Cuenta</th><th>Tipo</th><th>Valor</th><th>Ref</th><th>Detalle</th></tr></thead>
    <tbody>${movementRows || "<tr><td colspan=6 class=muted>Sin movimientos (asigna cuenta en ventas y cobros)</td></tr>"}</tbody></table></div></div>`)
  );

  const addBtn = root.querySelector("#addAcc");
  if (addBtn) {
    addBtn.onclick = async () => {
      await api("/api/accounts", {
        method: "POST",
        body: JSON.stringify({
          nombre: root.querySelector("#accName").value,
          tipo_cuenta: root.querySelector("#accType").value,
          saldo_inicial: Number(root.querySelector("#accOpening").value || 0),
        }),
      });
      render();
    };
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

  const hashRaw = location.hash.slice(1) || "/dashboard";
  const [hashPath, hashQuery] = hashRaw.split("?");
  state.salesFilter = new URLSearchParams(hashQuery || "").get("filter") || "";
  const [path, param] = hashPath.split("/").filter(Boolean);
  const route = path || "dashboard";
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
    else if (route === "quotes" && param === "new") await viewNewSale(root, true);
    else if (route === "sales" && param === "new") {
      const preQuote = new URLSearchParams(hashQuery || "").get("cotizacion") === "1";
      await viewNewSale(root, preQuote);
    }
    else if (route === "sales" && param) await viewSaleDetail(root, param);
    else if (route === "clients") await viewClients(root);
    else if (route === "accounts") await viewAccounts(root);
    else await viewDashboard(root);
  } catch (e) {
    root.appendChild(el(`<p class="error">${e.message}</p>`));
  }
  app.appendChild(root);
}

window.addEventListener("hashchange", render);
loadUser().then(render);
