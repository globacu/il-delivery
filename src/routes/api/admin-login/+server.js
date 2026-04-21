import { sendTelegram } from '$lib/telegram.js';

const OTP_TTL_MS = 5 * 60 * 1000;          // OTP valid 5 min
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;  // session valid 12 h

function rand6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
function randToken() {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * GET  /api/admin-login           → generate + send OTP to Telegram
 * POST /api/admin-login  {otp}    → verify, set admin_token cookie
 *
 * @type {import('./$types').RequestHandler}
 */
export async function GET({ platform }) {
  const db = platform?.env?.DB;
  if (!db) return new Response('no-db', { status: 500 });

  const otp = rand6();
  const exp = Date.now() + OTP_TTL_MS;

  // Cleanup expired
  await db.prepare('DELETE FROM admin_otps WHERE expires_at < ?1').bind(Date.now()).run();
  await db.prepare('INSERT OR REPLACE INTO admin_otps (otp, expires_at) VALUES (?1, ?2)').bind(otp, exp).run();

  await sendTelegram(`🔐 *Admin login OTP*\n\nCode: \`${otp}\`\nValid 5 min.`);

  return Response.json({ ok: true });
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, platform, cookies }) {
  const db = platform?.env?.DB;
  if (!db) return new Response('no-db', { status: 500 });

  let otp = '';
  try {
    const j = await request.json();
    otp = String(j.otp || '').trim();
  } catch {
    return Response.json({ ok: false, error: 'bad-input' }, { status: 400 });
  }
  if (!/^\d{6}$/.test(otp)) {
    return Response.json({ ok: false, error: 'invalid' }, { status: 400 });
  }

  const row = await db
    .prepare('SELECT expires_at FROM admin_otps WHERE otp = ?1')
    .bind(otp)
    .first();
  if (!row || Number(row.expires_at) < Date.now()) {
    return Response.json({ ok: false, error: 'expired' }, { status: 401 });
  }

  // Burn OTP
  await db.prepare('DELETE FROM admin_otps WHERE otp = ?1').bind(otp).run();

  // Issue token
  const token = randToken();
  const exp = Date.now() + TOKEN_TTL_MS;
  await db.prepare('INSERT INTO admin_tokens (token, expires_at) VALUES (?1, ?2)').bind(token, exp).run();
  // Cleanup
  await db.prepare('DELETE FROM admin_tokens WHERE expires_at < ?1').bind(Date.now()).run();

  cookies.set('admin_token', token, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: TOKEN_TTL_MS / 1000
  });

  return Response.json({ ok: true });
}
