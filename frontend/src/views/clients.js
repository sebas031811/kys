import { api } from "../api.js";
import { getClientes, invalidateClientes } from "../cache.js";
import { escHtml, tableScroll } from "../format.js";
import { openModal, closeModal, modalBody } from "../modal.js";
import { wireDataTable } from "../table-tools.js";
import { render } from "../app-context.js";
import { el } from "../dom.js";

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

export async function viewClients(root) {
  const clients = await getClientes(api);
  root.appendChild(
    el(`<div class="card"><div class="card-head"><h1>Clientes</h1><button type="button" id="openClientModal">Agregar cliente</button></div>
    ${tableScroll(`<table class="data-table"><thead><tr><th>Nombre</th><th>Teléfono</th><th>Email</th><th>Dirección</th></tr></thead>
    <tbody>${clients
      .map(
        (c) =>
          `<tr><td>${escHtml(c.nombre)}</td><td>${escHtml(c.telefono || "")}</td><td>${escHtml(c.email || "")}</td><td>${escHtml(c.direccion || "")}</td></tr>`,
      )
      .join("") || `<tr><td colspan="4" class="muted">Sin clientes</td></tr>`}</tbody></table>`)}</div>`),
  );
  wireDataTable(root.querySelector(".card"), { searchPlaceholder: "Buscar cliente…" });
  root.querySelector("#openClientModal").onclick = () => {
    openModal("Agregar cliente", clientFormHtml());
    wireClientForm(modalBody());
  };
}
