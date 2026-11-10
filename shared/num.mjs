export function num(v) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}
