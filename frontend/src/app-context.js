import { api } from "./api.js";

export const state = {
  user: null,
  navSection: "dashboard",
  salesFilter: "",
  salesVenceHasta: "",
};

let renderImpl = async () => {};

export function setRender(fn) {
  renderImpl = fn;
}

export function render() {
  return renderImpl();
}

export async function loadUser() {
  try {
    state.user = await api("/api/auth/me");
  } catch {
    state.user = null;
  }
}
