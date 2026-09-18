function parseClientBlock_(text, fallbackPhone) {
  var raw = String(text || '').trim();
  if (!raw) return { name: 'Sin nombre', raw_client_text: raw };

  var lines = raw.split('\n').map(function (ln) { return ln.trim(); }).filter(Boolean);
  var name = lines.length ? lines[0] : raw;
  if (name.length > 120 && raw.indexOf('\n') === -1) name = name.substring(0, 120);

  var identification = null;
  var phone = fallbackPhone || null;
  var email = null;
  var address = null;

  var idMatch = raw.match(/(?:c\.?c\.?|cédula|cedula)\s*[:\s]*([\d.\s]+)/i) || raw.match(/\b(\d{7,12})\b/);
  if (idMatch) identification = idMatch[1].replace(/[\s.]/g, '');

  var phoneMatch = raw.match(/(?:celular|tel[eé]fono|phone)?\s*[:\s]*(\d{10})/i) || raw.match(/\b3\d{9}\b/);
  if (phoneMatch) phone = phoneMatch[1] || phoneMatch[0];

  var emailMatch = raw.match(/[\w.+-]+@[\w.-]+\.\w+/);
  if (emailMatch) email = emailMatch[0];

  var addrMatch = raw.match(/(?:direcci[oó]n|address)\s*[:\s]*(.+)/i);
  if (addrMatch) address = addrMatch[1].split('\n')[0].trim();

  return {
    name: name,
    phone: phone,
    identification: identification,
    email: email,
    address: address,
    raw_client_text: raw,
  };
}
