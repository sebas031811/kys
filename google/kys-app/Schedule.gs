function addMonths_(year, monthIndex, months) {
  var y = year + Math.floor((monthIndex + months) / 12);
  var m = (monthIndex + months) % 12;
  if (m < 0) { m += 12; y -= 1; }
  return { year: y, month: m };
}

function dayInMonth_(year, monthIndex, dayNum) {
  var last = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(dayNum, last));
}

function parseIsoDate_(s) {
  if (!s) return new Date();
  if (s instanceof Date) return s;
  var parts = String(s).split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function formatIsoDate_(d) {
  if (!d) return '';
  if (!(d instanceof Date)) return String(d);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function scheduleAnchorDate_(sale) {
  var entrega = sale.fecha_entrega || sale.delivered_at;
  if (entrega) return String(entrega).slice(0, 10);
  return todayIso_();
}

function nextDueFromRule_(base, sequence, period, dueRule) {
  var rule = String(dueRule || '').toLowerCase().trim();
  var start = parseIsoDate_(base);
  var baseYear = start.getFullYear();
  var baseMonth = start.getMonth();

  if (rule.indexOf('al entregar') !== -1) return formatIsoDate_(start);

  if (period === 'Quincenal' || rule.indexOf('15 y 30') !== -1) {
    var monthOffset = Math.floor((sequence - 1) / 2);
    var useFifteenth = ((sequence - 1) % 2 + 2) % 2 === 0;
    var ym = addMonths_(baseYear, baseMonth, monthOffset);
    var dayNum = useFifteenth ? 15 : 30;
    return formatIsoDate_(dayInMonth_(ym.year, ym.month, dayNum));
  }

  if (rule.indexOf('15 de cada mes') !== -1 || rule === '15') {
    var ym15 = addMonths_(baseYear, baseMonth, sequence - 1);
    return formatIsoDate_(dayInMonth_(ym15.year, ym15.month, 15));
  }

  if (period === 'Semanal') {
    var w = new Date(start);
    w.setDate(w.getDate() + (sequence - 1) * 7);
    return formatIsoDate_(w);
  }

  if (sequence < 1) {
    var ymBack = addMonths_(baseYear, baseMonth, sequence - 1);
    if (rule.indexOf('15 de cada mes') !== -1 || rule === '15') {
      return formatIsoDate_(dayInMonth_(ymBack.year, ymBack.month, 15));
    }
    return formatIsoDate_(dayInMonth_(ymBack.year, ymBack.month, 30));
  }

  var ym30 = addMonths_(baseYear, baseMonth, sequence - 1);
  return formatIsoDate_(dayInMonth_(ym30.year, ym30.month, 30));
}

function absDayDiff_(isoA, isoB) {
  return Math.abs(parseIsoDate_(isoA).getTime() - parseIsoDate_(isoB).getTime()) / 86400000;
}

function pickCloserSequence_(start, seqA, dueA, seqB, dueB) {
  var dA = absDayDiff_(dueA, start);
  var dB = absDayDiff_(dueB, start);
  if (dA !== dB) return dA < dB ? seqA : seqB;
  if (dueA <= start && dueB > start) return seqA;
  if (dueB <= start && dueA > start) return seqB;
  if (dueA <= start && dueB <= start) return dueA > dueB ? seqA : seqB;
  return dueA < dueB ? seqA : seqB;
}

function closestSequenceToStart_(startDate, paymentPeriod, dueRule) {
  var start = String(startDate || '').slice(0, 10);
  var rule = String(dueRule || '').toLowerCase();
  var period = paymentPeriod || 'Mensual';
  if (rule.indexOf('al entregar') !== -1 || period === 'Semanal') return 1;

  var bestSeq = 1;
  var bestDue = nextDueFromRule_(start, 1, period, dueRule);
  for (var seq = -12; seq <= 48; seq++) {
    if (seq === 0) continue;
    var due = nextDueFromRule_(start, seq, period, dueRule);
    var picked = pickCloserSequence_(start, seq, due, bestSeq, bestDue);
    if (picked !== bestSeq) {
      bestSeq = picked;
      bestDue = due;
    }
  }
  return bestSeq;
}

function buildInstallmentSchedule_(startDate, installmentCount, installmentAmount, paymentPeriod, dueRule, firstSequence) {
  var start = String(startDate || '').slice(0, 10);
  var firstSeq = firstSequence != null ? firstSequence : closestSequenceToStart_(start, paymentPeriod, dueRule);
  var rows = [];
  for (var i = 0; i < installmentCount; i++) {
    var seq = firstSeq + i;
    rows.push({
      sequence: i + 1,
      amount: installmentAmount,
      due_date: nextDueFromRule_(start, seq, paymentPeriod, dueRule),
      status: 'pending',
      amount_paid: 0,
    });
  }
  return rows;
}

function todayIso_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
