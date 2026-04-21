// Import index.html as a string at build time — works on Cloudflare Workers
// where node:fs is unavailable.
import html from '../../static/index.html?raw';

/** @type {import('./$types').RequestHandler} */
export function GET() {
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}
