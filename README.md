# Big Star VDP — Web client

React app (Create React App) for the Big Star VDP Management System: the admin screens and the
provider portal. It only displays data; every calculation happens in the API (`../server`).

## Setup

```bash
npm install
cp .env.example .env   # first time only
npm start              # http://localhost:3000
```

The API must be running (see `../server/README.md`).

## Environment

The backend location is read from `client/.env`; nothing is hardcoded in the source.

| Variable | Example | Purpose |
|---|---|---|
| `REACT_APP_API_URL` | `http://localhost:5000` | Backend base URL, **without** `/api`. Leave empty to call the same origin the app is served from. |

* `.env` is git-ignored; commit changes to `.env.example` instead.
* Values are baked in when `npm start` or `npm run build` runs. Restart the dev server or rebuild
  after changing them.
* The API must allow this client's origin: set `CLIENT_ORIGIN` in `server/.env` to the address the
  client is served from (e.g. `http://localhost:3000`).

## Scripts

| Command | Purpose |
|---|---|
| `npm start` | Dev server on http://localhost:3000 with live reload |
| `npm run build` | Production build into `build/` |
| `npm test` | Test runner in watch mode |

## Deploying

**Served by the API (simplest).** Leave `REACT_APP_API_URL` empty and run `npm run build`. The API
serves `client/build` on its own port, so the client and API share an origin.

**Hosted separately** (another host, CDN, etc.):

1. Set `REACT_APP_API_URL` to the public API URL (e.g. `https://api.example.com`), then `npm run build`.
2. Serve `build/` as a single-page app (unknown paths fall back to `index.html`).
3. In `server/.env`, add the client's address to `CLIENT_ORIGIN`. If the client is on a different
   site than the API, also set `COOKIE_SAME_SITE=none`; both must then be served over HTTPS.

## Layout

| Path | Contents |
|---|---|
| `src/api.js` | Fetch wrapper: API base URL, session cookie, errors, file downloads |
| `src/pages/` | Screens (Dashboard, Cycles, Processing, VDP review, Reports, Portal, …) |
| `src/components/` | Shared components |
