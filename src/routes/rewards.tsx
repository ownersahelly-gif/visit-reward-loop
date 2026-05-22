import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { Trophy, Gift, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/rewards")({ component: RewardsPage });

type Row = {
  id: string;
  redeemed_at: string;
  offer_id: string;
  restaurant_id: string;
  offers: { title: string; reward: string } | null;
  restaurants: { name: string; image_url: string | null } | null;
};

function RewardsPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  const { data, isLoading } = useQuery({
    queryKey: ["my-rewards", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("redemptions")
        .select("id, redeemed_at, offer_id, restaurant_id, offers(title, reward), restaurants(name, image_url)")
        .eq("user_id", user!.id)
        .order("redeemed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  return (
    <AppShell>
      <Link to="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> All restaurants
      </Link>
      <div className="flex items-center gap-2">
        <Trophy className="size-6 text-primary" />
        <h1 className="font-serif text-3xl font-semibold">Used rewards</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Every reward you've claimed across partner restaurants.
      </p>

      <div className="mt-6 space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && (data ?? []).length === 0 && (
          <Card className="p-8 text-center">
            <Gift className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-2 font-medium">No rewards yet</p>
            <p className="text-sm text-muted-foreground">
              Collect stamps and redeem to see your history here.
            </p>
          </Card>
        )}
        {(data ?? []).map((r) => (
          <Card key={r.id} className="flex items-center gap-4 p-4">
            <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-secondary">
              {r.restaurants?.image_url && (
                <img src={r.restaurants.image_url} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium">{r.restaurants?.name ?? "Restaurant"}</p>
                <Badge variant="secondary" className="shrink-0 text-[10px]">Redeemed</Badge>
              </div>
              <p className="truncate text-sm text-muted-foreground">{r.offers?.title}</p>
              <p className="truncate text-xs text-primary">🎁 {r.offers?.reward}</p>
            </div>
            <div className="shrink-0 text-right text-xs text-muted-foreground">
              {new Date(r.redeemed_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
