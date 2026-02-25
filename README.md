# bpost-tracker

A live Bpost package tracker, self-hosted on **Cloudflare Workers**. The Worker serves the frontend and acts as a built-in CORS proxy for the bpost tracking API — no third-party proxy service needed.

## How it works

| Path | What happens |
|---|---|
| `GET /` | Serves `public/index.html` (static asset) |
| `GET /proxy?url=<encoded>` | Worker fetches the bpost API URL server-side and adds CORS headers |

The proxy only forwards requests to `https://track.bpost.cloud` — any other origin is blocked with a `403`.

---

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier is fine)

---

## Getting started

```bash
# 1. Clone the repo
git clone https://github.com/<your-username>/bpost-tracker.git
cd bpost-tracker

# 2. Install dependencies (just Wrangler)
npm install

# 3. Log in to Cloudflare
npx wrangler login

# 4. Run locally
npm run dev
# → http://localhost:8787

# 5. Deploy to Cloudflare
npm run deploy
```

After deploying, Cloudflare will print your public URL (e.g. `https://bpost-tracker.<your-subdomain>.workers.dev`).

---

## Project structure

```
bpost-tracker/
├── public/
│   └── index.html      # The frontend (Tailwind + Leaflet single-page app)
├── src/
│   └── worker.js       # Cloudflare Worker (proxy + static asset fallback)
├── wrangler.toml       # Wrangler / Worker configuration
├── package.json
└── .gitignore
```

---

## Custom domain (optional)

1. In the [Cloudflare dashboard](https://dash.cloudflare.com/), go to **Workers & Pages → bpost-tracker → Settings → Triggers**.
2. Click **Add Custom Domain** and follow the prompts.
