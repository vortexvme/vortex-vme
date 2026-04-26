# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vortex (`vortex-vme`) is a React 18 + TypeScript SPA that wraps the Morpheus VM Essentials (VME) Manager REST API to give VM admins a familiar enterprise-style HTML5 client. It is a pure frontend — there is no backend service in this repo. All requests go to a Morpheus VME Manager at runtime, proxied by Vite in dev and Nginx in prod.

## Commands

| Task | Command |
|------|---------|
| Dev server (port 3000) | `npm run dev` |
| Type check | `npx tsc --noEmit` (also exposed as `/typecheck`) |
| Production build | `npm run build` (runs `tsc` then `vite build`) |
| Preview built bundle | `npm run preview` |
| Format | `npm run format` |
| Regenerate OpenAPI client | `npm run generate-api` (calls `scripts/generate-api.sh`) |

There is no test runner and no lint script — type-checking is the sole automated gate. A PostToolUse hook in `.claude/settings.json` auto-runs `tsc --noEmit` after every `.ts`/`.tsx` edit.

`VME_URL` controls the Vite dev proxy target for `/api/*` and `/oauth/*` (defaults to `http://localhost:8080`). Without a real VME Manager reachable, the dev server runs but every API call will fail.

## Deploy

`deploy.sh` is the production install/update script for Ubuntu 24.04 — see [README.md](README.md) for the curl one-liner. `--update` reuses the existing TLS cert and Nginx config; without it everything is regenerated. The script writes `/var/www/vortex-vme/config.json` containing `vmeManagerUrl`, which `src/main.tsx` reads at runtime and sticks on `window.__VME_MANAGER_URL__`.

## Architecture

### Runtime config injection

The build is environment-agnostic. The VME Manager URL is **not** baked into the bundle — `src/main.tsx#bootstrap()` fetches `/config.json` before React renders and stores `vmeManagerUrl` on `window.__VME_MANAGER_URL__`. Read it via [src/utils/vmeManagerUrl.ts](src/utils/vmeManagerUrl.ts), never from `import.meta.env`. Code paths that just call `/api/...` rely on Nginx (or the Vite proxy) to forward to the manager — they don't need this URL. Only links that bypass the proxy (e.g. the hypervisor console URL) do.

### API layer ([src/api/](src/api/))

Single Axios instance in [client.ts](src/api/client.ts) with two interceptors:

1. **Request:** attaches `Authorization: Bearer <token>` from `localStorage` or `sessionStorage` (chosen by the `vme_remember` flag set at login).
2. **Response:** on 401, queues concurrent requests, performs a single `POST /oauth/token` refresh, then retries every queued request with the new token. On refresh failure → `clearTokens()` + redirect to `/login`. 5xx responses surface a single deduped toast (id `api-server-error`).

Everything else in `src/api/` is a thin wrapper around `apiClient` returning typed responses from [src/types/morpheus.ts](src/types/morpheus.ts). Auth is the one exception: `login()` in [auth.ts](src/api/auth.ts) uses bare `axios` (not `apiClient`) so the request interceptor doesn't try to attach a token that doesn't exist yet.

### State

- **Server state:** TanStack Query v5 (configured in `src/main.tsx` with `staleTime: 30s`, `retry: 1`, `refetchOnWindowFocus: false`). Use queries/mutations in components — do not put server data in Zustand.
- **Client state:** Zustand stores in [src/store/](src/store/):
  - `authStore` — derives `isAuthenticated` from `getAccessToken()` so a hard refresh stays logged in.
  - `treeStore` — sidebar tree expand/select/collapse.
  - `uiStore` — modal open/close (e.g. `isCreateVMOpen`).

### Routing & layout

[App.tsx](src/App.tsx) — React Router v6. All authenticated routes live under a single `<ProtectedRoute><AppLayout /></ProtectedRoute>` wrapper; child routes render in `<Outlet />`. The `/` index redirects to `/vms`. Each top-level inventory section (vms, hosts, clusters, networks, storage) is a list page + detail page pair.

### Feature folder convention

`src/features/<area>/` holds page components. Detail pages with multiple panes use `tabs/` subfolders (see [src/features/vms/tabs/](src/features/vms/tabs/)). Path alias `@/` resolves to `src/` (see [tsconfig.json](tsconfig.json) and [vite.config.ts](vite.config.ts)).

## Conventions

- TypeScript strict mode with `noUnusedLocals`/`noUnusedParameters` on — unused imports/params will fail `tsc`.
- Prettier handles formatting; no eslint.
- Toast styling is centralised in `<Toaster>` config in `App.tsx` — match the navy/green palette when adding toasts.
- The `morph-api` `client_id` and the OAuth password grant are required by Morpheus — don't change them.
- Goal verification is `npx tsc --noEmit` passing + manual verification described in the request. Do not propose adding a test framework unless explicitly asked.

## Git workflow

- Single-branch workflow: commits go directly to `main`. No feature branches, no PRs.
- After completing a task, stage changes, commit, and push to `origin/main` automatically. Use a short imperative commit message describing the change.
- Commit messages: short imperative subject line (e.g. "Fix token refresh queue race"), optional body for non-obvious changes.
