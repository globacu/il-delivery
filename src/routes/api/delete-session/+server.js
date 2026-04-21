import { json } from '@sveltejs/kit';
import { deleteSession } from '$lib/sessions.js';

/** @type {import('./$types').RequestHandler} */
export function POST({ url }) {
  const id = url.searchParams.get('s');
  if (!id) return json({ ok: false }, { status: 400 });
  deleteSession(id);
  return json({ ok: true });
}
