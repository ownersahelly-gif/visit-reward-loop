import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";
import { Bell, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/")({ component: Index });

type Restaurant = {
  id: string;
  name: string;
  description: string | null;
  cuisine: string | null;
  image_url: string | null;
  status: string;
};

function Index() {
  const { user } = useAuth();
  const { data: restaurants, isLoading } = useQuery({
    queryKey: ["restaurants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .order("status", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Restaurant[];
    },
  });

  const active = (restaurants ?? []).filter((r) => r.status === "active");
  const pending = (restaurants ?? []).filter((r) => r.status !== "active");

  return (
    <AppShell>
      <section className="mb-10">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Welcome{user ? " back" : ""}</p>
        <h1 className="mt-1 font-serif text-4xl font-semibold tracking-tight text-balance">
          Stamp your way to rewards.
        </h1>
        <p className="mt-2 max-w-prose text-muted-foreground">
          Visit local partners, tap your card on arrival, and unlock perks the more you come back.
        </p>
      </section>

      {user && <Reminders />}

      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <h2 className="font-serif text-xl">Local partners</h2>
          <span className="text-xs text-muted-foreground">{active.length} active</span>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {active.map((r) => (
              <Link key={r.id} to="/restaurants/$id" params={{ id: r.id }}>
                <Card className="group overflow-hidden p-0 transition hover:shadow-lg">
                  <div className="relative h-40 w-full overflow-hidden bg-secondary">
                    {r.image_url && (
                      <img
                        src={r.image_url}
                        alt={r.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    )}
                    <Badge className="absolute left-3 top-3 bg-primary text-primary-foreground">Active</Badge>
                  </div>
                  <div className="space-y-1 p-4">
                    <h3 className="font-serif text-lg leading-tight">{r.name}</h3>
                    <p className="text-xs text-muted-foreground">{r.cuisine}</p>
                    <p className="line-clamp-2 pt-1 text-sm text-muted-foreground">{r.description}</p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {pending.length > 0 && (
        <section className="mt-10 space-y-3">
          <h2 className="font-serif text-xl">Coming soon</h2>
          <p className="text-sm text-muted-foreground">
            These restaurants are in the middle of joining Stamp. Collaboration is in progress.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {pending.map((r) => (
              <Card key={r.id} className="flex items-center gap-3 p-3 opacity-70">
                <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-secondary">
                  {r.image_url && (
                    <img src={r.image_url} alt="" className="h-full w-full object-cover grayscale" loading="lazy" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.name}</p>
                  <p className="text-xs italic text-muted-foreground">Collaboration in progress…</p>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}

function Reminders() {
  const { user } = useAuth();
  const [items, setItems] = useState<Array<{ offer_id: string; restaurant_id: string; title: string; restaurant: string; days_left: number; remaining: number }>>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      // Fetch active offers + this user's visits
      const { data: offers } = await supabase
        .from("offers")
        .select("id, title, required_visits, window_days, restaurant_id, restaurants(name, status)")
        .eq("active", true);
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data: visits } = await supabase
        .from("visits")
        .select("offer_id, visited_at")
        .eq("user_id", user.id)
        .gte("visited_at", since);
      if (cancelled) return;
      const result: typeof items = [];
      for (const o of offers ?? []) {
        // @ts-ignore relational
        if (o.restaurants?.status !== "active") continue;
        const cutoff = Date.now() - (o.window_days as number) * 24 * 60 * 60 * 1000;
        const inWindow = (visits ?? []).filter((v) => v.offer_id === o.id && new Date(v.visited_at).getTime() >= cutoff);
        if (inWindow.length === 0) continue;
        const remaining = (o.required_visits as number) - inWindow.length;
        if (remaining <= 0) continue;
        const oldest = Math.min(...inWindow.map((v) => new Date(v.visited_at).getTime()));
        const expireAt = oldest + (o.window_days as number) * 24 * 60 * 60 * 1000;
        const daysLeft = Math.max(0, Math.ceil((expireAt - Date.now()) / (24 * 60 * 60 * 1000)));
        if (daysLeft <= 10 && remaining > 0) {
          result.push({
            offer_id: o.id as string,
            restaurant_id: o.restaurant_id as string,
            title: o.title as string,
            // @ts-ignore
            restaurant: o.restaurants?.name ?? "",
            days_left: daysLeft,
            remaining,
          });
        }
      }
      setItems(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (items.length === 0) return null;

  return (
    <section className="mb-8 space-y-3">
      <h2 className="flex items-center gap-2 font-serif text-xl">
        <Bell className="size-4 text-primary" /> Don't lose your streak
      </h2>
      <div className="space-y-2">
        {items.map((i) => (
          <Link key={i.offer_id} to="/restaurants/$id" params={{ id: i.restaurant_id }}>
            <Card className="flex items-center justify-between gap-3 border-primary/30 bg-primary/5 p-4 transition hover:bg-primary/10">
              <div>
                <p className="text-sm font-medium">
                  {i.remaining} more visit{i.remaining > 1 ? "s" : ""} at {i.restaurant}
                </p>
                <p className="text-xs text-muted-foreground">
                  {i.title} · {i.days_left} day{i.days_left === 1 ? "" : "s"} left
                </p>
              </div>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
