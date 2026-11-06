let pending = 0;
let overlay = null;

export function initLoading() {
  if (overlay) return;
  overlay = document.createElement("div");
  overlay.id = "kys-loading";
  overlay.className = "kys-loading";
  overlay.hidden = true;
  overlay.innerHTML =
    '<div class="kys-loading__panel" role="status" aria-live="polite" aria-label="Cargando">' +
    '<div class="kys-spinner" aria-hidden="true"></div>' +
    "<span>Cargando…</span></div>";
  document.body.appendChild(overlay);
}

function syncOverlay() {
  if (!overlay) initLoading();
  const active = pending > 0;
  overlay.hidden = !active;
  overlay.setAttribute("aria-busy", active ? "true" : "false");
  document.body.classList.toggle("kys-busy", active);
}

export function startLoading() {
  pending += 1;
  syncOverlay();
}

export function stopLoading() {
  pending = Math.max(0, pending - 1);
  syncOverlay();
}
