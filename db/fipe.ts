export type FipeVehicleType = "cars" | "motorcycles" | "trucks";
export type FipeBrand = {
  id: string;
  externalCode: string;
  name: string;
  vehicleType: FipeVehicleType;
  active: boolean;
  lastSyncedAt: string;
};
export type FipeModel = {
  id: string;
  externalCode: string;
  name: string;
  brandId: string;
  vehicleType: FipeVehicleType;
  active: boolean;
  lastSyncedAt: string;
};
const TYPES = new Set<FipeVehicleType>(["cars", "motorcycles", "trucks"]);
const BASE = "https://fipe.parallelum.com.br/api/v2";

export function validFipeType(value: string | null): value is FipeVehicleType {
  return Boolean(value && TYPES.has(value as FipeVehicleType));
}
async function ready() {
  const { env } = await import("cloudflare:workers");
  await env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS portal_vehicle_brands (id TEXT PRIMARY KEY, external_code TEXT NOT NULL, name TEXT NOT NULL, vehicle_type TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, last_synced_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(vehicle_type,external_code))`,
    ),
    env.DB.prepare(
      `CREATE INDEX IF NOT EXISTS idx_vehicle_brands_type_name ON portal_vehicle_brands(vehicle_type,name)`,
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS portal_vehicle_models (id TEXT PRIMARY KEY, external_code TEXT NOT NULL, name TEXT NOT NULL, brand_id TEXT NOT NULL, vehicle_type TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, last_synced_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(brand_id,external_code))`,
    ),
    env.DB.prepare(
      `CREATE INDEX IF NOT EXISTS idx_vehicle_models_brand_name ON portal_vehicle_models(brand_id,name)`,
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS portal_fipe_sync_logs (id TEXT PRIMARY KEY, vehicle_type TEXT NOT NULL, brands_found INTEGER NOT NULL, brands_processed INTEGER NOT NULL, models_found INTEGER NOT NULL, errors_json TEXT NOT NULL, status TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT)`,
    ),
  ]);
  return env;
}
function headers(env: Record<string, unknown>) {
  const h: Record<string, string> = { Accept: "application/json" };
  const token = String(env.FIPE_API_TOKEN || "").trim();
  if (token) h["X-Subscription-Token"] = token;
  return h;
}
async function remote(env: Record<string, unknown>, path: string) {
  let error = "FIPE indisponível";
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(
        `${String(env.FIPE_API_URL || BASE).replace(/\/$/, "")}${path}`,
        { headers: headers(env), signal: controller.signal },
      );
      if (response.ok) return await response.json();
      error =
        response.status === 429
          ? "Limite diário da FIPE atingido."
          : `FIPE respondeu ${response.status}.`;
      if (response.status !== 429 && response.status < 500) break;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : error;
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
  }
  throw new Error(error);
}
export async function listFipeBrands(type: FipeVehicleType) {
  const env = await ready();
  return (
    await env.DB.prepare(
      `SELECT id,external_code AS externalCode,name,vehicle_type AS vehicleType,active,last_synced_at AS lastSyncedAt FROM portal_vehicle_brands WHERE vehicle_type=? AND active=1 ORDER BY lower(name)`,
    )
      .bind(type)
      .all<FipeBrand>()
  ).results;
}
export async function listFipeModels(type: FipeVehicleType, brandId: string) {
  const env = await ready();
  return (
    await env.DB.prepare(
      `SELECT id,external_code AS externalCode,name,brand_id AS brandId,vehicle_type AS vehicleType,active,last_synced_at AS lastSyncedAt FROM portal_vehicle_models WHERE vehicle_type=? AND brand_id=? AND active=1 ORDER BY lower(name)`,
    )
      .bind(type, brandId)
      .all<FipeModel>()
  ).results;
}
export async function fipeStats() {
  const env = await ready();
  const [brands, models, last] = await Promise.all([
    env.DB.prepare(
      `SELECT vehicle_type AS type,COUNT(*) AS count FROM portal_vehicle_brands WHERE active=1 GROUP BY vehicle_type`,
    ).all<{ type: string; count: number }>(),
    env.DB.prepare(
      `SELECT vehicle_type AS type,COUNT(*) AS count FROM portal_vehicle_models WHERE active=1 GROUP BY vehicle_type`,
    ).all<{ type: string; count: number }>(),
    env.DB.prepare(
      `SELECT status,vehicle_type AS vehicleType,brands_found AS brandsFound,brands_processed AS brandsProcessed,models_found AS modelsFound,errors_json AS errors,started_at AS startedAt,finished_at AS finishedAt FROM portal_fipe_sync_logs ORDER BY started_at DESC LIMIT 1`,
    ).first<Record<string, unknown>>(),
  ]);
  return {
    brands: Object.fromEntries(
      brands.results.map((x) => [x.type, Number(x.count)]),
    ),
    models: Object.fromEntries(
      models.results.map((x) => [x.type, Number(x.count)]),
    ),
    last: last
      ? { ...last, errors: JSON.parse(String(last.errors || "[]")) }
      : null,
  };
}
export async function startFipeSync(type: FipeVehicleType) {
  const env = await ready();
  const payload = (await remote(
    env as unknown as Record<string, unknown>,
    `/${type}/brands`,
  )) as Array<{ code: string; name: string }>;
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const statements = payload.map((item) =>
    env.DB.prepare(
      `INSERT INTO portal_vehicle_brands(id,external_code,name,vehicle_type,active,last_synced_at,created_at,updated_at) VALUES(?,?,?,?,1,?,?,?) ON CONFLICT(vehicle_type,external_code) DO UPDATE SET name=excluded.name,active=1,last_synced_at=excluded.last_synced_at,updated_at=excluded.updated_at`,
    ).bind(
      `${type}:${item.code}`,
      String(item.code),
      item.name,
      type,
      now,
      now,
      now,
    ),
  );
  statements.push(
    env.DB.prepare(
      `INSERT INTO portal_fipe_sync_logs(id,vehicle_type,brands_found,brands_processed,models_found,errors_json,status,started_at) VALUES(?,?,?,0,0,'[]','running',?)`,
    ).bind(id, type, payload.length, now),
  );
  for (let i = 0; i < statements.length; i += 50)
    await env.DB.batch(statements.slice(i, i + 50));
  return { jobId: id, total: payload.length };
}
export async function continueFipeSync(jobId: string, limit = 4) {
  const env = await ready();
  const job = await env.DB.prepare(
    `SELECT vehicle_type AS vehicleType,brands_found AS brandsFound,brands_processed AS brandsProcessed,models_found AS modelsFound,errors_json AS errors FROM portal_fipe_sync_logs WHERE id=? AND status='running'`,
  )
    .bind(jobId)
    .first<{
      vehicleType: FipeVehicleType;
      brandsFound: number;
      brandsProcessed: number;
      modelsFound: number;
      errors: string;
    }>();
  if (!job) throw new Error("Sincronização não encontrada.");
  const brands = (
    await env.DB.prepare(
      `SELECT id,external_code AS externalCode,name FROM portal_vehicle_brands WHERE vehicle_type=? AND active=1 ORDER BY lower(name) LIMIT ? OFFSET ?`,
    )
      .bind(job.vehicleType, limit, job.brandsProcessed)
      .all<{ id: string; externalCode: string; name: string }>()
  ).results;
  let modelsFound = job.modelsFound;
  const errors: string[] = JSON.parse(job.errors || "[]");
  for (const brand of brands) {
    try {
      const models = (await remote(
        env as unknown as Record<string, unknown>,
        `/${job.vehicleType}/brands/${encodeURIComponent(brand.externalCode)}/models`,
      )) as Array<{ code: string; name: string }>;
      modelsFound += models.length;
      const now = new Date().toISOString();
      const statements = models.map((model) =>
        env.DB.prepare(
          `INSERT INTO portal_vehicle_models(id,external_code,name,brand_id,vehicle_type,active,last_synced_at,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?,?) ON CONFLICT(brand_id,external_code) DO UPDATE SET name=excluded.name,active=1,last_synced_at=excluded.last_synced_at,updated_at=excluded.updated_at`,
        ).bind(
          `${brand.id}:${model.code}`,
          String(model.code),
          model.name,
          brand.id,
          job.vehicleType,
          now,
          now,
          now,
        ),
      );
      for (let i = 0; i < statements.length; i += 50)
        await env.DB.batch(statements.slice(i, i + 50));
    } catch (error) {
      errors.push(
        `${brand.name}: ${error instanceof Error ? error.message : "falha"}`,
      );
    }
  }
  const processed = Math.min(
    job.brandsProcessed + brands.length,
    job.brandsFound,
  );
  const done = processed >= job.brandsFound;
  await env.DB.prepare(
    `UPDATE portal_fipe_sync_logs SET brands_processed=?,models_found=?,errors_json=?,status=?,finished_at=? WHERE id=?`,
  )
    .bind(
      processed,
      modelsFound,
      JSON.stringify(errors.slice(-100)),
      done ? "completed" : "running",
      done ? new Date().toISOString() : null,
      jobId,
    )
    .run();
  return {
    jobId,
    type: job.vehicleType,
    total: job.brandsFound,
    processed,
    modelsFound,
    errors,
    done,
  };
}
