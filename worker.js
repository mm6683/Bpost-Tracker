/**
 * Bpost Live Tracker — Cloudflare Worker
 *
 * Routes:
 *   GET /proxy?url=<encoded-url>  →  CORS proxy for bpost track.bpost.cloud API
 *   Everything else               →  Served from the ./public static assets directory
 */

// Only allow proxying to the bpost tracking API
const ALLOWED_ORIGIN = 'https://track.bpost.cloud';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── CORS proxy route ─────────────────────────────────────────────────────
    if (url.pathname === '/proxy') {
      return handleProxy(request, url);
    }

    // ── Static assets (index.html etc.) ─────────────────────────────────────
    return env.ASSETS.fetch(request);
  },
};

async function handleProxy(request, url) {
  const target = url.searchParams.get('url');

  // Basic validation
  if (!target) {
    return jsonError('Missing required ?url= parameter', 400);
  }

  let targetUrl;
  try {
    targetUrl = new URL(decodeURIComponent(target));
  } catch {
    return jsonError('Invalid URL supplied', 400);
  }

  // Restrict proxy to the bpost tracking API only
  if (!targetUrl.origin.startsWith(ALLOWED_ORIGIN)) {
    return jsonError(`Proxy only allowed for ${ALLOWED_ORIGIN}`, 403);
  }

  // Only allow GET
  if (request.method !== 'GET') {
    return jsonError('Only GET requests are supported', 405);
  }

  let upstream;
  try {
    upstream = await fetch(targetUrl.toString(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'BpostTracker/1.0',
      },
    });
  } catch (err) {
    return jsonError('Failed to reach bpost API: ' + err.message, 502);
  }

  // Clone response and attach CORS headers
  const body = await upstream.arrayBuffer();
  const headers = new Headers(upstream.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  headers.set('Cache-Control', 'no-store');

  return new Response(body, {
    status: upstream.status,
    headers,
  });
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
