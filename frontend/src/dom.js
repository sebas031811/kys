import { escHtml } from "./format.js";
import { state } from "./app-context.js";

export function rolLabel(rol) {
  if (rol === "admin") return "Administrador";
  if (rol === "seller") return "Vendedor";
  return rol || "—";
}

export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstChild;
}

function navLink(href, label, section) {
  const active = state.navSection === section ? ' class="nav-active"' : "";
  return `<a href="${href}"${active}>${label}</a>`;
}

export function navHtml() {
  const links = state.user
    ? `${navLink("#/dashboard", "Inicio", "dashboard")}
       ${navLink("#/sales", "Ventas", "sales")}
       ${navLink("#/clients", "Clientes", "clients")}
       ${navLink("#/accounts", "Cuentas", "accounts")}
       ${state.user.rol === "admin" ? navLink("#/vendedores", "Vendedores", "vendedores") : ""}
       <a href="#" id="logout">Salir (${escHtml(state.user.nombre_visible)} · ${escHtml(rolLabel(state.user.rol))})</a>`
    : navLink("#/login", "Entrar", "login");
  return `<header class="app-header">
    <div class="app-header__row">
      <div class="app-header__title"><strong>KYS</strong> <span class="muted">ventas · cuotas · clientes</span></div>
      <button type="button" class="theme-toggle secondary" id="theme-toggle" aria-label="Cambiar tema"></button>
    </div>
  </header><nav>${links}</nav>`;
}

export function wireNavLinks(app) {
  app.querySelectorAll("nav a[href^='#']").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const href = a.getAttribute("href");
      if (href) location.hash = href;
    });
  });
}

export function accountBalanceClass(balance) {
  const n = Number(balance) || 0;
  if (n > 0) return "balance-pos";
  if (n < 0) return "balance-neg";
  return "";
}
