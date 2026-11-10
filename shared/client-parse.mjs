export function parseClientBlock(text, fallbackPhone) {
  const raw = String(text || "").trim();
  if (!raw) {
    return {
      name: "Sin nombre",
      raw_client_text: raw,
      phone: fallbackPhone ?? null,
      identification: null,
      email: null,
      address: null,
    };
  }

  const lines = raw.split("\n").map((ln) => ln.trim()).filter(Boolean);
  let name = lines.length ? lines[0] : raw;
  if (name.length > 120 && !raw.includes("\n")) name = name.substring(0, 120);

  let identification = null;
  let phone = fallbackPhone ?? null;
  let email = null;
  let address = null;

  const idMatch =
    raw.match(/(?:c\.?c\.?|cédula|cedula)\s*[:\s]*([\d.\s]+)/i) || raw.match(/\b(\d{7,12})\b/);
  if (idMatch) identification = idMatch[1].replace(/[\s.]/g, "");

  const phoneMatch =
    raw.match(/(?:celular|tel[eé]fono|phone)?\s*[:\s]*(\d{10})/i) || raw.match(/\b3\d{9}\b/);
  if (phoneMatch) phone = phoneMatch[1] || phoneMatch[0];

  const emailMatch = raw.match(/[\w.+-]+@[\w.-]+\.\w+/);
  if (emailMatch) email = emailMatch[0];

  const addrMatch = raw.match(/(?:direcci[oó]n|address)\s*[:\s]*(.+)/i);
  if (addrMatch) address = addrMatch[1].split("\n")[0].trim();

  return { name, phone, identification, email, address, raw_client_text: raw };
}
