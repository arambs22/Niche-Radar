# Fase 4 — Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the React + Vite dashboard (register/login, keyword CRUD, trend charts) described in `docs/superpowers/specs/2026-08-09-fase4-dashboard-design.md`, and fix the pre-existing auth gap in `/api/trends` and `/api/related` that the dashboard depends on.

**Architecture:** A standalone `client/` Vite + React + TypeScript app talks to the existing Express API through a Vite dev-server proxy (`/api/*` → `http://localhost:3000`), so the httpOnly session cookie works without CORS. `AuthContext` is the only cross-cutting client state; every page fetches its own data with `useState`/`useEffect` through a small typed `lib/api.ts` fetch wrapper.

**Tech Stack:** React 18, Vite 5, TypeScript 5, Tailwind CSS 3, react-router-dom 6, Recharts 2.

## Global Constraints

- Comments are English, JSDoc-style on exported functions/components — never conversational or tutorial-style (`CLAUDE.md` rule 7).
- Commits follow Conventional Commits (`feat:`, `fix:`, `chore:`) (`CLAUDE.md` rule 8).
- No automated frontend tests this phase (no Vitest installed yet) — verification is `npx tsc --noEmit` for logic-only files, and a manual browser walkthrough for anything user-visible, matching how the backend CRUD work in this same session was verified.
- No CORS/Helmet/rate-limiting work — out of scope, deferred to Fase 5 per the spec's Non-goals.
- No npm workspaces — `client/` has its own independent `package.json`.
- No new backend endpoints beyond the Task 1 fix — the geo selector is a free-text input, not backed by a new "list collected geos" endpoint.

---

### Task 1: Scope `/api/trends` and `/api/related` to the authenticated user

**Files:**
- Modify: `src/routes/trends.route.ts` (entire file)

**Interfaces:**
- Consumes: `requireAuth` from `src/middleware/auth.middleware.ts` (existing — `(req, res, next) => void`, sets `req.userId: number` on success, responds 401 otherwise).
- Produces: `GET /api/trends?geo=` and `GET /api/related?geo=` now require a valid session and only return the calling user's keywords. Response shapes are unchanged (`{id, term, category, timeline: [{date, value}]}[]` and `{id, term, category, rising: [{query, growthValue}]}[]`) — the dashboard tasks (Task 6) rely on these exact shapes.

- [ ] **Step 1: Replace the file with the auth-scoped version**

```ts
import { Router } from "express";
import { db } from "../db/client.js";
import { keywords, trendSnapshots, relatedQueries } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.middleware.js";

export const trendsRouter = Router();

trendsRouter.use(requireAuth);

/**
 * GET /api/trends?geo=US
 * Returns the snapshot history for the authenticated user's keywords for
 * a given country (or worldwide if geo is omitted), grouped by keyword.
 */
trendsRouter.get("/trends", async (req, res, next) => {
  try {
    const geo = typeof req.query.geo === "string" ? req.query.geo : "";

    const allKeywords = await db
      .select()
      .from(keywords)
      .where(eq(keywords.userId, req.userId!));
    const allSnapshots = await db
      .select()
      .from(trendSnapshots)
      .where(eq(trendSnapshots.geo, geo))
      .orderBy(trendSnapshots.date);

    const result = allKeywords.map((kw) => ({
      id: kw.id,
      term: kw.term,
      category: kw.category,
      timeline: allSnapshots
        .filter((s) => s.keywordId === kw.id)
        .map((s) => ({ date: s.date, value: s.value })),
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/related?geo=US
 * Returns rising related queries grouped by keyword, for the
 * authenticated user's keywords in a given country (or worldwide if geo
 * is omitted).
 */
trendsRouter.get("/related", async (req, res, next) => {
  try {
    const geo = typeof req.query.geo === "string" ? req.query.geo : "";

    const allKeywords = await db
      .select()
      .from(keywords)
      .where(eq(keywords.userId, req.userId!));
    const allRelated = await db
      .select()
      .from(relatedQueries)
      .where(eq(relatedQueries.geo, geo))
      .orderBy(desc(relatedQueries.collectedAt));

    const result = allKeywords
      .map((kw) => ({
        id: kw.id,
        term: kw.term,
        category: kw.category,
        rising: allRelated
          .filter((r) => r.keywordId === kw.id)
          .map((r) => ({ query: r.query, growthValue: r.growthValue })),
      }))
      .filter((kw) => kw.rising.length > 0);

    res.json(result);
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification (Postman)**

Without the session cookie (new/unauthenticated request): `GET http://localhost:3000/api/trends` → expect `401`.
With the session cookie from a logged-in user: `GET http://localhost:3000/api/trends?geo=` → expect `200` and only that user's keywords in the array (compare against `GET /api/keywords` for the same user).

- [ ] **Step 4: Commit**

```bash
git add src/routes/trends.route.ts
git commit -m "fix: scope /api/trends and /api/related to the authenticated user"
```

---

### Task 2: Scaffold the `client/` Vite + React + TypeScript + Tailwind app

**Files:**
- Create: `client/` (via `create-vite`, template `react-ts`)
- Modify: `client/vite.config.ts`
- Modify: `client/src/App.tsx`
- Modify: `client/src/index.css`
- Delete: `client/.gitignore` (redundant — the repo root `.gitignore` already ignores `node_modules/` and `dist/` at any depth)
- Create: `client/tailwind.config.cjs`
- Create: `client/postcss.config.cjs`

**Interfaces:**
- Produces: a running Vite dev server on port 5173 proxying `/api/*` to `http://localhost:3000`, with Tailwind utility classes available in any `.tsx` file. Later tasks add files under `client/src/`.

- [ ] **Step 1: Scaffold the Vite project**

Run from the repo root:
```bash
npx --yes create-vite@latest client --template react-ts
cd client
npm install
```

- [ ] **Step 2: Install runtime and dev dependencies**

Run inside `client/`:
```bash
npm install react-router-dom recharts
npm install -D tailwindcss@3 postcss autoprefixer
npx tailwindcss init -p
```

- [ ] **Step 3: Rename the generated Tailwind/PostCSS configs to `.cjs`**

`create-vite`'s `react-ts` template sets `"type": "module"` in `client/package.json`; `tailwindcss init -p` generates `module.exports`-style config files, which need the `.cjs` extension to be loaded correctly under an ESM package.

Run inside `client/`:
```bash
mv tailwind.config.js tailwind.config.cjs
mv postcss.config.js postcss.config.cjs
```

- [ ] **Step 4: Set Tailwind's content paths**

Replace `client/tailwind.config.cjs` with:

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

- [ ] **Step 5: Enable Tailwind in the global stylesheet**

Replace the entire contents of `client/src/index.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 6: Configure the dev proxy to the backend**

Replace `client/vite.config.ts` with:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 7: Replace the default demo page**

Replace `client/src/App.tsx` with a minimal placeholder that proves React + Tailwind are wired correctly (Task 4 replaces this with real routing):

```tsx
export default function App() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <h1 className="text-2xl font-semibold text-slate-800">
        NicheRadar — client scaffold ready
      </h1>
    </div>
  );
}
```

- [ ] **Step 8: Remove the redundant nested `.gitignore`**

`create-vite` generates its own `client/.gitignore` with `node_modules`/`dist` entries already covered by the repo root's `.gitignore` (unanchored patterns match at any depth). Delete it to avoid two inconsistent ignore files:

```bash
rm client/.gitignore
```

- [ ] **Step 9: Verify the scaffold in the browser**

Run inside `client/`: `npm run dev`
Expected: dev server starts on `http://localhost:5173`; opening it in a browser shows "NicheRadar — client scaffold ready" styled with a light gray background and centered bold text (confirms Tailwind is active).

- [ ] **Step 10: Verify the dev proxy**

With the backend running (`npm run dev` from the repo root, port 3000) and the client dev server still running from Step 9, in another terminal:
```bash
curl http://localhost:5173/api/health
```
Expected: the same JSON the backend's `/health` returns directly (`{"status":"ok",...}`), proving Vite is forwarding `/api/*` to the backend.

- [ ] **Step 11: Commit**

```bash
git add client/
git commit -m "chore: scaffold client/ (Vite + React + TypeScript + Tailwind)"
```

---

### Task 3: Shared types and the API client

**Files:**
- Create: `client/src/lib/types.ts`
- Create: `client/src/lib/api.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure, standalone module).
- Produces:
  - `types.ts` exports: `User { id: number; email: string }`, `Keyword { id: number; userId: number; term: string; category: string; createdAt: string }`, `TrendPoint { date: string; value: number }`, `KeywordTrend { id: number; term: string; category: string; timeline: TrendPoint[] }`, `RelatedQuery { query: string; growthValue: string }`, `KeywordRelated { id: number; term: string; category: string; rising: RelatedQuery[] }`.
  - `api.ts` exports: `ApiError` class (`.status: number`, `.body: ApiErrorBody`), `formatApiError(error: ApiErrorBody["error"]): string`, and `api` object with `get<T>(path)`, `post<T>(path, data)`, `delete<T>(path)`, each returning `Promise<T>` and throwing `ApiError` on non-OK responses. All requests send `credentials: "include"` and prefix `path` with `/api`.

- [ ] **Step 1: Create the shared response types**

`client/src/lib/types.ts`:

```ts
export interface User {
  id: number;
  email: string;
}

export interface Keyword {
  id: number;
  userId: number;
  term: string;
  category: string;
  createdAt: string;
}

export interface TrendPoint {
  date: string;
  value: number;
}

export interface KeywordTrend {
  id: number;
  term: string;
  category: string;
  timeline: TrendPoint[];
}

export interface RelatedQuery {
  query: string;
  growthValue: string;
}

export interface KeywordRelated {
  id: number;
  term: string;
  category: string;
  rising: RelatedQuery[];
}
```

- [ ] **Step 2: Create the API client**

`client/src/lib/api.ts`:

```ts
export interface ApiErrorBody {
  error: string | Record<string, string[] | undefined>;
}

/** Thrown by `api.*` calls when the backend responds with a non-2xx status. */
export class ApiError extends Error {
  status: number;
  body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(typeof body.error === "string" ? body.error : "Solicitud inválida");
    this.status = status;
    this.body = body;
  }
}

/** Flattens a backend error (a plain string, or a Zod fieldErrors object) into one display string. */
export function formatApiError(error: ApiErrorBody["error"]): string {
  if (typeof error === "string") return error;
  return Object.values(error)
    .flat()
    .filter((msg): msg is string => Boolean(msg))
    .join(" ");
}

const BASE_URL = "/api";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const body = await res.json();

  if (!res.ok) {
    throw new ApiError(res.status, body as ApiErrorBody);
  }

  return body as T;
}

/** Thin typed wrapper around fetch for the NicheRadar API, scoped to /api and cookie-authenticated. */
export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, data: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(data) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
```

- [ ] **Step 3: Type-check**

Run inside `client/`: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/
git commit -m "feat: add typed API client and shared response types"
```

---

### Task 4: Auth context, protected routing, login/register, dashboard shell

**Files:**
- Create: `client/src/context/AuthContext.tsx`
- Create: `client/src/components/ProtectedRoute.tsx`
- Create: `client/src/components/Navbar.tsx`
- Create: `client/src/pages/LoginPage.tsx`
- Create: `client/src/pages/RegisterPage.tsx`
- Create: `client/src/pages/DashboardPage.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes: `api`, `ApiError`, `formatApiError` from `client/src/lib/api.ts`; `User` from `client/src/lib/types.ts` (Task 3).
- Produces: `AuthProvider` (wraps the app), `useAuth(): { user: User | null; loading: boolean; login(email, password): Promise<void>; register(email, password): Promise<void>; logout(): Promise<void> }` — consumed by Task 5 and Task 6's `DashboardPage` rewrites and by `Navbar`. Routes `/login`, `/register`, `/dashboard` (protected), `/` (redirects to `/dashboard`).

- [ ] **Step 1: Create the auth context**

`client/src/context/AuthContext.tsx`:

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import type { User } from "../lib/types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Loads the current session on mount (GET /api/auth/me) and exposes auth actions to the whole app. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<User>("/auth/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const loggedInUser = await api.post<User>("/auth/login", { email, password });
    setUser(loggedInUser);
  }

  async function register(email: string, password: string) {
    const newUser = await api.post<User>("/auth/register", { email, password });
    setUser(newUser);
  }

  async function logout() {
    await api.post("/auth/logout", {});
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Reads the current auth state; must be used within an AuthProvider. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
```

- [ ] **Step 2: Create the protected route wrapper**

`client/src/components/ProtectedRoute.tsx`:

```tsx
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/** Renders nested routes only for a logged-in user; otherwise redirects to /login. */
export function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return <p className="p-6 text-slate-500">Cargando...</p>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
```

- [ ] **Step 3: Create the navbar**

`client/src/components/Navbar.tsx`:

```tsx
import { useAuth } from "../context/AuthContext";

/** Top bar for authenticated pages: shows the logged-in email and a logout button. */
export function Navbar() {
  const { user, logout } = useAuth();

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
      <span className="font-semibold text-slate-800">NicheRadar</span>
      <div className="flex items-center gap-4 text-sm text-slate-600">
        <span>{user?.email}</span>
        <button
          onClick={() => logout()}
          className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50"
        >
          Cerrar sesión
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Create the login page**

`client/src/pages/LoginPage.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError, formatApiError } from "../lib/api";

/** Email/password login form; on success redirects to /dashboard. */
export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? formatApiError(err.body.error) : "Algo salió mal, intenta de nuevo");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-lg bg-white p-8 shadow">
        <h1 className="text-xl font-semibold text-slate-800">Iniciar sesión</h1>
        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-slate-800 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Entrando..." : "Entrar"}
        </button>
        <p className="text-center text-sm text-slate-500">
          ¿No tienes cuenta? <Link to="/register" className="text-slate-800 underline">Regístrate</Link>
        </p>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Create the register page**

`client/src/pages/RegisterPage.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError, formatApiError } from "../lib/api";

/** Email/password registration form; on success redirects to /dashboard. */
export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? formatApiError(err.body.error) : "Algo salió mal, intenta de nuevo");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-lg bg-white p-8 shadow">
        <h1 className="text-xl font-semibold text-slate-800">Crear cuenta</h1>
        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-slate-400">Mínimo 8 caracteres.</p>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-slate-800 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Creando..." : "Crear cuenta"}
        </button>
        <p className="text-center text-sm text-slate-500">
          ¿Ya tienes cuenta? <Link to="/login" className="text-slate-800 underline">Inicia sesión</Link>
        </p>
      </form>
    </div>
  );
}
```

- [ ] **Step 6: Create the dashboard shell (stub — Task 5 and Task 6 build on this)**

`client/src/pages/DashboardPage.tsx`:

```tsx
import { Navbar } from "../components/Navbar";

/** Protected landing page after login. Task 5 adds keyword management; Task 6 adds charts. */
export function DashboardPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <p className="text-slate-500">Dashboard en construcción.</p>
      </main>
    </div>
  );
}
```

- [ ] **Step 7: Wire routing into App**

Replace `client/src/App.tsx` with:

```tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { DashboardPage } from "./pages/DashboardPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
          </Route>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
```

- [ ] **Step 8: Type-check**

Run inside `client/`: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 9: Manual verification in the browser**

With the backend running (`npm run dev` at the repo root) and the client running (`npm run dev` inside `client/`):
1. Visit `http://localhost:5173/` while logged out → redirected to `/login`.
2. Visit `/dashboard` directly while logged out → redirected to `/login`.
3. On `/register`, create a new account (or on `/login`, use an existing one, e.g. the account already tested via Postman earlier this session) → lands on `/dashboard` showing "Dashboard en construcción." and the Navbar with your email.
4. Click "Cerrar sesión" → returns to `/login`.

- [ ] **Step 10: Commit**

```bash
git add client/src/context/ client/src/components/ client/src/pages/ client/src/App.tsx
git commit -m "feat: add auth context, protected routing, login/register pages"
```

---

### Task 5: Keyword management UI (create, list, delete)

**Files:**
- Create: `client/src/components/KeywordForm.tsx`
- Create: `client/src/components/KeywordList.tsx`
- Modify: `client/src/pages/DashboardPage.tsx` (entire file)

**Interfaces:**
- Consumes: `api`, `ApiError`, `formatApiError` from `lib/api.ts`; `Keyword` from `lib/types.ts` (Task 3); `Navbar` from `components/Navbar.tsx` (Task 4).
- Produces: `KeywordForm({ onCreated: () => void })`, `KeywordList({ keywords: Keyword[]; onDeleted: () => void; selectedId: number | null; onSelect: (id: number) => void })` — `selectedId`/`onSelect` are consumed by Task 6 to know which keyword's chart to show.

- [ ] **Step 1: Create the keyword creation form**

`client/src/components/KeywordForm.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { api, ApiError, formatApiError } from "../lib/api";
import type { Keyword } from "../lib/types";

interface KeywordFormProps {
  onCreated: () => void;
}

/** Form to create a new tracked keyword; calls onCreated() after a successful POST. */
export function KeywordForm({ onCreated }: KeywordFormProps) {
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post<Keyword>("/keywords", {
        term,
        ...(category.trim() ? { category: category.trim() } : {}),
      });
      setTerm("");
      setCategory("");
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? formatApiError(err.body.error) : "Algo salió mal, intenta de nuevo");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 rounded-lg bg-white p-4 shadow">
      <div>
        <label className="block text-xs font-medium text-slate-700" htmlFor="term">Keyword</label>
        <input
          id="term"
          required
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="mt-1 rounded border border-slate-300 px-3 py-1.5 text-sm"
          placeholder="tarot card clipart"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700" htmlFor="category">Categoría (opcional)</label>
        <input
          id="category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="mt-1 rounded border border-slate-300 px-3 py-1.5 text-sm"
          placeholder="tarot"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-slate-800 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitting ? "Agregando..." : "Agregar"}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 2: Create the keyword list**

`client/src/components/KeywordList.tsx`:

```tsx
import { api } from "../lib/api";
import type { Keyword } from "../lib/types";

interface KeywordListProps {
  keywords: Keyword[];
  onDeleted: () => void;
  selectedId: number | null;
  onSelect: (id: number) => void;
}

/** Lists the user's tracked keywords; click to select, or delete individually. */
export function KeywordList({ keywords, onDeleted, selectedId, onSelect }: KeywordListProps) {
  async function handleDelete(id: number) {
    await api.delete(`/keywords/${id}`);
    onDeleted();
  }

  if (keywords.length === 0) {
    return <p className="text-sm text-slate-500">Todavía no trackeas ninguna keyword.</p>;
  }

  return (
    <ul className="divide-y divide-slate-200 rounded-lg bg-white shadow">
      {keywords.map((keyword) => (
        <li
          key={keyword.id}
          onClick={() => onSelect(keyword.id)}
          className={`flex cursor-pointer items-center justify-between px-4 py-3 ${
            selectedId === keyword.id ? "bg-slate-50" : ""
          }`}
        >
          <div>
            <p className="text-sm font-medium text-slate-800">{keyword.term}</p>
            <p className="text-xs text-slate-500">{keyword.category}</p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(keyword.id);
            }}
            className="text-xs text-red-500 hover:underline"
          >
            Borrar
          </button>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Wire keyword management into the dashboard**

Replace `client/src/pages/DashboardPage.tsx` with:

```tsx
import { useEffect, useState } from "react";
import { Navbar } from "../components/Navbar";
import { KeywordForm } from "../components/KeywordForm";
import { KeywordList } from "../components/KeywordList";
import { api } from "../lib/api";
import type { Keyword } from "../lib/types";

/** Protected landing page: keyword management. Task 6 adds trend charts alongside this. */
export function DashboardPage() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  function refetchKeywords() {
    return api.get<Keyword[]>("/keywords").then((res) => {
      setKeywords(res);
      return res;
    });
  }

  useEffect(() => {
    refetchKeywords().finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        <KeywordForm onCreated={refetchKeywords} />
        {loading ? (
          <p className="text-sm text-slate-500">Cargando keywords...</p>
        ) : (
          <KeywordList
            keywords={keywords}
            onDeleted={refetchKeywords}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

Run inside `client/`: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 5: Manual verification in the browser**

Logged in on `/dashboard`:
1. Add a keyword (e.g. term `tarot card clipart`, category `tarot`) → appears in the list.
2. Submit the same term again → inline `409` message ("Ya estás trackeando esa keyword"), list unchanged.
3. Click the keyword row → it highlights (selected state; no visible chart yet, that's Task 6).
4. Click "Borrar" → the keyword disappears from the list.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/KeywordForm.tsx client/src/components/KeywordList.tsx client/src/pages/DashboardPage.tsx
git commit -m "feat: add keyword create/list/delete UI to the dashboard"
```

---

### Task 6: Trend charts, related queries, and geo selection

**Files:**
- Create: `client/src/components/GeoInput.tsx`
- Create: `client/src/components/TrendChart.tsx`
- Create: `client/src/components/RelatedQueriesList.tsx`
- Modify: `client/src/pages/DashboardPage.tsx` (entire file)

**Interfaces:**
- Consumes: `api` from `lib/api.ts`; `Keyword`, `KeywordTrend`, `KeywordRelated`, `TrendPoint`, `RelatedQuery` from `lib/types.ts` (Task 3); `Navbar`, `KeywordForm`, `KeywordList` and their existing props (Task 4, Task 5).
- Produces: complete `DashboardPage` — this is the final version for this phase.

- [ ] **Step 1: Create the geo input**

`client/src/components/GeoInput.tsx`:

```tsx
interface GeoInputProps {
  value: string;
  onChange: (geo: string) => void;
}

/** Free-text region code input (e.g. "US"); empty means worldwide, matching `npm run collect`'s default. */
export function GeoInput({ value, onChange }: GeoInputProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700" htmlFor="geo">Región (geo)</label>
      <input
        id="geo"
        value={value}
        onChange={(e) => onChange(e.target.value.trim().toUpperCase())}
        placeholder="US (vacío = worldwide)"
        className="mt-1 w-48 rounded border border-slate-300 px-3 py-1.5 text-sm"
      />
    </div>
  );
}
```

- [ ] **Step 2: Create the trend chart**

`client/src/components/TrendChart.tsx`:

```tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { TrendPoint } from "../lib/types";

interface TrendChartProps {
  timeline: TrendPoint[];
}

/** Line chart of a single keyword's Google Trends interest-over-time. */
export function TrendChart({ timeline }: TrendChartProps) {
  if (timeline.length === 0) {
    return <p className="text-sm text-slate-500">Sin datos aún — corre la recolección.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={timeline}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Line type="monotone" dataKey="value" stroke="#1e293b" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: Create the related queries list**

`client/src/components/RelatedQueriesList.tsx`:

```tsx
import type { RelatedQuery } from "../lib/types";

interface RelatedQueriesListProps {
  rising: RelatedQuery[];
}

/** Lists a keyword's rising related search queries with their growth value. */
export function RelatedQueriesList({ rising }: RelatedQueriesListProps) {
  if (rising.length === 0) {
    return <p className="text-sm text-slate-500">Sin related queries en alza todavía.</p>;
  }

  return (
    <ul className="space-y-1">
      {rising.map((item) => (
        <li key={item.query} className="flex justify-between text-sm">
          <span className="text-slate-700">{item.query}</span>
          <span className="font-medium text-emerald-600">{item.growthValue}</span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Finalize the dashboard**

Replace `client/src/pages/DashboardPage.tsx` with:

```tsx
import { useEffect, useState } from "react";
import { Navbar } from "../components/Navbar";
import { KeywordForm } from "../components/KeywordForm";
import { KeywordList } from "../components/KeywordList";
import { GeoInput } from "../components/GeoInput";
import { TrendChart } from "../components/TrendChart";
import { RelatedQueriesList } from "../components/RelatedQueriesList";
import { api } from "../lib/api";
import type { Keyword, KeywordTrend, KeywordRelated } from "../lib/types";

/** Protected landing page: keyword management plus trend chart and related queries for the selected keyword. */
export function DashboardPage() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [trends, setTrends] = useState<KeywordTrend[]>([]);
  const [related, setRelated] = useState<KeywordRelated[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [geo, setGeo] = useState("");
  const [loadingKeywords, setLoadingKeywords] = useState(true);
  const [loadingTrends, setLoadingTrends] = useState(true);

  function refetchKeywords() {
    return api.get<Keyword[]>("/keywords").then((res) => {
      setKeywords(res);
      setSelectedId((prev) => prev ?? res[0]?.id ?? null);
      return res;
    });
  }

  useEffect(() => {
    refetchKeywords().finally(() => setLoadingKeywords(false));
  }, []);

  useEffect(() => {
    setLoadingTrends(true);
    Promise.all([
      api.get<KeywordTrend[]>(`/trends?geo=${encodeURIComponent(geo)}`),
      api.get<KeywordRelated[]>(`/related?geo=${encodeURIComponent(geo)}`),
    ])
      .then(([trendsRes, relatedRes]) => {
        setTrends(trendsRes);
        setRelated(relatedRes);
      })
      .finally(() => setLoadingTrends(false));
  }, [geo]);

  useEffect(() => {
    if (selectedId !== null && !keywords.some((k) => k.id === selectedId)) {
      setSelectedId(keywords[0]?.id ?? null);
    }
  }, [keywords, selectedId]);

  const selectedTrend = trends.find((t) => t.id === selectedId);
  const selectedRelated = related.find((r) => r.id === selectedId);

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto grid max-w-5xl gap-6 px-6 py-8 md:grid-cols-[minmax(0,320px)_1fr]">
        <div className="space-y-4">
          <KeywordForm onCreated={refetchKeywords} />
          <GeoInput value={geo} onChange={setGeo} />
          {loadingKeywords ? (
            <p className="text-sm text-slate-500">Cargando keywords...</p>
          ) : (
            <KeywordList
              keywords={keywords}
              onDeleted={refetchKeywords}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
        </div>
        <div className="space-y-6 rounded-lg bg-white p-6 shadow">
          {selectedId === null ? (
            <p className="text-sm text-slate-500">Agrega o selecciona una keyword para ver su tendencia.</p>
          ) : loadingTrends ? (
            <p className="text-sm text-slate-500">Cargando datos de tendencia...</p>
          ) : (
            <>
              <div>
                <h2 className="mb-2 text-sm font-semibold text-slate-800">Tendencia</h2>
                <TrendChart timeline={selectedTrend?.timeline ?? []} />
              </div>
              <div>
                <h2 className="mb-2 text-sm font-semibold text-slate-800">Related queries en alza</h2>
                <RelatedQueriesList rising={selectedRelated?.rising ?? []} />
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Type-check**

Run inside `client/`: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 6: Manual verification in the browser**

1. With a keyword that has no collected data yet selected → chart area shows "Sin datos aún — corre la recolección." and related list shows "Sin related queries en alza todavía." (not an error).
2. In a separate terminal, run `npm run collect -- --geo=US` from the repo root to collect real data for your tracked keyword(s).
3. Back in the dashboard, type `US` into the geo input → the chart and related list populate with real data for the selected keyword.
4. Select a different tracked keyword (if you have more than one) → chart/related update to match.
5. Delete the currently selected keyword → selection falls back to another keyword (or to the empty state if none remain), no crash.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/GeoInput.tsx client/src/components/TrendChart.tsx client/src/components/RelatedQueriesList.tsx client/src/pages/DashboardPage.tsx
git commit -m "feat: add trend charts, related queries, and geo selection to the dashboard"
```

---

### Task 7: Close out Fase 4

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: nothing consumed by later tasks — this is the last task of the phase.

- [ ] **Step 1: Full end-to-end walkthrough**

With both dev servers running, in a fresh browser session (or incognito window, to start with no session cookie):
1. Register a new account.
2. Add two different keywords.
3. Run `npm run collect -- --geo=US` from the repo root.
4. Confirm both keywords show trend charts and (if available) related queries for `geo=US`.
5. Delete one keyword; confirm it disappears and the chart panel falls back correctly.
6. Log out; confirm redirected to `/login` and `/dashboard` is unreachable without logging back in.

- [ ] **Step 2: Update `CLAUDE.md`**

In the roadmap table, change Fase 4's status to `✅ Completa`. Add a new "Estado detallado de la Fase 4" section (mirroring the existing Fase 3 section's style) listing: the `client/` app and its stack, the auth-scoping fix to `trends.route.ts`, and that verification for this phase was manual (no Vitest yet). Update the "siguiente paso inmediato" to point at Fase 5 (deploy — Render/Railway, security hardening items already listed under "Sobre seguridad", and updating the stale `README.md`).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: mark phase 4 complete, point roadmap to phase 5"
```
