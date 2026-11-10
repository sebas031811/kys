import { computeSalePricing } from "./pricing.js";
import { pricingSummaryText } from "./format.js";

const PRICING_INPUT_IDS = ["valor", "porcentaje", "inicial", "numCuotas", "periodoPago"];

export function readSalePricingPayload(root) {
  return {
    valor: Number(root.querySelector("#valor")?.value || 0),
    porcentaje: Number(root.querySelector("#porcentaje")?.value || 0),
    inicial: Number(root.querySelector("#inicial")?.value || 0),
    num_cuotas: Number(root.querySelector("#numCuotas")?.value || 1),
    periodo_pago: root.querySelector("#periodoPago")?.value || "Mensual",
  };
}

/** Live pricing preview for new-sale and edit-sale forms. */
export function wireSalePricingPreview(root) {
  const update = () => {
    const p = computeSalePricing(readSalePricingPayload(root));
    const el = root.querySelector("#preview");
    if (el) el.textContent = pricingSummaryText(p);
    return p;
  };
  root.addEventListener("input", (e) => {
    if (PRICING_INPUT_IDS.includes(e.target.id)) update();
  });
  update();
  return update;
}
