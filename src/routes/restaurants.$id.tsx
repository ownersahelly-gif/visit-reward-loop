import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { ArrowLeft, Sparkles, Wifi } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/restaurants/$id")({ component: RestaurantPage });

type Offer = {
  id: string;
  title: string;
  description: string | null;
  reward: string;
  required_visits: number;
  window_days: number;
  active: boolean;
};

function RestaurantPage() {
  const { id } = useParams({ from: "/restaurants/$id" });
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: restaurant } = useQuery({
    queryKey: ["restaurant", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: offers } = useQuery({
    queryKey: ["offers", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers")
        .select("*")
        .eq("restaurant_id", id)
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Offer[];
    },
  });

  const { data: visits, refetch: refetchVisits } = useQuery({
    queryKey: ["visits", id, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const offerIds = (offers ?? []).map((o) => o.id);
      if (offerIds.length === 0) return [];
      const { data, error } = await supabase
        .from("visits")
        .select("*")
        .eq("user_id", user!.id)
        .in("offer_id", offerIds);
      if (error) throw error;
      return data as Array<{ id: string; offer_id: string; visited_at: string }>;
    },
  });

  if (!restaurant) {
    return (
      <AppShell>
        <p className="text-muted-foreground">Loading restaurant…</p>
      </AppShell>
    );
  }

  if (restaurant.status !== "active") {
    return (
      <AppShell>
        <BackLink />
        <Card className="p-8 text-center">
          <h1 className="font-serif text-2xl">{restaurant.name}</h1>
          <p className="mt-2 text-muted-foreground">Collaboration in progress — check back soon.</p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <BackLink />
      <div className="overflow-hidden rounded-2xl">
        <div className="relative h-56 w-full bg-secondary sm:h-72">
          {restaurant.image_url && (
            <img src={restaurant.image_url} alt={restaurant.name} className="h-full w-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
            <Badge className="mb-2 bg-white/20 text-white backdrop-blur">Active partner</Badge>
            <h1 className="font-serif text-3xl font-semibold">{restaurant.name}</h1>
            {restaurant.cuisine && <p className="text-sm opacity-80">{restaurant.cuisine}</p>}
          </div>
        </div>
      </div>

      {restaurant.description && (
        <p className="mt-6 max-w-prose text-muted-foreground">{restaurant.description}</p>
      )}

      <section className="mt-8 space-y-5">
        <h2 className="font-serif text-xl">Active offers</h2>
        {!user && (
          <Card className="border-dashed bg-secondary/50 p-4 text-sm">
            <Link to="/auth" className="font-medium text-primary underline">
              Sign in
            </Link>{" "}
            to start collecting stamps.
          </Card>
        )}
        {(offers ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No offers running right now.</p>
        )}
        {(offers ?? []).map((offer) => (
          <OfferBlock
            key={offer.id}
            offer={offer}
            visits={(visits ?? []).filter((v) => v.offer_id === offer.id)}
            onChanged={() => {
              refetchVisits();
              qc.invalidateQueries({ queryKey: ["visits"] });
            }}
          />
        ))}
      </section>
    </AppShell>
  );
}

function BackLink() {
  return (
    <Link to="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-3.5" /> All restaurants
    </Link>
  );
}

function OfferBlock({
  offer,
  visits,
  onChanged,
}: {
  offer: Offer;
  visits: Array<{ id: string; visited_at: string }>;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const cutoff = Date.now() - offer.window_days * 24 * 60 * 60 * 1000;
  const inWindow = visits.filter((v) => new Date(v.visited_at).getTime() >= cutoff);
  const stamped = Math.min(inWindow.length, offer.required_visits);
  const complete = stamped >= offer.required_visits;

  const [scanning, setScanning] = useState(false);
  const [justStamped, setJustStamped] = useState<number | null>(null);
  const [completedCelebrate, setCompletedCelebrate] = useState(false);

  const handleTap = async (index: number) => {
    if (!user) {
      toast.error("Sign in to log a visit");
      return;
    }
    if (index !== stamped || complete) return;
    setScanning(true);
    // Simulate NFC waiting period
    await new Promise((r) => setTimeout(r, 1400));
    const { error } = await supabase.from("visits").insert({ user_id: user.id, offer_id: offer.id });
    setScanning(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setJustStamped(index);
    toast.success("Stamp added!", { description: "Nice visit — keep it going." });
    if (stamped + 1 >= offer.required_visits) {
      setCompletedCelebrate(true);
      toast.success("🎉 Reward unlocked!", { description: offer.reward });
    }
    onChanged();
    setTimeout(() => setJustStamped(null), 800);
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="relative space-y-1 bg-primary p-5 text-primary-foreground">
        <p className="text-[10px] font-semibold uppercase tracking-widest opacity-80">Current goal</p>
        <h3 className="font-serif text-xl leading-tight">{offer.title}</h3>
        {offer.description && <p className="text-sm opacity-90">{offer.description}</p>}
        <p className="pt-2 text-xs opacity-80">
          Reward: <span className="font-medium opacity-100">{offer.reward}</span>
        </p>
        <div className="absolute -right-6 -bottom-6 size-28 rounded-full bg-white/10 blur-2xl" />
      </div>
      <div className="space-y-4 p-5">
        <div className="flex items-end justify-between">
          <p className="text-xs font-semibold uppercase tracking-tight">Your attendance</p>
          <span className="text-xs text-muted-foreground">
            {stamped} of {offer.required_visits} · {offer.window_days}-day window
          </span>
        </div>
        <div className={`grid gap-3 ${offer.required_visits <= 6 ? "grid-cols-6" : offer.required_visits <= 10 ? "grid-cols-5" : "grid-cols-6"}`}>
          {Array.from({ length: offer.required_visits }).map((_, i) => {
            const isStamped = i < stamped;
            const isNext = i === stamped && !complete;
            const isJust = justStamped === i;
            return (
              <button
                key={i}
                onClick={() => handleTap(i)}
                disabled={!isNext || scanning}
                aria-label={isStamped ? "Stamped" : isNext ? "Tap to stamp" : "Locked"}
                className={`relative aspect-square rounded-full transition ${
                  isStamped
                    ? "bg-primary/5 ring-1 ring-primary/30"
                    : isNext
                      ? "bg-primary/10 ring-1 ring-primary/40 hover:bg-primary/15"
                      : "border border-dashed border-border bg-transparent"
                }`}
              >
                {isStamped && (
                  <span
                    className={`absolute inset-0 m-auto grid size-8 place-items-center rounded-full bg-primary text-primary-foreground ${
                      isJust ? "animate-stamp" : ""
                    }`}
                  >
                    <span className="size-3 rounded-full border-2 border-white/40" />
                    {isJust && <span className="absolute inset-0 rounded-full animate-burst" />}
                  </span>
                )}
                {isNext && (
                  <span className="absolute inset-0 m-auto grid size-6 place-items-center">
                    {scanning ? (
                      <span className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    ) : (
                      <span className="size-2 rounded-full bg-primary/50" />
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {complete ? (
          <div className={`flex items-center gap-2 rounded-lg bg-primary/10 p-3 text-sm text-primary ${completedCelebrate ? "animate-stamp" : ""}`}>
            <Sparkles className="size-4" /> Reward unlocked — show this to staff: <strong>{offer.reward}</strong>
          </div>
        ) : (
          <Button
            className="w-full"
            size="lg"
            onClick={() => handleTap(stamped)}
            disabled={!user || scanning}
          >
            <Wifi className="size-4" />
            {scanning ? "Waiting for card…" : "Tap card to stamp visit"}
          </Button>
        )}
      </div>
    </Card>
  );
}
