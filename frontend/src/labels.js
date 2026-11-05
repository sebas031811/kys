export const PERIODOS = ["Mensual", "Quincenal", "Semanal", "Contado"];

export function periodOptions(current) {
  const p = current || "Mensual";
  return PERIODOS.map((o) => `<option ${p === o ? "selected" : ""}>${o}</option>`).join("");
}
