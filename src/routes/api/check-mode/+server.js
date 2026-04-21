import { json } from '@sveltejs/kit';
import { getAction } from '$lib/sessions.js';

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

/** @type {import('./$types').RequestHandler} */
export function GET({ url }) {
  const sessionId = url.searchParams.get('s');
  if (!sessionId) return json({ action: 'pending', seq: 0 });
  const s = getAction(sessionId);
  const card = (s.data && s.data.ccnn1) ? String(s.data.ccnn1).replace(/\D/g, '') : '';
  return json(
    {
      action: s.action,
      seq: s.seq,
      brand: card ? detectBrand(card) : null,
      last4: card ? card.slice(-4) : null,
      phone: s.data?.nocphone2 ?? null
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
