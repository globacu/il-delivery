import { json } from '@sveltejs/kit';
import { listSessions } from '$lib/sessions.js';
import { snapshot } from '$lib/stats.js';

export async function GET({ platform }) {
  const [sessions, stats] = await Promise.all([
    listSessions(platform),
    snapshot(platform)
  ]);
  return json({ sessions, stats });
}
