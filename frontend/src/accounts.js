import { escHtml } from "./format.js";

/** `/api/accounts` and summary already dedupe by name on the server. */
export function accountOptions(accounts, selectedId) {
  const list = [...accounts].sort((a, b) =>
    String(a.nombre || a.name).localeCompare(String(b.nombre || b.name)),
  );
  return list
    .map(
      (a) =>
        `<option value="${a.id}" ${a.id === selectedId ? "selected" : ""}>${escHtml(a.nombre || a.name || "")}</option>`,
    )
    .join("");
}
