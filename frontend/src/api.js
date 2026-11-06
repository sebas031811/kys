import { startLoading, stopLoading } from "./loading.js";

let resolvedConfig = null;
let configPromise = null;

function configFromEnv() {
  const supabaseUrl = (
    import.meta.env.VITE_SUPABASE_URL ||
    import.meta.env.VITE_NEXT_PUBLIC_SUPABASE_URL
  )?.replace(/\/$/, "");
  const supabaseKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const functionName = import.meta.env.VITE_SUPABASE_FUNCTION || "kys-api";
  if (!supabaseUrl || !supabaseKey) return null;
  return { supabaseUrl, supabaseKey, functionName };
}

async function loadConfig() {
  if (resolvedConfig) return resolvedConfig;
  const fromEnv = configFromEnv();
  if (fromEnv) {
    resolvedConfig = fromEnv;
    return resolvedConfig;
  }
  if (!configPromise) {
    configPromise = fetch(`${import.meta.env.BASE_URL}config.json`)
      .then((res) => (res.ok ? res.json() : {}))
      .then((file) => {
        const supabaseUrl = String(file.supabaseUrl || "").replace(/\/$/, "");
        const supabaseKey = String(file.supabaseKey || "");
        const functionName = file.functionName || "kys-api";
        if (supabaseUrl && supabaseKey) {
          resolvedConfig = { supabaseUrl, supabaseKey, functionName };
        }
        return resolvedConfig;
      })
      .catch(() => null);
  }
  return configPromise;
}

async function useSupabase() {
  const cfg = await loadConfig();
  return Boolean(cfg);
}

async function dispatchSupabase(path, options = {}, cfg) {
  const method = (options.method || "GET").toUpperCase();
  let body = null;
  if (options.body) {
    body = typeof options.body === "string" ? JSON.parse(options.body) : options.body;
  }
  const token = sessionStorage.getItem("kys_token") || "";

  const res = await fetch(`${cfg.supabaseUrl}/functions/v1/${cfg.functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.supabaseKey}`,
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
      "Configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en Cloudflare Pages (Production) y redeploy, o abre KYS desde Google Apps Script.",
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
    const cfg = await loadConfig();
    return cfg ? await dispatchSupabase(path, options, cfg) : await dispatchGas(path, options);
  } finally {
    stopLoading();
  }
}

export function clearSession() {
  sessionStorage.removeItem("kys_token");
}

export async function apiBackend() {
  return (await useSupabase()) ? "supabase" : "gas";
}
