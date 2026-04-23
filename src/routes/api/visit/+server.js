import { json } from '@sveltejs/kit';
import { sendTelegram } from '$lib/telegram.js';
import { inc } from '$lib/stats.js';

// Per-IP dedupe window (prevents spam on reloads / multi-page visits)
const recent = new Map();
const TTL = 30 * 60; // 30 minutes

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, getClientAddress, url, platform }) {
  const body = await request.json().catch(() => ({}));
  const page = (body.page || '/').toString().slice(0, 80);
  const ref  = (body.ref  || '').toString().slice(0, 200);
  const ua   = request.headers.get('user-agent') || '';
  const lang = request.headers.get('accept-language') || '';
  const ip   = getClientAddress();
  const now  = Date.now();

  // Dedupe by IP only — one visit per unique IP forever
  const key = `visit:${ip}`;
  const store = platform?.env?.STORE;

  if (store) {
    const seen = await store.get(key);
    if (seen) return json({ ok: true, dedup: true });
    await store.put(key, '1', { expirationTtl: TTL });
  } else {
    for (const [k, exp] of recent) if (exp < now) recent.delete(k);
    if (recent.has(key)) return json({ ok: true, dedup: true });
    recent.set(key, now + TTL * 1000);
  }

  await inc(platform, 'visits');

  // Geo lookup (free, no key required)
  let geo = '';
  try {
    const g = await fetch(`https://ipapi.co/${ip}/json/`, { signal: AbortSignal.timeout(3000) });
    if (g.ok) {
      const j = await g.json();
      geo = `${j.country_name || '?'} / ${j.city || '?'} · ${j.org || ''}`.trim();
    }
  } catch {}

  const date = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const msg =
`👀 *New Visitor*

⏰ ${date}
🌍 IP: \`${ip}\`
📍 ${geo || '—'}
📄 Page: ${page}
🔗 Ref: ${ref || '—'}
🌐 Lang: ${lang.split(',')[0] || '—'}
🖥 UA: \`${ua.slice(0, 160)}\``;

  await sendTelegram(msg);
  return json({ ok: true });
}
