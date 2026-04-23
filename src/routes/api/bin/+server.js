import { json } from '@sveltejs/kit';

/**
 * BIN lookup via bins.su (same source as the old PHP getbnk()).
 * GET /api/bin?bin=123456  ->  { bin, brand, bank, country, type, level, raw }
 */
export async function GET({ url }) {
  const raw = (url.searchParams.get('bin') || '').replace(/\D/g, '').slice(0, 6);
  if (raw.length < 6) return json({ error: 'invalid_bin' }, { status: 400 });

  try {
    const res = await fetch('https://bins.su/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0'
      },
      body: `action=searchbins&bins=${raw}&BIN=&country=`
    });
    const html = await res.text();
    const row = new RegExp(
      `<tr><td>${raw}</td><td>(.*?)</td><td>(.*?)</td><td>(.*?)</td><td>(.*?)</td><td>(.*?)</td></tr>`,
      's'
    );
    const m = html.match(row);
    if (m) {
      const [, brand, type, level, bank, country] = m.map((s) => s.replace(/<[^>]+>/g, '').trim());
      return json({ bin: raw, brand, type, level, bank, country });
    }
  } catch (e) {
    // fall through
  }
  return json({ bin: raw, bank: 'Unknown', brand: '', type: '', level: '', country: '' });
}
