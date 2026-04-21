/**
 * Verify admin_token cookie against D1.
 * @param {any} platform
 * @param {string|undefined} token
 */
export async function isAdminAuthed(platform, token) {
  if (!token) return false;
  const db = platform?.env?.DB;
  if (!db) return false;
  const row = await db
    .prepare('SELECT expires_at FROM admin_tokens WHERE token = ?1')
    .bind(token)
    .first();
  if (!row) return false;
  if (Number(row.expires_at) < Date.now()) {
    db.prepare('DELETE FROM admin_tokens WHERE token = ?1').bind(token).run().catch(() => {});
    return false;
  }
  return true;
}
