# AI Buddy — frontend

React 19 + TypeScript + Vite, routing on TanStack Router, server state on TanStack Query.

## Getting started

```bash
npm ci
npm run dev
```

The frontend calls the API on its own origin, and every `/api/*` request is proxied to the backend
with its method, path, query, headers, cookies and body:

- `npm run dev` and `npm run preview` proxy it to `API_PROXY_TARGET` (`http://localhost` by
  default, which is nginx from `docker compose up`). They add `X-Forwarded-*` headers and drop the
  `Domain` of the cookies the backend sets, so the browser keeps them for the dev host.
- in docker compose and production, nginx ([nginx/default.conf](../nginx/default.conf)) proxies it
  to `backend:8080` and passes the address of the browser in `X-Real-IP` and `X-Forwarded-For`.

To work against a backend started locally, create `.env.local`:

```bash
API_PROXY_TARGET=http://localhost:8080
```

See [.env.example](.env.example) for all variables. `VITE_API_URL` is only needed when the static
frontend is hosted on another origin than the API.

### Without a backend

`npm run dev:mock` starts the same dev server, but `/api` is answered by a fake backend from
[mock/mockApi.ts](mock/mockApi.ts) instead of the proxy, so the whole login flow works without
docker compose:

| Login    | Password | Result                                         |
| -------- | -------- | ---------------------------------------------- |
| `intern` | `secret` | logs in as «Аня» and opens the main page       |
| `down`   | any      | the backend fails with `500`                   |
| other    | any      | `400`, the form says the credentials are wrong |

Sessions are kept in memory until the dev server restarts. There is no logout button yet, so open
`/api/mock/logout` to become a guest again. The mock is never part of the production build.

## Scripts

| Command            | What it does                                  |
| ------------------ | --------------------------------------------- |
| `npm run dev`      | dev server with HMR                           |
| `npm run dev:mock` | dev server with the mock API instead of proxy |
| `npm run build`    | type-check and production build into `dist/`  |
| `npm run preview`  | serves `dist/` with the same `/api` proxy     |
| `npm run lint`     | ESLint                                        |
| `npm run format`   | Prettier                                      |
| `npm test`         | unit tests (Vitest + Testing Library, jsdom)  |
| `npm run coverage` | tests with coverage, fails below 80% of lines |

The HTML coverage report is written to `coverage/index.html`.

## Structure

```
src/
  router.ts        routes and session guards
  pages/           route components (landing, home, ...)
  features/        user scenarios (auth, ...)
  entities/        domain data and its queries (session, ...)
  shared/api/      fetch wrapper for the backend
  shared/ui/       reusable components: Button, Modal, Logo, icons
  index.css        design tokens and global styles
```

## Auth and routing

The backend keeps the session in httpOnly cookies, so the frontend learns about it from
`GET /api/user`: a user means a session, `401`/`403` (or an unavailable backend) means a guest.

- `/welcome` — landing page for guests; users with a session are redirected to `/`.
- every other page lives under the pathless `authenticated` route, which sends guests to `/welcome`.

The login modal on the landing page sends `{ "username", "password" }` to `POST /api/auth/login`.
When the backend accepts them, the session is re-read and the user lands on `/`; `400`/`401` is
shown as wrong credentials, anything else as "try again later".

After logging in or out, call `refetchSession(queryClient)` so the guards see the new state.
Invalidating the query is not enough: the guards use `ensureQueryData`, which keeps returning the
cached value of a query nothing subscribes to.
