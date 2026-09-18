export async function api(path, options = {}) {
  if (typeof google === "undefined" || !google.script?.run) {
    throw new Error("Open KYS from the Google Apps Script web app URL (not localhost).");
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

export function clearSession() {
  sessionStorage.removeItem("kys_token");
}
