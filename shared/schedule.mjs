function parseIsoDate(s) {
  if (!s) return new Date();
  const parts = String(s).split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function formatIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayInMonth(year, monthIndex, dayNum) {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(dayNum, last));
}

function addMonthsAnchor(year, monthIndex, months) {
  let y = year + Math.floor((monthIndex + months) / 12);
  let m = (monthIndex + months) % 12;
  if (m < 0) {
    m += 12;
    y -= 1;
  }
  return { year: y, month: m };
}

/** Nth calendar due date from anchor month (sequence 1 = first anchor from `base` month). */
export function nextDueFromRule(base, sequence, period, dueRule) {
  const rule = String(dueRule || "").toLowerCase().trim();
  const start = parseIsoDate(base);
  const baseYear = start.getFullYear();
  const baseMonth = start.getMonth();

  if (rule.includes("al entregar")) return formatIsoDate(start);

  if (period === "Quincenal" || rule.includes("15 y 30")) {
    const monthOffset = Math.floor((sequence - 1) / 2);
    const useFifteenth = ((sequence - 1) % 2 + 2) % 2 === 0;
    const { year, month } = addMonthsAnchor(baseYear, baseMonth, monthOffset);
    const dayNum = useFifteenth ? 15 : 30;
    return formatIsoDate(dayInMonth(year, month, dayNum));
  }

  if (rule.includes("15 de cada mes") || rule === "15") {
    const { year, month } = addMonthsAnchor(baseYear, baseMonth, sequence - 1);
    return formatIsoDate(dayInMonth(year, month, 15));
  }

  if (period === "Semanal") {
    const w = new Date(start);
    w.setDate(w.getDate() + (sequence - 1) * 7);
    return formatIsoDate(w);
  }

  if (sequence < 1) {
    const { year, month } = addMonthsAnchor(baseYear, baseMonth, sequence - 1);
    if (rule.includes("15 de cada mes") || rule === "15") {
      return formatIsoDate(dayInMonth(year, month, 15));
    }
    return formatIsoDate(dayInMonth(year, month, 30));
  }

  const { year, month } = addMonthsAnchor(baseYear, baseMonth, sequence - 1);
  return formatIsoDate(dayInMonth(year, month, 30));
}

function absDayDiff(isoA, isoB) {
  return Math.abs(parseIsoDate(isoA).getTime() - parseIsoDate(isoB).getTime()) / 86400000;
}

function pickCloserSequence(start, seqA, dueA, seqB, dueB) {
  const dA = absDayDiff(dueA, start);
  const dB = absDayDiff(dueB, start);
  if (dA !== dB) return dA < dB ? seqA : seqB;
  if (dueA <= start && dueB > start) return seqA;
  if (dueB <= start && dueA > start) return seqB;
  if (dueA <= start && dueB <= start) return dueA > dueB ? seqA : seqB;
  return dueA < dueB ? seqA : seqB;
}

export function closestSequenceToStart(startDate, paymentPeriod, dueRule) {
  const start = String(startDate).slice(0, 10);
  const rule = String(dueRule || "").toLowerCase();
  const period = paymentPeriod || "Mensual";
  if (rule.includes("al entregar") || period === "Semanal") return 1;

  let bestSeq = 1;
  let bestDue = nextDueFromRule(start, 1, period, dueRule);
  for (let seq = -12; seq <= 48; seq++) {
    if (seq === 0) continue;
    const due = nextDueFromRule(start, seq, period, dueRule);
    const picked = pickCloserSequence(start, seq, due, bestSeq, bestDue);
    if (picked !== bestSeq) {
      bestSeq = picked;
      bestDue = due;
    }
  }
  return bestSeq;
}

export function buildInstallmentSchedule(
  startDate,
  installmentCount,
  installmentAmount,
  paymentPeriod,
  dueRule,
  firstSequence,
) {
  const start = String(startDate).slice(0, 10);
  const firstSeq = firstSequence ?? closestSequenceToStart(start, paymentPeriod, dueRule);
  const rows = [];
  for (let i = 0; i < installmentCount; i++) {
    const seq = firstSeq + i;
    rows.push({
      sequence: i + 1,
      amount: installmentAmount,
      due_date: nextDueFromRule(start, seq, paymentPeriod, dueRule),
    });
  }
  return rows;
}

/** Due-date anchor: delivery date when set, else today. */
export function scheduleAnchorDate(sale) {
  const entrega = sale.fecha_entrega;
  if (entrega) return String(entrega).slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

export function rebuildInstallmentRows(sale) {
  const start = scheduleAnchorDate(sale);
  const period = String(sale.periodo_pago || "Mensual");
  const dueRule = sale.fecha_cuota != null ? String(sale.fecha_cuota) : null;
  const firstSeq = closestSequenceToStart(start, period, dueRule);
  const firstDue = nextDueFromRule(start, firstSeq, period, dueRule);
  const rows = [];

  const inicial = Number(sale.inicial) || 0;
  if (inicial > 0) {
    rows.push({
      numero_cuota: 0,
      monto: inicial,
      fecha_vencimiento: firstDue,
      estado: "pendiente",
      monto_pagado: 0,
      fecha_pago: null,
    });
  }

  const n = Number(sale.num_cuotas) || 1;
  const cuota = Number(sale.cuota) || 0;
  const scheduleFromSeq = inicial > 0 ? firstSeq + 1 : firstSeq;
  const schedule = buildInstallmentSchedule(start, n, cuota, period, dueRule, scheduleFromSeq);
  for (const s of schedule) {
    rows.push({
      numero_cuota: s.sequence,
      monto: s.amount,
      fecha_vencimiento: s.due_date,
      estado: "pendiente",
      monto_pagado: 0,
      fecha_pago: null,
    });
  }
  return rows;
}
