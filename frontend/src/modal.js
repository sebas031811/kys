import { escHtml } from "./format.js";

let modalBackdrop = null;
let escHandler = null;

export function closeModal() {
  if (escHandler) {
    document.removeEventListener("keydown", escHandler);
    escHandler = null;
  }
  if (modalBackdrop) {
    modalBackdrop.remove();
    modalBackdrop = null;
  }
  document.body.classList.remove("kys-modal-open");
}

/** @returns {HTMLElement} backdrop (query `.kys-modal__body` inside) */
export function openModal(title, bodyHtml) {
  closeModal();
  modalBackdrop = document.createElement("div");
  modalBackdrop.className = "kys-modal-backdrop";
  modalBackdrop.innerHTML = `<div class="kys-modal" role="dialog" aria-modal="true" aria-labelledby="kys-modal-title">
    <header class="kys-modal__head">
      <h2 id="kys-modal-title">${escHtml(title)}</h2>
      <button type="button" class="kys-modal__close" aria-label="Cerrar">×</button>
    </header>
    <div class="kys-modal__body">${bodyHtml}</div>
  </div>`;
  document.body.appendChild(modalBackdrop);
  document.body.classList.add("kys-modal-open");

  modalBackdrop.querySelector(".kys-modal__close").onclick = closeModal;
  modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) closeModal();
  });
  escHandler = (e) => {
    if (e.key === "Escape") closeModal();
  };
  document.addEventListener("keydown", escHandler);

  return modalBackdrop;
}

export function modalBody() {
  return modalBackdrop?.querySelector(".kys-modal__body") ?? null;
}
