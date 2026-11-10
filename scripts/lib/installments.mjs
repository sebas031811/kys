import { num } from "./coerce.mjs";

function resetInstallments(installments) {
  installments.forEach((inst) => {
    inst.monto_pagado = 0;
    inst.estado = "pendiente";
    inst.fecha_pago = null;
  });
}

function applyOnePaymentAmount(installments, amount, payDate) {
  let remaining = Math.max(num(amount), 0);
  const sorted = [...installments].sort((a, b) => a.numero_cuota - b.numero_cuota);
  for (const inst of sorted) {
    if (remaining <= 0) break;
    const due = num(inst.monto) - num(inst.monto_pagado);
    if (due <= 0) continue;
    const applied = Math.min(remaining, due);
    if (applied <= 0) continue;
    inst.monto_pagado = num(inst.monto_pagado) + applied;
    remaining -= applied;
    if (payDate) inst.fecha_pago = payDate;
    if (inst.monto_pagado >= inst.monto - 0.01) {
      inst.estado = "pagada";
      inst.monto_pagado = inst.monto;
    } else if (inst.monto_pagado > 0) {
      inst.estado = "parcial";
    }
  }
}

export function applyPaymentsToSchedule(installments, pagos) {
  resetInstallments(installments);
  const sortedPagos = [...pagos].sort((a, b) => {
    const fa = String(a.fecha_pago ?? "");
    const fb = String(b.fecha_pago ?? "");
    if (fa !== fb) return fa.localeCompare(fb);
    return 0;
  });
  for (const p of sortedPagos) {
    applyOnePaymentAmount(installments, p.monto, p.fecha_pago ? String(p.fecha_pago) : "");
  }
  const valor_abonado =
    Math.round(installments.reduce((s, i) => s + num(i.monto_pagado), 0) * 100) / 100;
  return { installments, valor_abonado };
}

export function countPaidInstallments(installments) {
  return installments.filter((i) => i.estado === "pagada" && i.numero_cuota > 0).length;
}
