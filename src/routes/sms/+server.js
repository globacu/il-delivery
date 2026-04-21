import html from '../../../static/sms.html?raw';

/** @type {import('./$types').RequestHandler} */
export function GET() {
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}
