import { api } from "./api.js";
import { state } from "./app-context.js";

const STORAGE_KEY = "kys_theme";

export function normalizeTheme(value) {
  return value === "light" ? "light" : "dark";
}

export function getAppliedTheme() {
  const attr = document.documentElement.getAttribute("data-theme");
  return normalizeTheme(attr);
}

export function applyTheme(theme) {
  const t = normalizeTheme(theme);
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem(STORAGE_KEY, t);
  syncThemeToggleLabel();
}

export function applyThemeFromUser(user) {
  if (user?.tema) {
    applyTheme(user.tema);
    return;
  }
  const cached = localStorage.getItem(STORAGE_KEY);
  if (cached) applyTheme(cached);
  else applyTheme("dark");
}

export function themeToggleLabel(theme) {
  return theme === "light" ? "Modo oscuro" : "Modo claro";
}

function syncThemeToggleLabel() {
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.textContent = themeToggleLabel(getAppliedTheme());
}

export async function toggleTheme() {
  const current = getAppliedTheme();
  const next = current === "light" ? "dark" : "light";
  applyTheme(next);
  if (!state.user) return;
  try {
    state.user = await api("/api/auth/me", {
      method: "PATCH",
      body: JSON.stringify({ tema: next }),
    });
  } catch (e) {
    applyTheme(current);
    throw e;
  }
}

export function wireThemeToggle(root = document) {
  const btn = root.querySelector("#theme-toggle");
  if (!btn) return;
  syncThemeToggleLabel();
  btn.onclick = async () => {
    try {
      await toggleTheme();
    } catch (e) {
      alert(e.message || String(e));
    }
  };
}
