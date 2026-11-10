import { api } from "../api.js";
import { money, escHtml, tableScroll } from "../format.js";
import { wireDataTable } from "../table-tools.js";
import { state, render } from "../app-context.js";
import { el, rolLabel } from "../dom.js";

export async function viewVendedores(root, focusId) {
  if (state.user.rol !== "admin") {
    root.appendChild(el(`<p class="error">Solo administrador</p>`));
    return;
  }

  const users = await api("/api/auth/users");
  const sellers = users.filter((u) => u.rol === "seller");
  const selectedUser = focusId ? users.find((u) => Number(u.id) === Number(focusId)) : sellers[0];
  const selectedId = selectedUser?.id;
  const selectedIsSeller = selectedUser?.rol === "seller";

  const listRows = users
    .map((u) => {
      const href = u.rol === "seller" ? `#/vendedores/${u.id}` : "#";
      const nameCell =
        u.rol === "seller"
          ? `<a href="${href}">${escHtml(u.nombre_visible)}</a>`
          : escHtml(u.nombre_visible);
      return `<tr class="${selectedId === u.id ? "row-focus" : ""}">
        <td>${nameCell}</td>
        <td>${escHtml(rolLabel(u.rol))}</td>
        <td>${escHtml(u.email)}</td>
        <td>${u.rol === "seller" ? money(u.valor_pagado ?? 0) : "—"}</td>
      </tr>`;
    })
    .join("");

  let detailHtml = `<p class="muted">Selecciona un vendedor (rol Vendedor)</p>`;
  if (selectedId && selectedIsSeller) {
    const data = await api(`/api/vendedores/${selectedId}/comision`);
    const r = data.resumen || {};
    const pagos = (data.pagos || [])
      .map(
        (p) =>
          `<tr><td>${escHtml(p.fecha_pago || "—")}</td><td>${money(p.monto)}</td><td>${escHtml(p.notas || "")}</td></tr>`,
      )
      .join("");
    detailHtml = `<h2>${escHtml(data.vendedor.nombre_visible)}</h2>
      <p class="muted">Rol: ${escHtml(rolLabel(data.vendedor.rol))} · Valor pagado (en perfil): <strong>${money(data.vendedor.valor_pagado ?? 0)}</strong></p>
      <p class="muted">Totales según el % de comisión guardado en cada venta.</p>
      <div class="grid2">
        <div><p class="muted">Ganancia total ventas</p><p>${money(r.ganancia_total_ventas)}</p></div>
        <div><p class="muted">Comisión (ventas completas)</p><p>${money(r.comision_total_ventas)}</p></div>
        <div><p class="muted">Comisión por recaudos</p><p class="text-ok">${money(r.comision_total_recaudo)}</p></div>
        <div><p class="muted">Pagado al vendedor</p><p>${money(r.comision_pagada)}</p></div>
      </div>
      <p class="muted">Pendiente de pago: <strong>${money(r.comision_pendiente_pago)}</strong></p>
      <h3>Registrar pago de comisión</h3>
      <form id="pagoComForm">
        <label>Monto<input name="monto" type="number" required/></label>
        <label>Fecha<input name="fecha_pago" type="date"/></label>
        <label>Notas<input name="notas"/></label>
        <button type="submit">Registrar pago</button>
      </form>
      <h3>Historial de pagos</h3>
      ${tableScroll(`<table class="data-table"><thead><tr><th>Fecha</th><th>Monto</th><th>Notas</th></tr></thead><tbody>${pagos || "<tr><td colspan=3 class=muted>Sin pagos</td></tr>"}</tbody></table>`)}`;
  } else if (selectedId && !selectedIsSeller) {
    detailHtml = `<h2>${escHtml(selectedUser.nombre_visible)}</h2>
      <p class="muted">Rol: <strong>${escHtml(rolLabel(selectedUser.rol))}</strong>. Los administradores no reciben comisión por ventas.</p>`;
  }

  root.appendChild(
    el(`<div class="card"><h1>Usuarios y comisiones</h1>
      <p class="muted">El rol (<code>admin</code> / <code>seller</code> en la tabla <code>usuarios</code>) define quién es administrador y quién vendedor. El valor pagado se guarda en <code>usuarios.comision_pagada</code> y sube con cada pago registrado.</p>
      <div class="grid2">
        <div>${tableScroll(`<table class="data-table"><thead><tr><th>Nombre</th><th>Rol</th><th>Email</th><th>Valor pagado</th></tr></thead><tbody>${listRows || "<tr><td colspan=4 class=muted>Sin usuarios</td></tr>"}</tbody></table>`)}</div>
        <div class="card" id="vendedor-detail">${detailHtml}</div>
      </div></div>`),
  );

  wireDataTable(root, { searchPlaceholder: "Buscar…" });

  const pagoForm = root.querySelector("#pagoComForm");
  if (pagoForm && selectedId) {
    pagoForm.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(pagoForm);
      try {
        await api(`/api/vendedores/${selectedId}/pagos-comision`, {
          method: "POST",
          body: JSON.stringify({
            monto: Number(fd.get("monto")),
            fecha_pago: fd.get("fecha_pago") || undefined,
            notas: fd.get("notas") || undefined,
          }),
        });
        render();
      } catch (err) {
        alert(err.message);
      }
    };
  }
}
