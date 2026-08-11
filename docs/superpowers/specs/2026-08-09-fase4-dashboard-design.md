# Fase 4 — Dashboard (React + Vite + Recharts)

Status: Approved, pending implementation plan
Date: 2026-08-09

## Overview

NicheRadar's backend (Fases 1-3) is complete: multi-user auth, JWT cookie
sessions, and CRUD for tracked keywords. This phase builds the web
dashboard that lets a user register/log in, manage their tracked keywords,
and see the Google Trends data already being collected for them
(historical interest over time + rising related queries), as charts.

This is the last functional phase before deploy (Fase 5). Scope is fixed
by `CLAUDE.md`'s roadmap — no platform/feature expansion beyond what's
described here.

## Goals

- A user can register, log in, and log out from the dashboard itself (not
  just via Postman).
- A logged-in user can add, list, and delete their own tracked keywords.
- For each tracked keyword, the user can see its trend history (line
  chart) and rising related queries, for a selected region.
- The whole flow (register → login → manage keywords → view trends →
  logout) is demoable end-to-end for a portfolio/interview walkthrough.

## Non-goals (explicitly out of scope for this phase)

- Automated frontend tests (Vitest is not installed yet; verification is
  manual in-browser for this phase, per `CLAUDE.md`'s testing status).
- CORS configuration for production, Helmet, API rate limiting — these
  stay scheduled for Fase 5 (pre-deploy security hardening), per
  `CLAUDE.md`. Local dev avoids needing CORS at all via a Vite proxy
  (see below).
- Any UI for choosing which regions to collect, scheduling collection, or
  triggering `npm run collect` from the browser — collection stays a
  manual CLI step (`npm run collect -- --geo=US`), unchanged.
- Updating `README.md`'s stale roadmap section, or recreating the missing
  `docs/adr/0001-overall-architecture.md` referenced by `CLAUDE.md` —
  noted as known gaps, addressed separately, not part of this phase.
- Removing the stray `cookies.txt` / `d` files tracked in git history —
  flagged separately, the user chose to defer this cleanup.

## Backend change required first

`src/routes/trends.route.ts` currently has the same bug the old
`GET /keywords` had before the Fase 3 CRUD work: `GET /trends` and
`GET /related` both run `db.select().from(keywords)` with no `userId`
filter, and neither route is behind `requireAuth`. Any client (even
logged out) can currently see every user's tracked keywords and trend
data through these two endpoints.

Fix, same pattern as `keywords.route.ts`:

- Add `trendsRouter.use(requireAuth)`.
- Filter `allKeywords` with `eq(keywords.userId, req.userId!)` in both
  handlers.

This must land before the dashboard consumes these endpoints, since the
dashboard assumes `/trends` and `/related` are already scoped to the
logged-in user.

## Frontend architecture

New `client/` directory at the repo root, with its own `package.json` —
fully independent from the backend's dependencies and build (no npm
workspaces). Stack: React + Vite + TypeScript + Tailwind CSS + Recharts +
`react-router-dom`.

```
client/
  src/
    main.tsx              # entry point, mounts <App /> inside BrowserRouter
    App.tsx                # route definitions
    context/
      AuthContext.tsx      # current user (GET /api/auth/me on mount), login(), logout()
    lib/
      api.ts               # fetch wrapper: credentials: "include", base "/api", typed errors
    pages/
      LoginPage.tsx
      RegisterPage.tsx
      DashboardPage.tsx    # protected
    components/
      ProtectedRoute.tsx   # redirects to /login when AuthContext user is null
      Navbar.tsx            # shows logged-in email + logout button
      GeoInput.tsx            # free-text geo code input (e.g. "US"; empty = worldwide), drives the DashboardPage query
      KeywordForm.tsx        # term + category inputs, POST /api/keywords
      KeywordList.tsx        # list + delete button per keyword, DELETE /api/keywords/:id
      TrendChart.tsx         # Recharts LineChart for one keyword's timeline
      RelatedQueriesList.tsx # rising related queries for one keyword
  vite.config.ts           # dev proxy: "/api" -> "http://localhost:3000"
  tailwind.config.js
  package.json             # react, react-dom, react-router-dom, recharts, tailwindcss, vite, typescript
```

State management: `AuthContext` is the only cross-cutting state (who's
logged in). Every page fetches and owns its own data locally via
`useState`/`useEffect` plus `lib/api.ts` — no external state/data-fetching
library (e.g. no TanStack Query). This matches the project's size: a
handful of screens, no cross-screen caching need.

Dev connectivity: Vite's dev server proxies `/api/*` to
`http://localhost:3000`, so the browser sees every request as
same-origin. This means the httpOnly session cookie works in dev without
any CORS configuration on the Express side — that configuration is
deferred to Fase 5, where it'll target the real production origin.

## Screens and data flow

**App bootstrap (`AuthContext`):** on mount, calls `GET /api/auth/me`. A
200 populates the current user in context; a 401 leaves it `null`. There
is no separate "am I logged in" flag stored client-side (e.g. in
localStorage) — the httpOnly cookie is the single source of truth, and
the frontend simply asks the backend on load. `ProtectedRoute` reads this
context and redirects to `/login` when there's no user.

**LoginPage / RegisterPage:** controlled form (email + password) posting
to `/api/auth/login` or `/api/auth/register` via `lib/api.ts`. On success,
the returned user populates `AuthContext` and the app navigates to
`/dashboard`. On 400/401/409, the backend's own error message is shown
inline below the form.

**DashboardPage (protected):** on mount, fetches `GET /api/keywords`,
`GET /api/trends?geo=...`, and `GET /api/related?geo=...` in parallel, for
a `geo` value typed into `GeoInput` (default `""` = worldwide, matching
the default used by `npm run collect`). There is no backend endpoint
listing which geos have data — `GeoInput` is a plain text field, not a
dynamically populated dropdown, so introducing one stays out of scope for
this phase. `/api/keywords` is the source
of truth for "what keywords exist"; the trend timeline and related
queries for each keyword are looked up from the other two responses by
`keywordId`. A keyword with no collected data yet (e.g. just created, not
yet run through `npm run collect`) renders an empty state ("No data yet —
run collection") in `TrendChart`/`RelatedQueriesList`, not an error.

`KeywordForm` triggers a `GET /api/keywords` refetch after a successful
create; `KeywordList` does the same after a successful delete. No shared
cache — each action simply re-fetches the list it affects.

**Error handling:** `lib/api.ts` centralizes response handling — any
non-OK response throws a typed error carrying the HTTP `status` and the
backend's `error` field. A 401 from any call (session expired mid-session)
clears `AuthContext` and redirects to `/login`. 400/409 errors render
inline in the component that made the call (e.g. the keyword-duplicate
409 message). A 500 renders a generic banner ("Algo salió mal, intenta de
nuevo") — the backend's centralized error handler already never leaks
internal details, and the frontend doesn't try to parse or display
anything beyond the generic message for that case.

**Testing/verification:** no Vitest yet, so verification for this phase
is manual: run both dev servers (`npm run dev` at the repo root for the
API, `npm run dev` inside `client/` for the dashboard) and walk the full
flow in-browser — register → login → create keyword → view chart/related
queries → delete keyword → logout — before considering the phase done.
