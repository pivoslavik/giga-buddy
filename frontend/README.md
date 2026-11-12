# AI Buddy — frontend

React 19 + TypeScript + Vite, routing on TanStack Router, server state on TanStack Query.

## Getting started

```bash
npm ci
npm run dev
```

The dev server proxies `/api` to `API_PROXY_TARGET` (`http://localhost` by default, which is nginx
from `docker compose up`). To work against a backend started locally, create `.env.local`:

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

Sessions are kept in memory until the dev server restarts; log out from the avatar menu in the
header. The mock is never part of the production build.

## Scripts

| Command            | What it does                                  |
| ------------------ | --------------------------------------------- |
| `npm run dev`      | dev server with HMR                           |
| `npm run dev:mock` | dev server with the mock API instead of proxy |
| `npm run build`    | type-check and production build into `dist/`  |
| `npm run lint`     | ESLint                                        |
| `npm run format`   | Prettier                                      |
| `npm test`         | unit tests (Vitest + Testing Library, jsdom)  |
| `npm run coverage` | tests with coverage, fails below 80% of lines |

The HTML coverage report is written to `coverage/index.html`.

## Structure

```
src/
  router.ts        routes and session guards
  pages/           route components (landing, home, ...) and the layout of the app pages
  widgets/         blocks shared by pages: the header
  features/        user scenarios (auth, ...)
  entities/        domain data and its queries (session, ...)
  shared/api/      fetch wrapper for the backend
  shared/ui/       reusable components: Button, Modal, Logo, Avatar, PageTitle, icons
  index.css        design tokens and global styles
```

## Auth and routing

The backend keeps the session in httpOnly cookies, so the frontend learns about it from
`GET /api/user`: a user means a session, `401`/`403` (or an unavailable backend) means a guest.

- `/welcome` — landing page for guests; users with a session are redirected to `/`.
- every other page lives under the pathless `authenticated` route, which sends guests to `/welcome`
  and renders the page under the app header (`/`, `/profile`, `/chat`).

The login modal on the landing page sends `{ "username", "password" }` to `POST /api/auth/login`.
When the backend accepts them, the session is re-read and the user lands on `/`; `400`/`401` is
shown as wrong credentials, anything else as "try again later".

"Выйти из аккаунта" in the avatar menu of the header sends `POST /api/auth/logout`: only the
backend can expire the httpOnly cookies. The session is re-read, and once it is gone the user lands
on `/welcome`; if it is still there, the menu says logging out failed.

After logging in or out, call `refetchSession(queryClient)` so the guards see the new state.
Invalidating the query is not enough: the guards use `ensureQueryData`, which keeps returning the
cached value of a query nothing subscribes to.
