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

function requestBody(options) {
  if (!options.body) return null;
  return typeof options.body === "string" ? JSON.parse(options.body) : options.body;
}

function finishApiResponse(payload, path, res) {
  if (payload?.error) {
    const status = payload.status ?? res?.status;
    if (status === 401 && !path.includes("/auth/login")) {
      sessionStorage.removeItem("kys_token");
      window.location.hash = "#/login";
    }
    throw new Error(payload.error);
  }

  if (res && !res.ok && !payload?.data) {
    throw new Error(payload?.error || `API error (${res.status})`);
  }

  const data = payload.data;
  if (data?.token) {
    sessionStorage.setItem("kys_token", data.token);
  }
  return data;
}

async function dispatchSupabase(path, options = {}, cfg) {
  const method = (options.method || "GET").toUpperCase();
  const body = requestBody(options);
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

  return finishApiResponse(payload, path, res);
}

export async function api(path, options = {}) {
  startLoading();
  try {
    const cfg = await loadConfig();
    if (!cfg) {
      throw new Error(
        "Configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en el build, o publica config.json con supabaseUrl y supabaseKey.",
      );
    }
    return await dispatchSupabase(path, options, cfg);
  } finally {
    stopLoading();
  }
}

export function clearSession() {
  sessionStorage.removeItem("kys_token");
}
