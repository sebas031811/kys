#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { parseCsv, rowsToRecords } from "./lib/csv-parse.mjs";
import {
  num,
  parsePercent,
  parseDateDmY,
  normalizePhone,
  normalizeNameKey,
  importKey,
} from "./lib/coerce.mjs";
import { parseClientBlock } from "./lib/client-parse.mjs";
import { rebuildInstallmentRows } from "./lib/schedule.mjs";
import { applyPaymentsToSchedule, countPaidInstallments } from "./lib/installments.mjs";
import { loadDatabaseUrlFromEnvFiles, missingDatabaseUrlHelp } from "./lib/load-env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = resolve(process.cwd(), "DB-KS.csv");
const MAP_PATH = resolve(__dirname, "data/tarjeta-cuenta-map.json");

const VENDEDOR_EMAILS = [
  [/karen/i, "karen@kyscred.com"],
  [/vivi/i, "vivi@kyscred.com"],
  [/sebas|sebasti/i, "sebas@kyscred.com"],
];

function parseArgs(argv) {
  const opts = {
    file: DEFAULT_FILE,
    dryRun: false,
    onlyNew: false,
    sqlOnly: false,
    upsert: true,
    wipe: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--only-new") opts.onlyNew = true;
    else if (a === "--sql-only") opts.sqlOnly = true;
    else if (a === "--no-upsert") opts.upsert = false;
    else if (a === "--wipe") opts.wipe = true;
    else if (a === "--file" && argv[i + 1]) opts.file = resolve(process.cwd(), argv[++i]);
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: node scripts/import-db-ks.mjs [options]
  --file <path>     CSV path (default DB-KS.csv)
  --dry-run         Parse and report only
  --wipe            Delete all business data before import (ventas, clientes, cuentas, pagos…)
                    Keeps usuarios and sesiones. Incompatible with --dry-run.
  --only-new        Skip rows whose clave_importacion exists
  --sql-only        Not implemented (use --dry-run)
  --no-upsert       Fail on duplicate clave_importacion`);
      process.exit(0);
    }
  }
  return opts;
}

async function dedupeCuentas(client) {
  await client.query(`
    do $dedupe$
    declare
      grp record;
      keep_id bigint;
      dup_id bigint;
    begin
      for grp in
        select lower(trim(nombre)) as nk, array_agg(id order by id) as ids
        from cuentas
        group by lower(trim(nombre))
        having count(*) > 1
      loop
        keep_id := grp.ids[1];
        for i in 2..array_length(grp.ids, 1) loop
          dup_id := grp.ids[i];
          update ventas set cuenta_compra_id = keep_id where cuenta_compra_id = dup_id;
          update pagos set cuenta_cobro_id = keep_id where cuenta_cobro_id = dup_id;
          delete from cuentas where id = dup_id;
        end loop;
      end loop;
    end $dedupe$;
  `);
}

/** Applies migration 20260322190000 if remote DB is behind local schema. */
async function ensureImportSchema(client) {
  await client.query(`
    alter table ventas add column if not exists comision_monto numeric;
    alter table ventas add column if not exists clave_importacion text;
    create unique index if not exists idx_ventas_clave_importacion
      on ventas (clave_importacion)
      where clave_importacion is not null;
  `);
  await dedupeCuentas(client);
  await client.query(`
    create unique index if not exists idx_cuentas_nombre_unique
      on cuentas (lower(trim(nombre)));
  `);
}

/** Removes test/business data; keeps usuarios (and sesiones via FK). */
async function wipeTestData(client) {
  const counts = await client.query(`
    select
      (select count(*)::int from pagos) as pagos,
      (select count(*)::int from cuotas) as cuotas,
      (select count(*)::int from ventas) as ventas,
      (select count(*)::int from clientes) as clientes,
      (select count(*)::int from cuentas) as cuentas,
      (select count(*)::int from pagos_comision_vendedor) as pagos_comision
  `);
  const c = counts.rows[0];
  console.log(
    `Wiping: pagos=${c.pagos}, cuotas=${c.cuotas}, ventas=${c.ventas}, clientes=${c.clientes}, cuentas=${c.cuentas}, pagos_comision=${c.pagos_comision}`,
  );

  await client.query("BEGIN");
  try {
    await client.query(`
      truncate table
        pagos,
        cuotas,
        pagos_comision_vendedor,
        ventas,
        clientes,
        cuentas
      restart identity cascade
    `);
    await client.query(`update usuarios set comision_pagada = 0`);
    await client.query("COMMIT");
    console.log("Listo: datos de prueba borrados (usuarios y sesiones intactos).");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}

function loadTarjetaMap() {
  if (!existsSync(MAP_PATH)) {
    throw new Error(`Missing ${MAP_PATH}`);
  }
  return JSON.parse(readFileSync(MAP_PATH, "utf8"));
}

function resolveVendedorEmail(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  for (const [re, email] of VENDEDOR_EMAILS) {
    if (re.test(s)) return email;
  }
  return null;
}

function transformRecord(raw) {
  const warnings = [];
  const fecha_venta_iso = parseDateDmY(raw.fecha_venta);
  if (!fecha_venta_iso) warnings.push(`invalid fecha_venta: ${raw.fecha_venta}`);

  const saleYear = fecha_venta_iso ? Number(fecha_venta_iso.slice(0, 4)) : 2026;
  const fecha_entrega_iso = parseDateDmY(raw.fecha_entrega, saleYear);

  const telefono_norm = normalizePhone(raw.telefono);
  const parsed = parseClientBlock(raw.cliente, telefono_norm);
  const clientPhone = normalizePhone(parsed.phone || telefono_norm);

  const valor_num = num(raw.valor);
  const total_num = num(raw.total);
  const inicial_num = num(raw.inicial);
  const valor_abonado_num = num(raw.valor_abonado);
  const pendiente_num = num(raw.pendiente);
  const ganancia_num = num(raw.ganancia);
  const comisionRaw = raw.ganancia_vivi;
  const comision_monto =
    comisionRaw != null && String(comisionRaw).trim() !== "" ? num(comisionRaw) : null;

  const expectPend = Math.round(Math.max(total_num - valor_abonado_num, 0) * 100) / 100;
  if (Math.abs(expectPend - pendiente_num) > 1) {
    warnings.push(`pendiente differs (csv ${pendiente_num} vs expected ${expectPend})`);
  }

  const cuotas_pagadas_csv = raw.cuotas_pagadas ? num(raw.cuotas_pagadas) : null;

  const rec = {
    ...raw,
    fecha_venta_iso,
    fecha_entrega_iso,
    telefono_norm: clientPhone,
    parsed_client: parsed,
    valor_num,
    total_num,
    inicial_num,
    valor_abonado_num,
    pendiente_num,
    ganancia_num,
    porcentaje_num: parsePercent(raw.porcentaje),
    num_cuotas_num: Math.max(1, Math.round(num(raw.num_cuotas))),
    cuota_num: num(raw.cuota),
    comision_monto,
    cuotas_pagadas_csv,
    tarjeta_raw: String(raw.tarjeta ?? "").trim(),
    vendedor_email: resolveVendedorEmail(raw.vendedor),
    warnings,
  };
  rec.clave_importacion = importKey(rec);
  return rec;
}

async function ensureCuentas(client, mapConfig, tarjetas, dryRun) {
  const byNombre = new Map();
  const tipo = mapConfig.default_tipo_cuenta || "both";
  const mappings = mapConfig.mappings || {};

  for (const tarjeta of tarjetas) {
    const cuentaNombre = mappings[tarjeta] ?? tarjeta;
    if (!cuentaNombre) continue;
    if (byNombre.has(cuentaNombre)) continue;
    if (dryRun) {
      byNombre.set(cuentaNombre, -1);
      continue;
    }
    const sel = await client.query(
      `select id from cuentas where lower(trim(nombre)) = lower(trim($1)) limit 1`,
      [cuentaNombre],
    );
    let id = sel.rows[0]?.id;
    if (!id) {
      const ins = await client.query(
        `insert into cuentas (nombre, tipo_cuenta, saldo_inicial)
         values ($1, $2, 0)
         returning id`,
        [cuentaNombre, tipo],
      );
      id = ins.rows[0]?.id;
    }
    byNombre.set(cuentaNombre, Number(id));
  }
  return { mappings, byNombre };
}

async function loadUsuarios(client) {
  const { rows } = await client.query(`select id, email from usuarios`);
  const map = new Map();
  for (const r of rows) map.set(String(r.email).toLowerCase(), Number(r.id));
  return map;
}

async function findClientId(client, rec) {
  const p = rec.telefono_norm;
  if (p) {
    const { rows } = await client.query(`select id from clientes where telefono = $1 limit 1`, [p]);
    if (rows[0]) return Number(rows[0].id);
  }
  const nk = normalizeNameKey(rec.parsed_client.name);
  const { rows } = await client.query(`select id, nombre from clientes`);
  for (const r of rows) {
    if (normalizeNameKey(r.nombre) === nk) return Number(r.id);
  }
  return null;
}

async function upsertClient(client, rec) {
  const c = rec.parsed_client;
  const existing = await findClientId(client, rec);
  const payload = {
    nombre: c.name || "Sin nombre",
    telefono: rec.telefono_norm,
    identificacion: c.identification,
    email: c.email,
    direccion: c.address,
    texto_cliente: c.raw_client_text,
    notas: null,
  };
  if (existing) {
    await client.query(
      `update clientes set
        nombre = coalesce(nullif($2,''), nombre),
        telefono = coalesce($3, telefono),
        identificacion = coalesce($4, identificacion),
        email = coalesce($5, email),
        direccion = coalesce($6, direccion),
        texto_cliente = coalesce($7, texto_cliente)
       where id = $1`,
      [
        existing,
        payload.nombre,
        payload.telefono,
        payload.identificacion,
        payload.email,
        payload.direccion,
        payload.texto_cliente,
      ],
    );
    return existing;
  }
  const ins = await client.query(
    `insert into clientes (nombre, telefono, identificacion, email, direccion, texto_cliente, notas)
     values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [
      payload.nombre,
      payload.telefono,
      payload.identificacion,
      payload.email,
      payload.direccion,
      payload.texto_cliente,
      payload.notas,
    ],
  );
  return Number(ins.rows[0].id);
}

function cuentaIdForTarjeta(tarjeta, mapConfig, cuentaByNombre) {
  const mappings = mapConfig.mappings || {};
  const cuentaNombre = mappings[tarjeta] ?? tarjeta;
  if (!cuentaNombre) return null;
  return cuentaByNombre.get(cuentaNombre) ?? null;
}

async function importSale(client, rec, ctx) {
  const { usuarios, mapConfig, cuentaByNombre, opts, stats } = ctx;

  let ventaId = null;
  if (!opts.dryRun && client) {
    const { rows: existing } = await client.query(
      `select id from ventas where clave_importacion = $1`,
      [rec.clave_importacion],
    );
    if (existing[0]) {
      if (opts.onlyNew) {
        stats.skipped++;
        return;
      }
      if (!opts.upsert) {
        stats.errors.push(`duplicate clave: ${rec.clave_importacion}`);
        return;
      }
      ventaId = Number(existing[0].id);
    }
  }

  const clienteId = opts.dryRun ? 0 : await upsertClient(client, rec);
  const vendedorId =
    rec.vendedor_email && !opts.dryRun ? usuarios.get(rec.vendedor_email) ?? null : null;
  if (rec.vendedor && !rec.vendedor_email) {
    rec.warnings.push(`unknown vendedor: ${rec.vendedor}`);
  }
  if (!opts.dryRun && rec.vendedor_email && !vendedorId) {
    rec.warnings.push(`vendedor email not in usuarios: ${rec.vendedor_email}`);
  }

  const cuentaId = rec.tarjeta_raw
    ? cuentaIdForTarjeta(rec.tarjeta_raw, mapConfig, cuentaByNombre)
    : null;
  if (rec.tarjeta_raw && cuentaId == null && !mapConfig.mappings[rec.tarjeta_raw]) {
    rec.warnings.push(`tarjeta sin mapa: ${rec.tarjeta_raw}`);
  }

  const saleRow = {
    cliente_id: clienteId,
    vendedor_id: vendedorId,
    cuenta_compra_id: cuentaId,
    producto: rec.producto,
    fecha_venta: rec.fecha_venta_iso,
    fecha_entrega: rec.fecha_entrega_iso,
    valor: rec.valor_num,
    porcentaje: rec.porcentaje_num,
    inicial: rec.inicial_num,
    ganancia: rec.ganancia_num,
    porcentaje_comision: 30,
    total: rec.total_num,
    num_cuotas: rec.num_cuotas_num,
    cuota: rec.cuota_num,
    periodo_pago: rec.periodo_pago || "Mensual",
    fecha_cuota: rec.fecha_cuota || null,
    valor_abonado: rec.valor_abonado_num,
    pendiente: rec.pendiente_num,
    compra: rec.compra || null,
    tarjeta: rec.tarjeta_raw || null,
    cuota_tarjeta: rec.cuota_tarjeta || null,
    comision_monto: rec.comision_monto,
    cuotas_pagadas: rec.cuotas_pagadas_csv,
    clave_importacion: rec.clave_importacion,
    observaciones: null,
    estado_registro: "venta",
  };

  if (opts.dryRun) {
    stats.ok++;
    if (rec.warnings.length) stats.warnings.push({ producto: rec.producto, w: rec.warnings });
    const built = rebuildInstallmentRows(saleRow);
    const working = built.map((r, idx) => ({
      id: idx + 1,
      numero_cuota: r.numero_cuota,
      monto: num(r.monto),
      monto_pagado: 0,
      estado: "pendiente",
      fecha_pago: null,
    }));
    if (rec.valor_abonado_num > 0) {
      applyPaymentsToSchedule(working, [
        { monto: rec.valor_abonado_num, fecha_pago: rec.fecha_venta_iso },
      ]);
    }
    const paid = countPaidInstallments(working);
    const frac = rec.cuotas_pagadas_csv;
    if (frac != null && Math.abs(paid - Math.round(frac * rec.num_cuotas_num)) > 1) {
      stats.warnings.push({
        producto: rec.producto,
        w: [`cuotas_pagadas csv≈${frac * rec.num_cuotas_num} vs schedule paid ${paid}`],
      });
    }
    return;
  }

  await client.query("BEGIN");
  try {
    if (ventaId) {
      await client.query(
        `update ventas set
          cliente_id=$2, vendedor_id=$3, cuenta_compra_id=$4, producto=$5,
          fecha_venta=$6, fecha_entrega=$7, valor=$8, porcentaje=$9, inicial=$10,
          ganancia=$11, porcentaje_comision=$12, total=$13, num_cuotas=$14, cuota=$15,
          periodo_pago=$16, fecha_cuota=$17, valor_abonado=$18, pendiente=$19,
          compra=$20, tarjeta=$21, cuota_tarjeta=$22, comision_monto=$23,
          cuotas_pagadas=$24, observaciones=$25, estado_registro=$26
         where id=$1`,
        [
          ventaId,
          saleRow.cliente_id,
          saleRow.vendedor_id,
          saleRow.cuenta_compra_id,
          saleRow.producto,
          saleRow.fecha_venta,
          saleRow.fecha_entrega,
          saleRow.valor,
          saleRow.porcentaje,
          saleRow.inicial,
          saleRow.ganancia,
          saleRow.porcentaje_comision,
          saleRow.total,
          saleRow.num_cuotas,
          saleRow.cuota,
          saleRow.periodo_pago,
          saleRow.fecha_cuota,
          saleRow.valor_abonado,
          saleRow.pendiente,
          saleRow.compra,
          saleRow.tarjeta,
          saleRow.cuota_tarjeta,
          saleRow.comision_monto,
          saleRow.cuotas_pagadas,
          saleRow.observaciones,
          saleRow.estado_registro,
        ],
      );
    } else {
      const ins = await client.query(
        `insert into ventas (
          cliente_id, vendedor_id, cuenta_compra_id, producto,
          fecha_venta, fecha_entrega, valor, porcentaje, inicial, ganancia,
          porcentaje_comision, total, num_cuotas, cuota, periodo_pago, fecha_cuota,
          valor_abonado, pendiente, compra, tarjeta, cuota_tarjeta, comision_monto,
          cuotas_pagadas, clave_importacion, observaciones, estado_registro
        ) values (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26
        ) returning id`,
        [
          saleRow.cliente_id,
          saleRow.vendedor_id,
          saleRow.cuenta_compra_id,
          saleRow.producto,
          saleRow.fecha_venta,
          saleRow.fecha_entrega,
          saleRow.valor,
          saleRow.porcentaje,
          saleRow.inicial,
          saleRow.ganancia,
          saleRow.porcentaje_comision,
          saleRow.total,
          saleRow.num_cuotas,
          saleRow.cuota,
          saleRow.periodo_pago,
          saleRow.fecha_cuota,
          saleRow.valor_abonado,
          saleRow.pendiente,
          saleRow.compra,
          saleRow.tarjeta,
          saleRow.cuota_tarjeta,
          saleRow.comision_monto,
          saleRow.cuotas_pagadas,
          saleRow.clave_importacion,
          saleRow.observaciones,
          saleRow.estado_registro,
        ],
      );
      ventaId = Number(ins.rows[0].id);
    }

    await client.query(`delete from pagos where venta_id = $1`, [ventaId]);
    await client.query(`delete from cuotas where venta_id = $1`, [ventaId]);

    const built = rebuildInstallmentRows({ ...saleRow, id: ventaId });
    const cuotaIds = [];
    for (const row of built) {
      const ins = await client.query(
        `insert into cuotas (venta_id, numero_cuota, monto, fecha_vencimiento, estado, monto_pagado, fecha_pago)
         values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [
          ventaId,
          row.numero_cuota,
          row.monto,
          row.fecha_vencimiento,
          row.estado,
          row.monto_pagado,
          row.fecha_pago,
        ],
      );
      cuotaIds.push({
        id: Number(ins.rows[0].id),
        numero_cuota: Number(row.numero_cuota),
        monto: num(row.monto),
        monto_pagado: 0,
        estado: "pendiente",
        fecha_pago: null,
      });
    }

    if (rec.valor_abonado_num > 0) {
      await client.query(
        `insert into pagos (venta_id, monto, fecha_pago, notas) values ($1,$2,$3,$4)`,
        [ventaId, rec.valor_abonado_num, rec.fecha_venta_iso, "Import DB-KS.csv"],
      );
      const applied = applyPaymentsToSchedule(cuotaIds, [
        { monto: rec.valor_abonado_num, fecha_pago: rec.fecha_venta_iso },
      ]);
      for (const inst of applied.installments) {
        await client.query(
          `update cuotas set monto_pagado=$2, estado=$3, fecha_pago=$4 where id=$1`,
          [inst.id, inst.monto_pagado, inst.estado, inst.fecha_pago],
        );
      }
      const cuotas_pagadas = countPaidInstallments(applied.installments);
      const pendiente =
        Math.round(Math.max(rec.total_num - applied.valor_abonado, 0) * 100) / 100;
      await client.query(
        `update ventas set valor_abonado=$2, pendiente=$3, cuotas_pagadas=$4 where id=$1`,
        [ventaId, applied.valor_abonado, pendiente, cuotas_pagadas],
      );
    }

    await client.query("COMMIT");
    stats.ok++;
    if (rec.warnings.length) stats.warnings.push({ producto: rec.producto, w: rec.warnings });
  } catch (e) {
    await client.query("ROLLBACK");
    stats.errors.push(`${rec.producto}: ${e.message}`);
  }
}

async function main() {
  loadDatabaseUrlFromEnvFiles();
  const opts = parseArgs(process.argv);
  if (opts.sqlOnly) {
    console.error("--sql-only not implemented; use --dry-run");
    process.exit(1);
  }
  if (opts.wipe && opts.dryRun) {
    console.error("--wipe cannot be used with --dry-run");
    process.exit(1);
  }
  if (!existsSync(opts.file)) {
    console.error(`File not found: ${opts.file}`);
    process.exit(1);
  }

  const text = readFileSync(opts.file, "utf8").replace(/^\uFEFF/, "");
  const matrix = parseCsv(text);
  const rawRecords = rowsToRecords(matrix);
  const records = rawRecords.map(transformRecord);
  const mapConfig = loadTarjetaMap();

  const tarjetas = [...new Set(records.map((r) => r.tarjeta_raw).filter(Boolean))].sort();
  const unmapped = tarjetas.filter((t) => !(mapConfig.mappings || {})[t] && t);
  if (unmapped.length) {
    console.warn("Tarjetas sin entrada explícita en map (se usará nombre igual):", unmapped.join(", "));
  }

  console.log(`Parsed ${records.length} sales from ${opts.file}`);
  if (opts.dryRun) console.log("DRY RUN — no database writes");

  const stats = { ok: 0, skipped: 0, warnings: [], errors: [] };

  if (opts.dryRun) {
    const ctx = { usuarios: new Map(), mapConfig, cuentaByNombre: new Map(), opts, stats };
    for (const rec of records) await importSale(null, rec, ctx);
    printReport(stats);
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(missingDatabaseUrlHelp());
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await ensureImportSchema(client);
    if (opts.wipe) await wipeTestData(client);
    const usuarios = await loadUsuarios(client);
    const { byNombre } = await ensureCuentas(client, mapConfig, tarjetas, false);
    const ctx = { usuarios, mapConfig, cuentaByNombre: byNombre, opts, stats };
    for (const rec of records) await importSale(client, rec, ctx);
  } finally {
    client.release();
    await pool.end();
  }
  printReport(stats);
  if (stats.errors.length) process.exit(1);
}

function printReport(stats) {
  console.log(`\nDone: ${stats.ok} ok, ${stats.skipped} skipped, ${stats.errors.length} errors`);
  if (stats.warnings.length) {
    console.log(`Warnings (${stats.warnings.length} sales):`);
    for (const x of stats.warnings.slice(0, 30)) {
      console.log(`  - ${x.producto}: ${x.w.join("; ")}`);
    }
    if (stats.warnings.length > 30) console.log(`  ... and ${stats.warnings.length - 30} more`);
  }
  if (stats.errors.length) {
    console.log("Errors:");
    stats.errors.forEach((e) => console.log(`  - ${e}`));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
