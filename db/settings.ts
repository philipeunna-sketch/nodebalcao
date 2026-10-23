import { normalizePortalCategories } from "../app/categories";

const createSettingsSql = `CREATE TABLE IF NOT EXISTS portal_settings (
  setting_key TEXT PRIMARY KEY NOT NULL,
  setting_value TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

let settingsTableReady: Promise<void> | null = null;
let publicSettingsCache: { expiresAt: number; data: Record<string, unknown> } | null = null;

function missingSettingsTable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table[^\n]*portal_settings/i.test(message);
}

export async function ensureSettingsTable() {
  if (!settingsTableReady) {
    settingsTableReady = import("cloudflare:workers")
      .then(({ env }) => env.DB.prepare(createSettingsSql).run())
      .then(() => undefined)
      .catch((error) => { settingsTableReady = null; throw error; });
  }
  await settingsTableReady;
}

export async function readPortalSettings(): Promise<Record<string, unknown>> {
  const { env } = await import("cloudflare:workers");
  let result;
  try {
    result = await env.DB.prepare("SELECT setting_key AS key, setting_value AS value FROM portal_settings").all<{ key: string; value: string }>();
  } catch (error) {
    if (!missingSettingsTable(error)) throw error;
    await ensureSettingsTable();
    result = await env.DB.prepare("SELECT setting_key AS key, setting_value AS value FROM portal_settings").all<{ key: string; value: string }>();
  }
  const settings: Record<string, unknown> = Object.fromEntries(result.results.map((row) => {
    try { return [row.key, JSON.parse(row.value)]; } catch { return [row.key, row.value]; }
  }));
  return { ...settings, categories: normalizePortalCategories(settings.categories) };
}

export async function readCachedPortalSettings(maxAgeMs = 60_000) {
  if (publicSettingsCache && publicSettingsCache.expiresAt > Date.now()) {
    return publicSettingsCache.data;
  }
  const data = await readPortalSettings();
  publicSettingsCache = {
    data,
    expiresAt: Date.now() + Math.min(Math.max(maxAgeMs, 5_000), 300_000),
  };
  return data;
}

export async function writePortalSettings(values: Record<string, unknown>) {
  const { env } = await import("cloudflare:workers");
  const now = new Date().toISOString();
  const entries = Object.entries(values);
  if (!entries.length) return;
  const write = () => env.DB.batch(entries.map(([key, value]) => env.DB.prepare(
      "INSERT INTO portal_settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at",
    ).bind(key, JSON.stringify(value), now)));
  try {
    await write();
  } catch (error) {
    if (!missingSettingsTable(error)) throw error;
    await ensureSettingsTable();
    await write();
  }
  publicSettingsCache = null;
}

export async function readPrivateSetting(key: string) {
  const { env } = await import("cloudflare:workers");
  const read = () => env.DB.prepare("SELECT setting_value AS value FROM portal_settings WHERE setting_key = ?").bind(key).first<{ value: string }>();
  let row;
  try {
    row = await read();
  } catch (error) {
    if (!missingSettingsTable(error)) throw error;
    await ensureSettingsTable();
    row = await read();
  }
  if (!row) return "";
  try { return JSON.parse(row.value) as string; } catch { return row.value; }
}
