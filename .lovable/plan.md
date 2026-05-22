
# Option B — Migrate to a static SPA build

Goal: produce a real `dist/index.html` + static JS bundle so `npx cap sync ios` works and the app runs fully offline-from-server inside the iOS wrapper (and Android later). Once done, you can open Xcode, hit Run, and ship to TestFlight without depending on `visit-reward-loop.lovable.app`.

## What changes

### 1. Build system: TanStack Start → plain Vite SPA + TanStack Router

- Replace `vite.config.ts` with a standard Vite + React config using `@tanstack/router-plugin/vite` (file-based routing still works, no SSR).
- Remove Cloudflare Workers integration: delete `wrangler.jsonc`, `src/server.ts`, `src/start.ts`, `src/lib/error-page.ts`, `src/lib/error-capture.ts`.
- Replace `src/router.tsx` with a browser-only router and add `src/main.tsx` that mounts `<RouterProvider>` into `#root`.
- Replace `src/routes/__root.tsx` `shellComponent` with a normal root layout (no `<html>`, `<head>`, `<Scripts/>` — those move to `index.html`).
- Add `index.html` at project root with the Google Fonts links and meta tags currently in `__root.tsx`.
- Per-route SEO meta (`head()`) keeps working via `@tanstack/react-router`'s `useDocumentHead`/`Meta` on the client.

### 2. Server functions → Supabase Edge Functions

Every `createServerFn` becomes a Supabase Edge Function called via `supabase.functions.invoke()` from the browser. Files to migrate:

- `src/lib/nfc.functions.ts` → `supabase/functions/nfc-set-token`, `nfc-stamp-visit`, `nfc-admin-test-stamp`
- `src/lib/staff.functions.ts` → `supabase/functions/staff-*` (one per exported fn)
- `src/lib/branch-requests.functions.ts` → `supabase/functions/branch-requests-*`

Each edge function:
- Verifies the caller's JWT via the `Authorization` header (Supabase auto-provides `user` when `verify_jwt = true`, which is the default).
- Uses a service-role client for admin queries (same logic that `supabaseAdmin` does today).
- Returns JSON; errors return non-2xx with `{ error: string }`.

Client call sites swap `useServerFn(fn)` / `fn({ data })` for a thin helper `await invokeEdge('nfc-stamp-visit', payload)` that wraps `supabase.functions.invoke` and throws on `error`.

### 3. Auth + data access

- `src/integrations/supabase/client.ts` already works in the browser unchanged.
- Delete `src/integrations/supabase/client.server.ts`, `auth-middleware.ts`, `auth-attacher.ts` (they're server-only). Re-create equivalents inside edge functions.
- All page data queries that today go through server functions either:
  - move to direct `supabase.from(...).select()` from the component (when RLS already covers it), or
  - stay as edge function calls (admin work, cross-table writes, NFC token lookups).

### 4. Capacitor wiring

- `capacitor.config.ts`: remove `server.url`, keep `webDir: "dist"`.
- New build pipeline: `bun run build` → emits `dist/index.html` + assets → `npx cap sync ios` → `npx cap open ios`.
- Add `MOBILE.md` update with the new command sequence.

### 5. Routing & SSR cleanup

- `src/routes/index.tsx`, `auth.tsx`, `admin.tsx`, `owner.tsx`, `staff.tsx`, `rewards.tsx`, `restaurants.$id.tsx`: drop any reliance on SSR features (`loader`s that called server fns become `useQuery` / `useEffect` on the client). No route currently uses route-level loaders for protected data heavily, so this is mostly removing `useServerFn` wrappers.
- Keep `@tanstack/router-plugin` so the existing `src/routeTree.gen.ts` continues to regenerate.

## Files touched

```
delete  wrangler.jsonc
delete  src/server.ts
delete  src/start.ts
delete  src/lib/error-page.ts
delete  src/lib/error-capture.ts
delete  src/integrations/supabase/client.server.ts
delete  src/integrations/supabase/auth-middleware.ts
delete  src/integrations/supabase/auth-attacher.ts
delete  src/lib/nfc.functions.ts
delete  src/lib/staff.functions.ts
delete  src/lib/branch-requests.functions.ts

create  index.html
create  src/main.tsx
create  src/lib/edge.ts                      (invokeEdge helper)
create  supabase/functions/<each-fn>/index.ts (~10 edge functions)

edit    vite.config.ts                       (plain Vite SPA + router plugin)
edit    package.json                         (remove start/cloudflare deps, add @vitejs/plugin-react)
edit    src/router.tsx                       (browser router)
edit    src/routes/__root.tsx                (drop shellComponent / Scripts)
edit    src/routes/index.tsx, auth.tsx, admin.tsx, owner.tsx,
        staff.tsx, rewards.tsx, restaurants.$id.tsx,
        src/components/AppShell.tsx, QrScannerDialog.tsx
                                             (swap useServerFn → invokeEdge)
edit    capacitor.config.ts                  (drop server.url)
edit    MOBILE.md                            (new build steps)
```

Roughly **25–30 files** changed, **~10 new edge functions** deployed automatically by Lovable Cloud.

## After this lands, your Mac workflow

```bash
bun install
bun run build           # outputs dist/index.html
npx cap sync ios
npx cap open ios        # Xcode opens, pick Team in Signing, Run
```

No more `server.url`, no more web fallback — the app runs from the bundled assets and only hits Lovable Cloud (Supabase) for data and edge functions.

## Trade-offs to confirm before I start

1. **SEO**: SSR meta tags go away. For a loyalty app this is fine (auth-walled). Confirm you don't need server-rendered HTML for marketing pages.
2. **Initial paint**: pure SPA shows a brief loading state on first visit instead of SSR-rendered content. Acceptable for a logged-in app.
3. **Web deploy**: `visit-reward-loop.lovable.app` will serve the SPA build (still works fine, just no SSR).
4. **Migration effort**: ~30 file edits + 10 edge functions. I'll do it in one pass; expect a few iterations to fix anything the typechecker catches.

Approve and I'll execute the full migration.
