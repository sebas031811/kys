import { startLoading, stopLoading } from "./loading.js";

const SUPABASE_URL = (
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_NEXT_PUBLIC_SUPABASE_URL
)?.replace(/\/$/, "");
const SUPABASE_ANON =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_FN = import.meta.env.VITE_SUPABASE_FUNCTION || "kys-api";

function useSupabase() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON);
}

async function dispatchSupabase(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  let body = null;
  if (options.body) {
    body = typeof options.body === "string" ? JSON.parse(options.body) : options.body;
  }
  const token = sessionStorage.getItem("kys_token") || "";

  const res = await fetch(`${SUPABASE_URL}/functions/v1/${SUPABASE_FN}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON}`,
    },
    body: JSON.stringify({ method, path, body, token }),
  });

  let payload;
  try {
    payload = await res.json();
  } catch {
    throw new Error(`API error (${res.status})`);
  }

  if (payload?.error) {
    const status = payload.status ?? res.status;
    if (status === 401 && !path.includes("/auth/login")) {
      sessionStorage.removeItem("kys_token");
      window.location.hash = "#/login";
    }
    throw new Error(payload.error);
  }

  if (!res.ok && !payload?.data) {
    throw new Error(payload?.error || `API error (${res.status})`);
  }

  const data = payload.data;
  if (data?.token) {
    sessionStorage.setItem("kys_token", data.token);
  }
  return data;
}

async function dispatchGas(path, options = {}) {
  if (typeof google === "undefined" || !google.script?.run) {
    throw new Error(
      "Configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY (o VITE_SUPABASE_ANON_KEY) en Cloudflare Pages, o abre KYS desde la app web de Google Apps Script.",
    );
  }

  const token = sessionStorage.getItem("kys_token") || "";
  const method = (options.method || "GET").toUpperCase();
  let body = null;
  if (options.body) {
    body = typeof options.body === "string" ? JSON.parse(options.body) : options.body;
  }

  const payload = await new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler(resolve)
      .withFailureHandler((err) => reject(new Error(err.message || String(err))))
      .apiDispatch({ method, path, body, token });
  });

  if (payload?.error) {
    if (payload.status === 401 && !path.includes("/auth/login")) {
      sessionStorage.removeItem("kys_token");
      window.location.hash = "#/login";
    }
    throw new Error(payload.error);
  }

  const data = payload.data;
  if (data?.token) {
    sessionStorage.setItem("kys_token", data.token);
  }
  return data;
}

export async function api(path, options = {}) {
  startLoading();
  try {
    return useSupabase() ? await dispatchSupabase(path, options) : await dispatchGas(path, options);
  } finally {
    stopLoading();
  }
}

export function clearSession() {
  sessionStorage.removeItem("kys_token");
}

export function apiBackend() {
  return useSupabase() ? "supabase" : "gas";
}
