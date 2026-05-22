// Disabled in SPA mode (no TanStack Start server middleware). Auth is
// handled inside the `app-api` edge function via the Authorization header.
export const requireSupabaseAuth = null as never;
