const TTL_MS = 2 * 60 * 1000;

const store = {
  clientes: null,
  cuentas: null,
};

function fresh(entry) {
  return entry && Date.now() - entry.at < TTL_MS;
}

export async function getClientes(api) {
  if (fresh(store.clientes)) return store.clientes.data;
  const data = await api("/api/clients");
  store.clientes = { data, at: Date.now() };
  return data;
}

export async function getCuentas(api) {
  if (fresh(store.cuentas)) return store.cuentas.data;
  const data = await api("/api/accounts");
  store.cuentas = { data, at: Date.now() };
  return data;
}

export function invalidateClientes() {
  store.clientes = null;
}

export function invalidateCuentas() {
  store.cuentas = null;
}

export function invalidateAll() {
  store.clientes = null;
  store.cuentas = null;
}
