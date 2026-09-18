function addMonths_(d, months) {
  var date = d instanceof Date ? d : parseIsoDate_(d);
  var year = date.getFullYear() + Math.floor((date.getMonth() + months) / 12);
  var month = (date.getMonth() + months) % 12;
  if (month < 0) { month += 12; year -= 1; }
  var day = Math.min(date.getDate(), 28);
  return new Date(year, month, day);
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

function nextDueFromRule_(base, sequence, period, dueRule) {
  var rule = String(dueRule || '').toLowerCase().trim();
  var start = parseIsoDate_(base);

  if (rule.indexOf('al entregar') !== -1) return formatIsoDate_(start);

  if (period === 'Quincenal' || rule.indexOf('15 y 30') !== -1) {
    var monthOffset = Math.floor((sequence - 1) / 2);
    var useFifteenth = (sequence - 1) % 2 === 0;
    var monthDate = addMonths_(new Date(start.getFullYear(), start.getMonth(), 1), monthOffset);
    var day = useFifteenth ? 15 : 28;
    return formatIsoDate_(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
  }

  if (rule.indexOf('15 de cada mes') !== -1) {
    var m15 = addMonths_(new Date(start.getFullYear(), start.getMonth(), 1), sequence - 1);
    return formatIsoDate_(new Date(m15.getFullYear(), m15.getMonth(), 15));
  }

  if (period === 'Semanal') {
    var w = new Date(start);
    w.setDate(w.getDate() + (sequence - 1) * 7);
    return formatIsoDate_(w);
  }

  var m = addMonths_(new Date(start.getFullYear(), start.getMonth(), 1), sequence - 1);
  var day30 = 30;
  if (rule.indexOf('30 de cada mes') !== -1 || !rule) day30 = Math.min(30, 28);
  return formatIsoDate_(new Date(m.getFullYear(), m.getMonth(), day30));
}

function buildInstallmentSchedule_(startDate, installmentCount, installmentAmount, paymentPeriod, dueRule) {
  var rows = [];
  for (var seq = 1; seq <= installmentCount; seq++) {
    rows.push({
      sequence: seq,
      amount: installmentAmount,
      due_date: nextDueFromRule_(startDate, seq, paymentPeriod, dueRule),
      status: 'pending',
      amount_paid: 0,
    });
  }
  return rows;
}

function todayIso_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
