/**
 * Counters stored in Cloudflare KV under key "stats" as a JSON blob.
 * Falls back to in-memory for local dev.
 *
 * Note: KV is eventually consistent. Under very high concurrent load two
 * increments may race and lose one count — acceptable for this admin dashboard.
 */

const memStats = {
  visits: 0, botsBlocked: 0, cards: 0, otps: 0,
  links3ds: 0, successes: 0, declines: 0, startedAt: Date.now()
};

/** @param {any} platform */
function kv(platform) { return platform?.env?.STORE ?? null; }

/** @param {any} platform */
async function read(platform) {
  const store = kv(platform);
  if (store) {
    const existing = await store.get('stats', 'json');
    return existing ?? { visits:0, botsBlocked:0, cards:0, otps:0, links3ds:0, successes:0, declines:0, startedAt: Date.now() };
  }
  return memStats;
}

/** @param {any} platform @param {any} obj */
async function write(platform, obj) {
  const store = kv(platform);
  if (store) await store.put('stats', JSON.stringify(obj));
  // mem obj is mutated directly elsewhere — no write needed
}

/**
 * @param {any} platform
 * @param {'visits'|'botsBlocked'|'cards'|'otps'|'links3ds'|'successes'|'declines'} key
 * @param {number} [n]
 */
export async function inc(platform, key, n = 1) {
  const store = kv(platform);
  if (store) {
    const current = await read(platform);
    current[key] = (current[key] || 0) + n;
    await write(platform, current);
    return;
  }
  memStats[key] = (memStats[key] || 0) + n;
}

/** @param {any} platform */
export async function snapshot(platform) {
  const s = await read(platform);
  return { ...s, uptimeSec: Math.floor((Date.now() - (s.startedAt || Date.now())) / 1000) };
}
