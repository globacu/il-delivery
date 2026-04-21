import html from '../../../static/wait.html?raw';

/** @type {import('./$types').RequestHandler} */
export function GET() {
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}
