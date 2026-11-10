export {
  num,
  computeSalePricing,
  normalizePercentRate,
} from "../../../../shared/pricing.mjs";

/** Pricing drivers only — omits persisted total/cuota so edits recalculate correctly. */
export function ventaPricingInput(
  row: Record<string, unknown>,
  body: Record<string, unknown> = {},
): Record<string, unknown> {
  const pick = (k: string) => (body[k] !== undefined ? body[k] : row[k]);
  const input: Record<string, unknown> = {
    valor: pick("valor"),
    porcentaje: pick("porcentaje"),
    inicial: pick("inicial"),
    num_cuotas: pick("num_cuotas"),
    periodo_pago: pick("periodo_pago"),
  };
  if (body.total !== undefined) input.total = body.total;
  if (body.cuota !== undefined) input.cuota = body.cuota;
  return input;
}
