import { api, clearSession } from "./api.js";
import { closeModal } from "./modal.js";
import { escHtml } from "./format.js";
import { state, loadUser, setRender } from "./app-context.js";
import { el, navHtml, wireNavLinks } from "./dom.js";
import { viewLogin } from "./views/login.js";
import { viewDashboard } from "./views/dashboard.js";
import { viewSales, viewSaleDetail, viewNewSale } from "./views/sales.js";
import { viewClients } from "./views/clients.js";
import { viewAccounts } from "./views/accounts-page.js";
import { viewVendedores } from "./views/vendedores.js";

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
              : route === "vendedores"
                ? "vendedores"
                : "dashboard";

  closeModal();
  const app = document.getElementById("app");
  app.innerHTML = navHtml();
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
    } else if (route === "sales" && param) await viewSaleDetail(root, param);
    else if (route === "clients") await viewClients(root);
    else if (route === "accounts") await viewAccounts(root, param);
    else if (route === "vendedores") await viewVendedores(root, param);
    else await viewDashboard(root);
  } catch (e) {
    root.appendChild(el(`<p class="error">${escHtml(e.message)}</p>`));
  }
  app.appendChild(root);
}

setRender(render);

export function startApp() {
  window.addEventListener("hashchange", render);
  loadUser().then(render);
}
