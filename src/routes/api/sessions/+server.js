import { json } from '@sveltejs/kit';
import { listSessions } from '$lib/sessions.js';
import { snapshot } from '$lib/stats.js';

export function GET() {
  return json({ sessions: listSessions(), stats: snapshot() });
}
