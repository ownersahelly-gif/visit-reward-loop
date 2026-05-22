// Thin client-side wrapper that invokes the consolidated `app-api` edge
// function. Returns the JSON payload directly or throws with the error message.
import { supabase } from "@/integrations/supabase/client";

export async function invokeAppApi<T = unknown>(
  action: string,
  data: unknown = {},
): Promise<T> {
  const { data: res, error } = await supabase.functions.invoke("app-api", {
    body: { action, data },
  });
  if (error) {
    // supabase.functions.invoke wraps non-2xx responses in an error.
    // Try to extract our { error: "..." } payload.
    const detail = (error as any)?.context?.body ?? error.message;
    let msg = error.message;
    try {
      const parsed = typeof detail === "string" ? JSON.parse(detail) : detail;
      if (parsed?.error) msg = parsed.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (res && typeof res === "object" && "error" in (res as any) && (res as any).error) {
    throw new Error((res as any).error);
  }
  return res as T;
}

// Shim so callers can keep using `useServerFn(fn)` -> returns fn unchanged.
export function useServerFn<T>(fn: T): T {
  return fn;
}
