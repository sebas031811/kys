import { api } from "../api.js";
import { invalidateCuentas } from "../cache.js";
import { money, escHtml, tableScroll } from "../format.js";
import { openModal, closeModal, modalBody } from "../modal.js";
import { wireDataTable } from "../table-tools.js";
import { state, render } from "../app-context.js";
import { el, accountBalanceClass } from "../dom.js";

function accountTypeLabel(t) {
  if (t === "purchase") return "Compra";
  if (t === "collection") return "Cobro";
  return "Ambas";
}

export async function viewAccounts(root, focusAccountId) {
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
    </tr>`,
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
    ${tableScroll(`<table class="data-table table-spaced"><thead><tr>
      <th>Cuenta</th><th>Tipo</th><th>Comprado</th><th>Recibido</th><th>Saldo inicial</th><th>Balance</th><th></th>${isAdmin ? "<th></th>" : ""}
    </tr></thead><tbody>${balanceRows || `<tr><td colspan=${isAdmin ? 8 : 7} class=muted>Sin cuentas</td></tr>`}</tbody></table>`)}</div>
    <div class="card"><h2>${focusAcc ? `Movimientos — ${escHtml(focusAcc.nombre || focusAcc.name)}` : "Movimientos"}</h2>
    ${tableScroll(`<table class="data-table"><thead><tr><th>Fecha</th><th>Cuenta</th><th>Tipo</th><th>Valor</th><th>Ref</th><th>Detalle</th></tr></thead>
    <tbody>${movementRows || "<tr><td colspan=6 class=muted>Sin movimientos (asigna cuenta en ventas y cobros)</td></tr>"}</tbody></table>`)}</div></div>`),
  );

  wireDataTable(root, { searchPlaceholder: "Buscar…" });

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
