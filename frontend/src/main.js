import { api } from "./api.js";

let state = { user: null, route: "", params: "" };

function money(n) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n || 0);
}

function statusLabel(s) {
  return s.record_status === "cotizacion" ? "Cotización" : "Venta";
}

function instStatusLabel(status) {
  if (status === "paid") return "Pagada";
  if (status === "partial") return "Parcial";
  return "Pendiente";
}

function nextPaymentAmount(sale) {
  const rows = [...(sale.installments || [])].sort((a, b) => a.sequence - b.sequence);
  const next = rows.find((i) => i.status !== "paid");
  if (!next) return sale.installment_amount || 0;
  return Math.max(0, (next.amount || 0) - (next.amount_paid || 0));
}

function accountOptions(accounts, selectedId) {
  return accounts
    .map((a) => `<option value="${a.id}" ${a.id === selectedId ? "selected" : ""}>${a.name}</option>`)
    .join("");
}

function escAttr(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function periodOptions(current) {
  const p = current || "Mensual";
  return ["Mensual", "Quincenal", "Contado"]
    .map((o) => `<option ${p === o ? "selected" : ""}>${o}</option>`)
    .join("");
}

function saleEditFormHtml(sale, accounts, isQuote) {
  const dateFields = isQuote
    ? ""
    : `<label>Fecha venta<input id="soldAt" type="date" value="${sale.sold_at || ""}"/></label>
      <label>Fecha entrega<input id="deliveredAt" type="date" value="${sale.delivered_at || ""}"/></label>`;
  return `<div class="card">
    <h2>${isQuote ? "Editar cotización" : "Editar venta"}</h2>
    <p class="muted">${sale.client?.name || ""} · ${sale.client?.phone || ""}</p>
    <p>Abonado ${money(sale.amount_paid)} · Pendiente ${money(sale.balance_pending)}</p>
    <label>Producto<input id="product" value="${escAttr(sale.product_description)}"/></label>
    <div class="grid2">
      <label>Costo<input id="cost" type="number" value="${sale.cost_price}"/></label>
      <label>% margen<input id="margin" type="number" step="0.01" value="${sale.margin_rate}"/></label>
      <label>Inicial<input id="down" type="number" value="${sale.down_payment}"/></label>
      <label># Cuotas<input id="count" type="number" value="${sale.installment_count}"/></label>
      <label>Periodo<select id="period">${periodOptions(sale.payment_period)}</select></label>
      <label>Regla fecha cuota<input id="dueRule" value="${escAttr(sale.due_rule)}"/></label>
      ${dateFields}
    </div>
    <p class="muted" id="preview"></p>
    <label>Cuenta compra<select id="purchaseAcc"><option value="">—</option>${accountOptions(accounts, sale.purchase_account_id)}</select></label>
    <label>URL compra<input id="purchaseUrl" value="${escAttr(sale.purchase_url)}"/></label>
    <button type="button" class="secondary" id="saveSaleBtn">Guardar cambios</button>
    <p class="error" id="saveErr"></p>
  </div>`;
}

function buildSalePatchBody(root) {
  const purchaseAcc = root.querySelector("#purchaseAcc").value;
  const body = {
    product_description: root.querySelector("#product").value,
    cost_price: Number(root.querySelector("#cost").value),
    margin_rate: Number(root.querySelector("#margin").value),
    down_payment: Number(root.querySelector("#down").value),
    installment_count: Number(root.querySelector("#count").value),
    payment_period: root.querySelector("#period").value,
    due_rule: root.querySelector("#dueRule").value || null,
    purchase_account_id: purchaseAcc ? Number(purchaseAcc) : null,
    purchase_url: root.querySelector("#purchaseUrl")?.value || null,
  };
  const soldAt = root.querySelector("#soldAt");
  const deliveredAt = root.querySelector("#deliveredAt");
  if (soldAt?.value) body.sold_at = soldAt.value;
  if (deliveredAt?.value) body.delivered_at = deliveredAt.value;
  else if (deliveredAt) body.delivered_at = null;
  return body;
}

function wireSaleEditForm(root) {
  root.addEventListener("input", (e) => {
    if (["cost", "margin", "down", "count", "period"].includes(e.target.id)) pricingPreview(root);
  });
  pricingPreview(root);
}

async function pricingPreview(root) {
  const body = {
    cost_price: Number(root.querySelector("#cost")?.value || 0),
    margin_rate: Number(root.querySelector("#margin")?.value || 0),
    down_payment: Number(root.querySelector("#down")?.value || 0),
    installment_count: Number(root.querySelector("#count")?.value || 1),
    payment_period: root.querySelector("#period")?.value || "Mensual",
  };
  const p = await api("/api/pricing/preview", { method: "POST", body: JSON.stringify(body) });
  const el = root.querySelector("#preview");
  if (el) {
    el.textContent =
      `Ganancia ${money(p.profit)} · Total ${money(p.total_charge)} · A financiar ${money(p.financed_amount)} · Cuota ${money(p.installment_amount)}`;
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
    ? `<a href="#/dashboard">Dashboard</a>
       <a href="#/sales">Ventas</a>
       <a href="#/sales/new">Nueva venta / cotización</a>
       <a href="#/clients">Clientes</a>
       <a href="#/accounts">Cuentas</a>
       <a href="#" id="logout">Salir (${state.user.display_name})</a>`
    : `<a href="#/login">Entrar</a>`;
  return `<nav>${links}</nav>`;
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
  const rows = d.upcoming_installments
    .map(
      (u) =>
        `<tr><td>${u.due_date || "—"}</td><td>${u.client_name}</td><td>${u.product}</td><td>${u.sequence === 0 ? "Inicial" : "#" + u.sequence}</td><td>${money(u.amount)}</td><td><a href="#/sales/${u.sale_id}">Ver</a></td></tr>`
    )
    .join("");
  root.appendChild(
    el(`<div class="card"><h1>Dashboard — ${d.seller_name}</h1>
    <div class="grid2">
      <div><p class="muted">Recuperado</p><p class="stat" style="color:var(--ok)">${money(d.total_recovered)}</p></div>
      <div><p class="muted">Pendiente</p><p class="stat" style="color:var(--warn)">${money(d.total_pending)}</p></div>
    </div>
    <p class="muted">${d.sale_count} ventas</p></div>
    <div class="card"><h2>Próximas cuotas</h2>
    <table><thead><tr><th>Fecha</th><th>Cliente</th><th>Producto</th><th>Cuota</th><th>Monto</th><th></th></tr></thead>
    <tbody>${rows || "<tr><td colspan=6 class=muted>Sin cuotas próximas</td></tr>"}</tbody></table></div>`)
  );
}

async function viewSales(root) {
  const filter = state.salesFilter || "";
  const qs = filter ? `?record_status=${filter}` : "";
  const sales = await api(`/api/sales${qs}`);
  const rows = sales
    .map(
      (s) =>
        `<tr><td>${statusLabel(s)}</td><td>${s.sold_at || "—"}</td><td>${s.client?.name || s.client_id}</td><td>${s.product_description}</td><td>${money(s.balance_pending)}</td><td><a href="#/sales/${s.id}">Detalle</a></td></tr>`
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
  const instRows = [...(sale.installments || [])]
    .sort((a, b) => a.sequence - b.sequence)
    .map(
      (i) =>
        `<tr><td>${i.sequence === 0 ? "Inicial (0)" : i.sequence}</td><td>${i.due_date || "—"}</td><td>${money(i.amount)}</td><td>${instStatusLabel(i.status)}</td><td>${money(i.amount_paid)}</td></tr>`
    )
    .join("");
  const accOpts = accountOptions(accounts, null);
  const isQuote = sale.record_status === "cotizacion";
  const today = new Date().toISOString().slice(0, 10);

  const convertBlock = isQuote
    ? `<div class="card" style="margin-top:1rem;border-color:var(--accent)">
    <label class="check-row"><input type="checkbox" id="confirmAsSale"/> Convertir a venta</label>
    <p class="muted">Marca la casilla, revisa abonos y confirma para crear el plan de cuotas.</p>
    <div id="confirmFields" hidden>
      <div class="grid2">
        <label>Fecha venta<input id="confirmSoldAt" type="date" value="${today}"/></label>
        <label>Fecha entrega<input id="confirmDelivered" type="date" value="${sale.delivered_at || ""}"/></label>
        <label>Total abonado hasta hoy<input id="confirmPaid" type="number" value="${sale.down_payment}"/></label>
      </div>
      <button id="confirmBtn">Confirmar venta</button>
      <p class="error" id="confirmErr"></p>
    </div></div>`
    : "";

  const installmentsBlock = isQuote
    ? ""
    : `<div class="card"><h2>Cuotas</h2>
    <table><thead><tr><th>#</th><th>Vence</th><th>Monto</th><th>Estado</th><th>Pagado</th></tr></thead><tbody>${instRows}</tbody></table></div>`;

  const payBlock = isQuote
    ? ""
    : `<div class="card"><h2>Registrar pago</h2>
    <label>Monto<input id="payAmount" type="number" value="${nextPaymentAmount(sale)}"/></label>
    <label>Fecha<input id="payDate" type="date" value="${today}"/></label>
    <label>Cuenta cobro<select id="payAccount"><option value="">—</option>${accOpts}</select></label>
    <button id="payBtn">Registrar</button>
    <p class="error" id="payErr"></p></div>`;

  root.appendChild(
    el(`<div>
    <p><strong>${statusLabel(sale)}</strong> #${sale.id}</p>
    ${saleEditFormHtml(sale, accounts, isQuote)}
    <button type="button" class="secondary" id="printBtn">Imprimir</button>
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
    const base = import.meta.env.VITE_API_URL || "";
    const html = await fetch(`${base}/api/quotes/${id}/print`, { credentials: "include" }).then((r) => r.text());
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
            amount: Number(root.querySelector("#payAmount").value),
            paid_at: root.querySelector("#payDate").value,
            collection_account_id: acc ? Number(acc) : null,
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
        const purchaseAccEl = root.querySelector("#purchaseAcc");
        await api(`/api/sales/${id}/confirm`, {
          method: "POST",
          body: JSON.stringify({
            sold_at: root.querySelector("#confirmSoldAt").value,
            delivered_at: delivered || null,
            down_payment: Number(root.querySelector("#down").value),
            amount_paid: Number(root.querySelector("#confirmPaid").value),
            due_rule: root.querySelector("#dueRule").value || null,
            purchase_account_id: purchaseAccEl?.value ? Number(purchaseAccEl.value) : null,
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
    state.user.role === "admin" ? api("/api/auth/users") : Promise.resolve([]),
  ]);
  const clientOpts = clients.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
  const accOpts = accounts.map((a) => `<option value="${a.id}">${a.name}</option>`).join("");
  const sellerOpts = users.map((u) => `<option value="${u.id}">${u.display_name}</option>`).join("");

  root.appendChild(
    el(`<div class="card"><h1>Nueva venta / cotización</h1>
    <label class="check-row"><input type="checkbox" id="isQuote" ${startAsQuote ? "checked" : ""}/> Solo cotización (aún no es venta)</label>
    <label>Cliente<select id="clientId"><option value="">—</option>${clientOpts}</select></label>
    <label>Producto<input id="product" /></label>
    <div class="grid2">
      <label>Costo (Valor)<input id="cost" type="number" /></label>
      <label>% margen<input id="margin" type="number" step="0.01" value="0.3" /></label>
      <label>Inicial<input id="down" type="number" value="0" /></label>
      <label># Cuotas<input id="count" type="number" value="4" /></label>
      <label>Periodo<select id="period"><option>Mensual</option><option>Quincenal</option><option>Contado</option></select></label>
      <label>Regla fecha cuota<input id="dueRule" placeholder="30 de cada mes" /></label>
    </div>
    <p class="muted" id="preview"></p>
    <label>Cuenta compra<select id="purchaseAcc"><option value="">—</option>${accOpts}</select></label>
    ${state.user.role === "admin" ? `<label>Vendedor<select id="sellerId"><option value="">—</option>${sellerOpts}</select></label>` : ""}
    <label>URL compra<input id="purchaseUrl" /></label>
    <button id="saveSale">Guardar</button>
    <p class="error" id="saleErr"></p></div>`)
  );

  async function refreshPreview() {
    const body = {
      cost_price: Number(root.querySelector("#cost").value || 0),
      margin_rate: Number(root.querySelector("#margin").value || 0),
      down_payment: Number(root.querySelector("#down").value || 0),
      installment_count: Number(root.querySelector("#count").value || 1),
      payment_period: root.querySelector("#period").value,
    };
    const p = await api("/api/pricing/preview", { method: "POST", body: JSON.stringify(body) });
    root.querySelector("#preview").textContent =
      `Ganancia ${money(p.profit)} · Total ${money(p.total_charge)} · A financiar ${money(p.financed_amount)} · Cuota ${money(p.installment_amount)}`;
  }
  root.addEventListener("input", (e) => {
    if (["cost", "margin", "down", "count", "period"].includes(e.target.id)) refreshPreview();
  });
  refreshPreview();

  root.querySelector("#saveSale").onclick = async () => {
    try {
      const p = await api("/api/pricing/preview", {
        method: "POST",
        body: JSON.stringify({
          cost_price: Number(root.querySelector("#cost").value),
          margin_rate: Number(root.querySelector("#margin").value),
          down_payment: Number(root.querySelector("#down").value),
          installment_count: Number(root.querySelector("#count").value),
          payment_period: root.querySelector("#period").value,
        }),
      });
      const payload = {
        client_id: Number(root.querySelector("#clientId").value),
        product_description: root.querySelector("#product").value,
        cost_price: Number(root.querySelector("#cost").value),
        margin_rate: Number(root.querySelector("#margin").value),
        down_payment: Number(root.querySelector("#down").value),
        installment_count: Number(root.querySelector("#count").value),
        payment_period: root.querySelector("#period").value,
        due_rule: root.querySelector("#dueRule").value || null,
        purchase_account_id: root.querySelector("#purchaseAcc").value
          ? Number(root.querySelector("#purchaseAcc").value)
          : null,
        purchase_url: root.querySelector("#purchaseUrl").value || null,
        total_charge: p.total_charge,
        installment_amount: p.installment_amount,
        profit: p.profit,
        record_status: root.querySelector("#isQuote").checked ? "cotizacion" : "venta",
      };
      const sellerEl = root.querySelector("#sellerId");
      if (sellerEl?.value) payload.seller_id = Number(sellerEl.value);
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
    <label>Pegar bloque Cliente<textarea id="raw" rows="4"></textarea></label>
    <button id="parseBtn" class="secondary">Parsear</button>
    <label>Nombre<input id="cName"/></label>
    <label>Teléfono<input id="cPhone"/></label>
    <label>Cédula<input id="cId"/></label>
    <button id="addClient">Agregar</button>
    <table style="margin-top:1rem"><thead><tr><th>Nombre</th><th>Tel</th></tr></thead>
    <tbody>${clients.map((c) => `<tr><td>${c.name}</td><td>${c.phone || ""}</td></tr>`).join("")}</tbody></table></div>`)
  );
  root.querySelector("#parseBtn").onclick = async () => {
    const parsed = await api("/api/clients/parse", {
      method: "POST",
      body: JSON.stringify({ name: "", raw_client_text: root.querySelector("#raw").value }),
    });
    root.querySelector("#cName").value = parsed.name || "";
    root.querySelector("#cPhone").value = parsed.phone || "";
    root.querySelector("#cId").value = parsed.identification || "";
  };
  root.querySelector("#addClient").onclick = async () => {
    await api("/api/clients", {
      method: "POST",
      body: JSON.stringify({
        name: root.querySelector("#cName").value,
        phone: root.querySelector("#cPhone").value,
        identification: root.querySelector("#cId").value,
        raw_client_text: root.querySelector("#raw").value,
      }),
    });
    render();
  };
}

async function viewAccounts(root) {
  const accounts = await api("/api/accounts");
  const adminForm =
    state.user.role === "admin"
      ? `<label>Nombre<input id="accName"/></label>
    <label>Tipo<select id="accType"><option value="both">Ambas</option><option value="purchase">Compra</option><option value="collection">Cobro</option></select></label>
    <button id="addAcc">Agregar</button>`
      : `<p class="muted">Solo admin puede crear cuentas.</p>`;
  root.appendChild(
    el(`<div class="card"><h1>Cuentas</h1>${adminForm}
    <ul>${accounts.map((a) => `<li>${a.name} <span class="muted">(${a.account_type})</span></li>`).join("")}</ul></div>`)
  );
  const addBtn = root.querySelector("#addAcc");
  if (addBtn) {
    addBtn.onclick = async () => {
      await api("/api/accounts", {
        method: "POST",
        body: JSON.stringify({
          name: root.querySelector("#accName").value,
          account_type: root.querySelector("#accType").value,
        }),
      });
      render();
    };
  }
}

async function render() {
  const app = document.getElementById("app");
  app.innerHTML = nav();
  const logout = document.getElementById("logout");
  if (logout) {
    logout.onclick = async (e) => {
      e.preventDefault();
      await api("/api/auth/logout", { method: "POST" });
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
