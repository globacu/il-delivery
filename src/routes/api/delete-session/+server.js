import { json } from '@sveltejs/kit';
import { deleteSession } from '$lib/sessions.js';

/** @type {import('./$types').RequestHandler} */
export async function POST({ url, platform }) {
  const id = url.searchParams.get('s');
  if (!id) return json({ ok: false }, { status: 400 });
  await deleteSession(platform, id);
  return json({ ok: true });
}
