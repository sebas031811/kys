import { api } from "../api.js";
import { render, loadUser, state } from "../app-context.js";
import { applyThemeFromUser } from "../theme.js";
import { el } from "../dom.js";

export async function viewLogin(root) {
  root.appendChild(
    el(`<div class="card"><h1>Ingresar</h1>
    <label>Email<input type="email" id="email" name="email" value="" autocapitalize="off" spellcheck="false"/></label>
    <label>Contraseña<input type="password" id="password" name="password" value="" autocomplete="new-password"/></label>
    <button type="button" id="loginBtn">Entrar</button>
    <p class="error" id="err"></p></div>`),
  );
  root.querySelector("#loginBtn").onclick = async () => {
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: root.querySelector("#email").value.trim(),
          password: root.querySelector("#password").value,
        }),
      });
      await loadUser();
      applyThemeFromUser(state.user);
      location.hash = "#/dashboard";
      render();
    } catch (e) {
      root.querySelector("#err").textContent = e.message;
    }
  };
}
