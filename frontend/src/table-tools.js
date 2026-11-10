import { escAttr } from "./format.js";

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function dataRows(tbody) {
  return [...tbody.querySelectorAll("tr")].filter((tr) => !tr.querySelector("td[colspan]"));
}

function filteredRows(tbody, q) {
  const query = q.trim().toLowerCase();
  return dataRows(tbody).filter((tr) => !query || (tr.textContent?.toLowerCase() ?? "").includes(query));
}

function wireOneDataTable(table, options = {}) {
  const tbody = table.tBodies[0];
  if (!tbody) return;
  if (!dataRows(tbody).length) return;

  const parent = table.closest(".table-scroll")?.parentElement || table.parentElement;
  const searchPlaceholder = options.searchPlaceholder ?? "Buscar en la tabla…";
  let pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  let currentPage = 1;

  const toolbar = document.createElement("div");
  toolbar.className = "table-toolbar";
  toolbar.innerHTML = `<input type="search" class="table-search" placeholder="${escAttr(searchPlaceholder)}" autocomplete="off" aria-label="Buscar"/>`;
  const scroll = table.closest(".table-scroll");
  parent.insertBefore(toolbar, scroll || table);

  const sizeOpts = PAGE_SIZE_OPTIONS.map(
    (n) => `<option value="${n}" ${n === pageSize ? "selected" : ""}>${n}</option>`,
  ).join("");
  const pagination = document.createElement("div");
  pagination.className = "table-pagination";
  pagination.innerHTML = `<span class="table-page-info muted"></span>
    <div class="table-page-actions">
      <button type="button" class="secondary table-page-prev">Anterior</button>
      <span class="table-page-num muted"></span>
      <button type="button" class="secondary table-page-next">Siguiente</button>
    </div>
    <label class="table-page-size muted">Filas <select class="table-page-size-select">${sizeOpts}</select></label>`;
  if (scroll) scroll.insertAdjacentElement("afterend", pagination);
  else table.insertAdjacentElement("afterend", pagination);

  const search = toolbar.querySelector(".table-search");
  const info = pagination.querySelector(".table-page-info");
  const pageNum = pagination.querySelector(".table-page-num");
  const btnPrev = pagination.querySelector(".table-page-prev");
  const btnNext = pagination.querySelector(".table-page-next");
  const sizeSelect = pagination.querySelector(".table-page-size-select");

  const applyView = () => {
    const q = search.value;
    const filtered = filteredRows(tbody, q);
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    currentPage = Math.min(Math.max(1, currentPage), totalPages);

    const start = (currentPage - 1) * pageSize;
    const visible = new Set(filtered.slice(start, start + pageSize));
    for (const tr of dataRows(tbody)) {
      tr.hidden = !visible.has(tr);
    }

    const from = total ? start + 1 : 0;
    const to = Math.min(start + pageSize, total);
    info.textContent = total ? `Mostrando ${from}–${to} de ${total}` : "Sin coincidencias";
    pageNum.textContent = `Página ${currentPage} de ${totalPages}`;
    btnPrev.disabled = currentPage <= 1;
    btnNext.disabled = currentPage >= totalPages;
    pagination.hidden = totalPages <= 1;
  };

  search.addEventListener("input", () => {
    currentPage = 1;
    applyView();
  });

  btnPrev.addEventListener("click", () => {
    currentPage -= 1;
    applyView();
  });
  btnNext.addEventListener("click", () => {
    currentPage += 1;
    applyView();
  });
  sizeSelect.addEventListener("change", () => {
    pageSize = Number(sizeSelect.value) || DEFAULT_PAGE_SIZE;
    currentPage = 1;
    applyView();
  });

  let sortKey = null;
  let sortAsc = true;
  const headers = [...table.querySelectorAll("th[data-sort]")];
  for (const th of headers) {
    th.classList.add("th-sortable");
    const activate = () => {
      const key = th.dataset.sort;
      if (!key) return;
      if (sortKey === key) sortAsc = !sortAsc;
      else {
        sortKey = key;
        sortAsc = true;
      }
      for (const h of headers) {
        h.classList.remove("th-sort-asc", "th-sort-desc");
        h.removeAttribute("aria-sort");
      }
      th.classList.add(sortAsc ? "th-sort-asc" : "th-sort-desc");
      th.setAttribute("aria-sort", sortAsc ? "ascending" : "descending");

      const type = th.dataset.sortType || "text";
      const rows = dataRows(tbody);
      const attr = `data-${key}`;
      rows.sort((a, b) => {
        const av = a.getAttribute(attr) ?? "";
        const bv = b.getAttribute(attr) ?? "";
        const cmp =
          type === "number"
            ? (Number(av) || 0) - (Number(bv) || 0)
            : String(av).localeCompare(String(bv), "es", { sensitivity: "base" });
        return sortAsc ? cmp : -cmp;
      });
      for (const tr of rows) tbody.appendChild(tr);
      currentPage = 1;
      applyView();
    };
    th.addEventListener("click", activate);
    th.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
    });
    th.tabIndex = 0;
    th.setAttribute("role", "button");
  }

  applyView();
}

export function wireDataTable(container, options = {}) {
  if (!container) return;
  for (const table of container.querySelectorAll("table.data-table")) {
    wireOneDataTable(table, options);
  }
}
