/**
 * Bpost Live Tracker — Cloudflare Worker
 *
 * Routes:
 *   GET /proxy?url=<encoded>  →  CORS proxy (locked to track.bpost.cloud)
 *   GET /og.svg               →  Dynamic OpenGraph image (SVG)
 *   GET /                     →  index.html with injected OG <meta> tags
 *   Everything else           →  Static assets from ./public
 */

const ALLOWED_ORIGIN = 'https://track.bpost.cloud';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/proxy') {
      return handleProxy(request, url);
    }

    if (url.pathname === '/og.svg') {
      return handleOgImage(url);
    }

    // For the root page, inject dynamic OG tags
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return handlePage(request, url, env);
    }

    return env.ASSETS.fetch(request);
  },
};

// ── Page handler: injects OG meta tags into index.html ───────────────────────

async function handlePage(request, url, env) {
  const itemIdentifier = url.searchParams.get('itemIdentifier');
  const postalCode     = url.searchParams.get('postalCode');

  const assetReq = new Request(new URL('/', url).toString(), request);
  const assetRes = await env.ASSETS.fetch(assetReq);
  let html = await assetRes.text();

  let ogTags;
  if (itemIdentifier && postalCode) {
    ogTags = await buildTrackingOgTags(url, itemIdentifier, postalCode);
  } else {
    ogTags = buildHomepageOgTags(url);
  }

  html = html.replace('</head>', `${ogTags}\n</head>`);

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': itemIdentifier ? 'no-store' : 'public, max-age=3600',
    },
  });
}

function buildHomepageOgTags(url) {
  const origin      = url.origin;
  const title       = 'bpost tracker';
  const description = 'A lightweight, open-source bpost shipment tracker. Powered by the official bpost tracking API. No ads, no login — just paste your tracking number and go. Built as a single-page app with Tailwind CSS, Leaflet maps and a Cloudflare Worker CORS proxy.';
  const imageUrl    = `${origin}/og.svg`;
  return metaTags({ title, description, imageUrl, pageUrl: origin });
}

async function buildTrackingOgTags(url, itemIdentifier, postalCode) {
  const origin   = url.origin;
  const pageUrl  = url.href;
  const imageUrl = `${origin}/og.svg?itemIdentifier=${encodeURIComponent(itemIdentifier)}&postalCode=${encodeURIComponent(postalCode)}`;

  let title       = `Tracking ${itemIdentifier}`;
  let description = 'View live shipment status on bpost tracker.';

  try {
    const apiUrl = `https://track.bpost.cloud/track/items?itemIdentifier=${encodeURIComponent(itemIdentifier)}&postalCode=${encodeURIComponent(postalCode)}`;
    const res    = await fetch(apiUrl, { headers: { Accept: 'application/json' } });
    const data   = await res.json();
    const item   = data?.items?.[0];

    if (item) {
      const lang  = 'EN';
      const step  = item.activeStep || {};
      const stage = step.label?.main?.[lang]
        || Object.values(step.label?.main || {})[0]
        || 'In progress';

      const events    = item.events || [];
      const ev        = events[0];
      const eventDesc = ev?.description?.[lang] || ev?.label?.[lang] || ev?.type || '';

      title       = itemIdentifier;
      description = [stage, eventDesc].filter(Boolean).join(' · ');
    }
  } catch (_) {}

  return metaTags({ title, description, imageUrl, pageUrl });
}

function metaTags({ title, description, imageUrl, pageUrl }) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `
  <!-- OpenGraph / Social -->
  <meta property="og:type"         content="website">
  <meta property="og:site_name"    content="bpost tracker">
  <meta property="og:url"          content="${esc(pageUrl)}">
  <meta property="og:title"        content="${esc(title)}">
  <meta property="og:description"  content="${esc(description)}">
  <meta property="og:image"        content="${esc(imageUrl)}">
  <meta property="og:image:width"  content="1200">
  <meta property="og:image:height" content="630">
  <!-- Twitter / X -->
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image"       content="${esc(imageUrl)}">`.trim();
}

// ── OG Image: dynamic SVG 1200×630 ───────────────────────────────────────────

async function handleOgImage(url) {
  const itemIdentifier = url.searchParams.get('itemIdentifier');
  const postalCode     = url.searchParams.get('postalCode');

  let svg;

  if (itemIdentifier && postalCode) {
    let stage     = 'In progress';
    let lastEvent = '';

    try {
      const apiUrl = `https://track.bpost.cloud/track/items?itemIdentifier=${encodeURIComponent(itemIdentifier)}&postalCode=${encodeURIComponent(postalCode)}`;
      const res    = await fetch(apiUrl, { headers: { Accept: 'application/json' } });
      const data   = await res.json();
      const item   = data?.items?.[0];

      if (item) {
        const lang = 'EN';
        const step = item.activeStep || {};
        stage = step.label?.main?.[lang]
          || Object.values(step.label?.main || {})[0]
          || stage;

        const events = item.events || [];
        const ev     = events[0];
        lastEvent    = ev?.description?.[lang] || ev?.label?.[lang] || ev?.type || '';
      }
    } catch (_) {}

    svg = buildTrackingCard(itemIdentifier, stage, lastEvent);
  } else {
    svg = buildHomepageCard();
  }

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': itemIdentifier ? 'public, max-age=60' : 'public, max-age=86400',
    },
  });
}

// XML-safe escaping + truncation helpers
const x     = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const trunc = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;

function logoSvg(cx, cy) {
  return `
    <rect x="${cx - 36}" y="${cy - 36}" width="72" height="72" rx="18" fill="#e3000f"/>
    <g transform="translate(${cx - 18}, ${cy - 18}) scale(1.5)" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
      <line x1="12" y1="22.08" x2="12" y2="12"/>
    </g>`;
}

function buildHomepageCard() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#f8fafc"/>
  <rect width="8" height="630" fill="#e3000f"/>
  <line x1="460" y1="100" x2="460" y2="530" stroke="#e2e8f0" stroke-width="2"/>

  ${logoSvg(230, 270)}
  <text x="230" y="370" font-family="ui-sans-serif,system-ui,sans-serif" font-size="28" font-weight="700" fill="#0f172a" text-anchor="middle">bpost</text>
  <text x="230" y="404" font-family="ui-sans-serif,system-ui,sans-serif" font-size="28" font-weight="300" fill="#94a3b8" text-anchor="middle">tracker</text>

  <text x="520" y="210" font-family="ui-sans-serif,system-ui,sans-serif" font-size="46" font-weight="800" fill="#0f172a">A lightweight bpost</text>
  <text x="520" y="268" font-family="ui-sans-serif,system-ui,sans-serif" font-size="46" font-weight="800" fill="#e3000f">shipment tracker.</text>

  <line x1="520" y1="296" x2="1140" y2="296" stroke="#e2e8f0" stroke-width="1.5"/>

  <text x="520" y="350" font-family="ui-sans-serif,system-ui,sans-serif" font-size="24" fill="#475569">Powered by the official bpost API · No login required</text>
  <text x="520" y="390" font-family="ui-sans-serif,system-ui,sans-serif" font-size="24" fill="#475569">Single-page app — works instantly from any browser</text>

  <line x1="520" y1="420" x2="1140" y2="420" stroke="#e2e8f0" stroke-width="1.5"/>

  <rect x="520" y="444" width="168" height="40" rx="20" fill="#ffeaeb"/>
  <text x="604" y="470" font-family="ui-sans-serif,system-ui,sans-serif" font-size="17" font-weight="600" fill="#e3000f" text-anchor="middle">Cloudflare Workers</text>

  <rect x="704" y="444" width="128" height="40" rx="20" fill="#f1f5f9"/>
  <text x="768" y="470" font-family="ui-sans-serif,system-ui,sans-serif" font-size="17" font-weight="600" fill="#475569" text-anchor="middle">Tailwind CSS</text>

  <rect x="848" y="444" width="112" height="40" rx="20" fill="#f1f5f9"/>
  <text x="904" y="470" font-family="ui-sans-serif,system-ui,sans-serif" font-size="17" font-weight="600" fill="#475569" text-anchor="middle">Leaflet Maps</text>

  <rect x="976" y="444" width="112" height="40" rx="20" fill="#f1f5f9"/>
  <text x="1032" y="470" font-family="ui-sans-serif,system-ui,sans-serif" font-size="17" font-weight="600" fill="#475569" text-anchor="middle">Open Source</text>
</svg>`;
}

function buildTrackingCard(itemIdentifier, stage, lastEvent) {
  const safeId    = x(trunc(itemIdentifier, 36));
  const safeStage = x(trunc(stage, 40));
  const safeEvent = x(trunc(lastEvent, 55));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#f8fafc"/>
  <rect width="8" height="630" fill="#e3000f"/>
  <line x1="460" y1="100" x2="460" y2="530" stroke="#e2e8f0" stroke-width="2"/>

  ${logoSvg(230, 240)}
  <text x="230" y="336" font-family="ui-sans-serif,system-ui,sans-serif" font-size="22" font-weight="700" fill="#0f172a" text-anchor="middle">bpost</text>
  <text x="230" y="364" font-family="ui-sans-serif,system-ui,sans-serif" font-size="22" font-weight="300" fill="#94a3b8" text-anchor="middle">tracker</text>

  <!-- Tracking number -->
  <text x="520" y="188" font-family="ui-sans-serif,system-ui,sans-serif" font-size="16" font-weight="700" letter-spacing="4" fill="#94a3b8">TRACKING NUMBER</text>
  <text x="520" y="248" font-family="ui-monospace,monospace" font-size="44" font-weight="800" fill="#0f172a">${safeId}</text>

  <line x1="520" y1="272" x2="1140" y2="272" stroke="#e2e8f0" stroke-width="1.5"/>

  <!-- Current stage -->
  <text x="520" y="320" font-family="ui-sans-serif,system-ui,sans-serif" font-size="16" font-weight="700" letter-spacing="4" fill="#94a3b8">CURRENT STAGE</text>
  <rect x="518" y="332" width="620" height="56" rx="12" fill="#ffeaeb"/>
  <text x="540" y="370" font-family="ui-sans-serif,system-ui,sans-serif" font-size="30" font-weight="700" fill="#e3000f">${safeStage}</text>

  <line x1="520" y1="408" x2="1140" y2="408" stroke="#e2e8f0" stroke-width="1.5"/>

  <!-- Latest event -->
  <text x="520" y="450" font-family="ui-sans-serif,system-ui,sans-serif" font-size="16" font-weight="700" letter-spacing="4" fill="#94a3b8">LATEST UPDATE</text>
  <text x="520" y="502" font-family="ui-sans-serif,system-ui,sans-serif" font-size="30" fill="#475569">${safeEvent || '—'}</text>
</svg>`;
}

// ── CORS proxy ────────────────────────────────────────────────────────────────

async function handleProxy(request, url) {
  const target = url.searchParams.get('url');
  if (!target) return jsonError('Missing required ?url= parameter', 400);

  let targetUrl;
  try {
    targetUrl = new URL(decodeURIComponent(target));
  } catch {
    return jsonError('Invalid URL supplied', 400);
  }

  if (!targetUrl.origin.startsWith(ALLOWED_ORIGIN)) {
    return jsonError(`Proxy only allowed for ${ALLOWED_ORIGIN}`, 403);
  }

  if (request.method !== 'GET') return jsonError('Only GET requests are supported', 405);

  let upstream;
  try {
    upstream = await fetch(targetUrl.toString(), {
      headers: { Accept: 'application/json', 'User-Agent': 'BpostTracker/1.0' },
    });
  } catch (err) {
    return jsonError('Failed to reach bpost API: ' + err.message, 502);
  }

  const body    = await upstream.arrayBuffer();
  const headers = new Headers(upstream.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  headers.set('Cache-Control', 'no-store');

  return new Response(body, { status: upstream.status, headers });
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
