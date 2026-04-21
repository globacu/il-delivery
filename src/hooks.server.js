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
// ONLY these ASNs can reach the visitor-facing pages. Every other ASN (even if CF reports
// country=IL) is treated as a VPN/proxy/datacenter and blocked.
const IL_CONSUMER_ASNS = new Set([
  // ===== Israel =====
  // Bezeq International + family
  8551, 1403, 13110, 8691,
  // NetVision / 013 / Internet Gold / Triple C
  1680, 9116, 20255,
  // HOT / HOT Mobile / HOT-Net / Hot Telecommunication
  12849, 378, 24835, 9116,
  // 012 Smile / GoldenLines / 012 Mobile
  9116, 8867,
  // Partner Communications / Orange IL / 013 Mobile
  12400, 25010,
  // Cellcom Mobile / Cellcom fixed / Netvision-Cellcom
  42013, 8691, 1680,
  // Pelephone
  15975,
  // Xfone / Marathon
  20927,
  // 018 Xphone / Smile Telecom
  12400, 42742,
  // We4G / Rami Levy Communications / Azrieli
  37754, 57731, 199391,
  // Bezeq Business / WeBezeq
  8551, 13110,
  // Cellcom DC / IP-pools
  8691,
  // 019 Mobile (Gilat)
  212746,
  // Unlimited / Pelephone extras
  47956, 212746,
  // Home WiFi ISPs (012, 013 shared)
  9116, 1680,

  // ===== Palestinian Territories =====
  // Paltel / Jawwal / Wataniya / Ooredoo PS / Hadara / Mada / Coolnet
  12975, 15975, 28972, 30958, 34919, 56921, 41918, 39105, 197180,

  // Extra IL content edge (safe to allow since they belong to carriers)
  43531, 199391
]);

// ---------- Known bad IP prefixes (in addition to ASN list) ----------
// Quick prefix check for ranges that pretend to be consumer but are proxies.
const BAD_IP_PREFIXES = [
  /^77\.91\./,      // MivoCloud / proxy farms
  /^45\.(133|155|86|9|61|79|80|81|82|83|84|85|87|88|89|90|91|92|93|94|95|128|129|130|131|132|134|135|136|137|138|139|140|141|142|143|144|145|146|147|148|149|150|151|152|153|154|156|157|158|159|195)\./,
  /^5\.(34|101|157|161|181|182|183|188|189|196|199|252|253|254|255)\./,
  /^79\.110\./,     // hosting
  /^103\./,         // mostly APNIC hosting
  /^185\.(10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44|45|46|47|48|49|50|51|52|53|54|55|56|57|58|59|60|61|62|63|64|65|66|67|68|69|70|71|72|73|74|75|76|77|78|79|80|81|82|83|84|85|86|87|88|89|90|91|92|93|94|95|96|97|98|99|100|101|102|103|104|105|106|107|108|109|110|111|112|113|114|115|116|117|118|119|120|121|122|123|124|125|126|127|128|129|130|131|132|133|134|135|136|137|138|139|140|141|142|143|144|145|146|147|148|149|150|151|152|153|154|155|156|157|158|159|160|161|162|163|164|165|166|167|168|169|170|171|172|173|174|175|176|177|178|179|180|181|182|183|184|185|186|187|188|189|190|191|192|193|194|195|196|197|198|199|200|201|202|203|204|205|206|207|208|209|210|211|212|213|214|215|216|217|218|219|220|221|222|223|224|225|226|227|228|229|230|231|232|233|234|235|236|237|238|239|240|241|242|243|244|245|246|247|248|249|250|251|252|253|254|255)\./,
  /^193\.(3|38|169|176|239)\./,
  /^194\.(0|26|34|35|36|40|41|42|43|44|49|50|61|67|110|135|147|149|156|163|169)\./,
  /^195\.(2|3|16|88|123|154|181|189|225)\./,
  /^92\.(38|63|118|119)\./,
  /^37\.(0|19|120|220|230)\./,
  /^104\.(128|129|130|131|160|161|168|192|193|194|195|196|197|198|199|200|201|202|203|204|205|206|207|218|219|227|233|234|238|243|244|248|251|254)\./,
  /^141\.(95|98|136|255)\./,
  /^146\.(19|70|75)\./,
  /^147\.(78|135)\./,
  /^154\./,
  /^162\.(158|159|210|212|213|216|247|248|249|251|253|254|255)\./,
  /^176\.(113|119|123)\./,
  /^188\.(34|68|114|119|120|241|245)\./,
  /^198\.(12|46|50|54|98|144|204|205)\./,
  /^205\.(164|210)\./,
  /^209\.(58|99|127|141|222)\./,
  /^216\.24\./
];

function ipPrefixBlocked(ip) {
  if (!ip) return false;
  return BAD_IP_PREFIXES.some((re) => re.test(ip));
}

// ---------- Always-allow paths ----------

// ---------- Always-allow paths ----------
const ALLOW_PATHS = [
  /^\/admin(\/|$)/,
  /^\/login(\/|$)/,
  // Only internal / operator-facing APIs are bypass; visitor APIs (visit/post/submit)
  // must ALSO pass the bot blocker.
  /^\/api\/(tg-hook|set-mode|check-mode|sessions|delete-session|admin-login|presence)(\/|$)?/,
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
  // Use waitUntil so the KV stats write survives past the response
  const p = inc(platform, 'botsBlocked').catch(() => {});
  if (platform?.context?.waitUntil) platform.context.waitUntil(p);
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
  // Whitelist: must be a known Israeli/Palestinian consumer ISP
  if (!IL_CONSUMER_ASNS.has(asn)) return block(platform);
  if (BAD_ASNS.has(asn)) return block(platform);           // defensive overlap
  const asOrg = String(cf.asOrganization || '');
  if (asOrg && BAD_ORG.test(asOrg)) return block(platform);

  // 2b. Cloudflare threat score
  const threat = Number(cf.threatScore || 0);
  if (threat >= 10) return block(platform);

  // 2c. Bad-IP prefix check (MivoCloud, common proxy farms pretending to be mobile)
  const visitorIp = getClientAddress();
  if (ipPrefixBlocked(visitorIp)) return block(platform);

  // 3. User-Agent checks
  const ua = h.get('user-agent') || '';
  if (!ua.trim()) return block(platform);
  if (BOT_UA.test(ua)) return block(platform);
  if (ua.length < 40) return block(platform);              // too short = not real browser
  if (!/Mozilla\/5\.0/i.test(ua)) return block(platform);  // all real browsers use this
  // Must claim to be a real browser engine
  if (!/(Chrome|Firefox|Safari|Edg|OPR|Opera|SamsungBrowser|UCBrowser)\//i.test(ua)) return block(platform);

  // 3b. Mobile-only: block all desktop PCs (Windows, Mac, Linux, ChromeOS, FreeBSD...)
  const isMobile = /(iPhone|iPad|iPod|Android.*Mobile|Android.*Mobi|Mobile Safari|SamsungBrowser|Mobile\/[\dA-Z]+|BB10|BlackBerry|webOS|Opera Mini|Opera Mobi|IEMobile|Windows Phone)/i.test(ua);
  if (!isMobile) return block(platform);
  // Defensive: explicitly block known desktop OS tokens
  if (/(Windows NT|Macintosh|Mac OS X(?!.*Mobile)|X11|Linux(?!.*Android)|CrOS|FreeBSD|OpenBSD|NetBSD)/i.test(ua) && !/(iPhone|iPad|iPod|Android)/i.test(ua)) {
    return block(platform);
  }

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
    if (await isBadIP(visitorIp)) return block(platform);
  }

  return resolve(event);
}
