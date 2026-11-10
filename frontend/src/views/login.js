import { api } from "../api.js";
import { render, loadUser } from "../app-context.js";
import { el } from "../dom.js";

const isProd = import.meta.env.PROD;

export async function viewLogin(root) {
  const devHint = isProd
    ? ""
    : `<p class="muted">Modo dev: sin VITE_SUPABASE_* se usará config.json si existe.</p>`;
  root.appendChild(
    el(`<div class="card"><h1>Ingresar</h1>
    ${devHint}
    <label>Email<input type="email" id="email" autocomplete="username"/></label>
    <label>Contraseña<input type="password" id="password" autocomplete="current-password"/></label>
    <button id="loginBtn">Entrar</button>
    <p class="error" id="err"></p></div>`),
  );
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
