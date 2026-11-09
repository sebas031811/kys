import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const SALT = Deno.env.get("KYS_PWD_SALT") ?? "kys-change-salt-in-production";

async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password + SALT);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

export function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

export function userOut(row: Record<string, unknown>) {
  const rol = String(row.rol ?? "seller");
  return {
    id: Number(row.id),
    email: row.email,
    nombre_visible: row.nombre_visible,
    rol,
    es_admin: rol === "admin",
    es_vendedor: rol === "seller",
    activo: row.activo !== false,
    valor_pagado: row.comision_pagada != null ? Number(row.comision_pagada) : 0,
  };
}

export async function authLogin(db: SupabaseClient, email: string, password: string) {
  const { data: rows, error } = await db.from("usuarios").select("*").ilike("email", email).limit(1);
  if (error) throw new Error(error.message);
  const user = rows?.[0];
  if (!user || user.activo === false) throw new Error("Credenciales inválidas");
  const hash = await hashPassword(password);
  if (user.password_hash !== hash) throw new Error("Credenciales inválidas");

  const { data: sess, error: se } = await db
    .from("sesiones")
    .insert({ usuario_id: user.id })
    .select("token")
    .single();
  if (se) throw new Error(se.message);
  return { token: sess.token, user: userOut(user) };
}

export async function authMe(db: SupabaseClient, token: string) {
  if (!token) throw new Error("No autenticado");
  const { data: sess, error } = await db
    .from("sesiones")
    .select("usuario_id, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (error || !sess) throw new Error("No autenticado");
  if (new Date(sess.expires_at) < new Date()) throw new Error("No autenticado");

  const { data: user, error: ue } = await db.from("usuarios").select("*").eq("id", sess.usuario_id).single();
  if (ue || !user) throw new Error("No autenticado");
  return userOut(user);
}

export async function destroySession(db: SupabaseClient, token: string) {
  if (token) await db.from("sesiones").delete().eq("token", token);
  return { message: "Sesión cerrada" };
}

export async function requireUser(db: SupabaseClient, token: string) {
  return authMe(db, token);
}
