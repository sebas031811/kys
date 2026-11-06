import { SupabaseClient } from "npm:@supabase/supabase-js@2";

function parseClientBlock(text: string, fallbackPhone?: string) {
  const raw = String(text || "").trim();
  if (!raw) return { name: "Sin nombre", raw_client_text: raw, phone: fallbackPhone ?? null, identification: null, email: null, address: null };

  const lines = raw.split("\n").map((ln) => ln.trim()).filter(Boolean);
  let name = lines.length ? lines[0] : raw;
  if (name.length > 120 && !raw.includes("\n")) name = name.substring(0, 120);

  let identification: string | null = null;
  let phone: string | null = fallbackPhone ?? null;
  let email: string | null = null;
  let address: string | null = null;

  const idMatch = raw.match(/(?:c\.?c\.?|cédula|cedula)\s*[:\s]*([\d.\s]+)/i) || raw.match(/\b(\d{7,12})\b/);
  if (idMatch) identification = idMatch[1].replace(/[\s.]/g, "");

  const phoneMatch = raw.match(/(?:celular|tel[eé]fono|phone)?\s*[:\s]*(\d{10})/i) || raw.match(/\b3\d{9}\b/);
  if (phoneMatch) phone = phoneMatch[1] || phoneMatch[0];

  const emailMatch = raw.match(/[\w.+-]+@[\w.-]+\.\w+/);
  if (emailMatch) email = emailMatch[0];

  const addrMatch = raw.match(/(?:direcci[oó]n|address)\s*[:\s]*(.+)/i);
  if (addrMatch) address = addrMatch[1].split("\n")[0].trim();

  return { name, phone, identification, email, address, raw_client_text: raw };
}

export async function listClients(db: SupabaseClient) {
  const { data, error } = await db.from("clientes").select("*").order("nombre").limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: Number(row.id),
    nombre: row.nombre,
    telefono: row.telefono ?? null,
    identificacion: row.identificacion ?? null,
    email: row.email ?? null,
    direccion: row.direccion ?? null,
    texto_cliente: row.texto_cliente ?? null,
    notas: row.notas ?? null,
  }));
}

export async function createClient(db: SupabaseClient, body: Record<string, unknown>) {
  let data = {
    nombre: body.nombre || body.name || "Sin nombre",
    telefono: body.telefono ?? body.phone ?? "",
    identificacion: body.identificacion ?? body.identification ?? "",
    email: body.email ?? "",
    direccion: body.direccion ?? body.address ?? "",
    texto_cliente: body.texto_cliente ?? body.raw_client_text ?? "",
    notas: body.notas ?? body.notes ?? "",
  };
  if (data.texto_cliente && !data.identificacion) {
    const p = parseClientBlock(String(data.texto_cliente), String(data.telefono || ""));
    Object.assign(data, {
      nombre: data.nombre === "Sin nombre" ? p.name : data.nombre,
      telefono: p.phone || data.telefono,
      identificacion: p.identification || data.identificacion,
      email: p.email || data.email,
      direccion: p.address || data.direccion,
    });
  }
  const { data: row, error } = await db.from("clientes").insert(data).select("*").single();
  if (error) throw new Error(error.message);
  return {
    id: Number(row.id),
    nombre: row.nombre,
    telefono: row.telefono ?? null,
    identificacion: row.identificacion ?? null,
    email: row.email ?? null,
    direccion: row.direccion ?? null,
    texto_cliente: row.texto_cliente ?? null,
    notas: row.notas ?? null,
  };
}

export function parseClientRequest(body: Record<string, unknown>) {
  const p = parseClientBlock(String(body.texto_cliente ?? body.raw_client_text ?? body.nombre ?? ""), String(body.telefono ?? body.phone ?? ""));
  return {
    nombre: p.name,
    telefono: p.phone,
    identificacion: p.identification,
    email: p.email,
    direccion: p.address,
    texto_cliente: p.raw_client_text,
    notas: body.notas ?? null,
  };
}
