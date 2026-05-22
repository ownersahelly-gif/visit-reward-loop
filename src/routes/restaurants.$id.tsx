import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { ArrowLeft, Sparkles, Wifi, CheckCircle2, KeyRound, Trophy } from "lucide-react";
import { toast } from "sonner";
import { buzz, celebrate } from "@/lib/haptics";

export const Route = createFileRoute("/restaurants/$id")({ component: RestaurantPage });

type Offer = {
  id: string;
  title: string;
  description: string | null;
  reward: string;
  required_visits: number;
  window_days: number;
  active: boolean;
  restaurant_id: string;
};
type Visit = { id: string; offer_id: string; visited_at: string };
type Redemption = { id: string; offer_id: string; redeemed_at: string };

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
    enabled: !!user && !!offers,
    queryFn: async () => {
      const offerIds = (offers ?? []).map((o) => o.id);
      if (offerIds.length === 0) return [];
      const { data, error } = await supabase
        .from("visits")
        .select("*")
        .eq("user_id", user!.id)
        .in("offer_id", offerIds);
      if (error) throw error;
      return data as Visit[];
    },
  });

  const { data: redemptions, refetch: refetchRedemptions } = useQuery({
    queryKey: ["redemptions", id, user?.id],
    enabled: !!user && !!offers,
    queryFn: async () => {
      const offerIds = (offers ?? []).map((o) => o.id);
      if (offerIds.length === 0) return [];
      const { data, error } = await supabase
        .from("redemptions")
        .select("id, offer_id, redeemed_at")
        .eq("user_id", user!.id)
        .in("offer_id", offerIds);
      if (error) throw error;
      return data as Redemption[];
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
            restaurantId={id}
            visits={(visits ?? []).filter((v) => v.offer_id === offer.id)}
            redemptions={(redemptions ?? []).filter((r) => r.offer_id === offer.id)}
            onChanged={() => {
              refetchVisits();
              refetchRedemptions();
              qc.invalidateQueries({ queryKey: ["visits"] });
              qc.invalidateQueries({ queryKey: ["redemptions"] });
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
  restaurantId,
  visits,
  redemptions,
  onChanged,
}: {
  offer: Offer;
  restaurantId: string;
  visits: Visit[];
  redemptions: Redemption[];
  onChanged: () => void;
}) {
  const { user } = useAuth();

  // Only count visits AFTER the last redemption AND within the rolling window.
  const lastRedeemedAt = redemptions
    .map((r) => new Date(r.redeemed_at).getTime())
    .sort((a, b) => b - a)[0] ?? 0;
  const windowCutoff = Date.now() - offer.window_days * 24 * 60 * 60 * 1000;
  const effectiveCutoff = Math.max(lastRedeemedAt, windowCutoff);

  const cycleVisits = visits.filter((v) => new Date(v.visited_at).getTime() > effectiveCutoff);
  const stamped = Math.min(cycleVisits.length, offer.required_visits);
  const complete = stamped >= offer.required_visits;
  const cyclesCompleted = redemptions.length;

  const [scanning, setScanning] = useState(false);
  const [justStamped, setJustStamped] = useState<number | null>(null);
  const [showFlying, setShowFlying] = useState(false);
  const [otpOpen, setOtpOpen] = useState(false);
  const prevComplete = useRef(complete);

  // Trigger celebration when transitioning to complete
  useEffect(() => {
    if (complete && !prevComplete.current) {
      setShowFlying(true);
      celebrate();
      setTimeout(() => setShowFlying(false), 2200);
    }
    prevComplete.current = complete;
  }, [complete]);

  const handleTap = async (index: number) => {
    if (!user) {
      toast.error("Sign in to log a visit");
      return;
    }
    if (index !== stamped || complete) return;
    setScanning(true);
    await buzz(20);
    await new Promise((r) => setTimeout(r, 1400));
    const { error } = await supabase.from("visits").insert({ user_id: user.id, offer_id: offer.id });
    setScanning(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await buzz(40);
    setJustStamped(index);
    toast.success("Stamp added!", { description: "Nice visit — keep it going." });
    onChanged();
    setTimeout(() => setJustStamped(null), 800);
  };

  return (
    <Card className="relative overflow-hidden p-0">
      {showFlying && <FlyingCards />}

      <div className="relative space-y-1 bg-primary p-5 text-primary-foreground">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest opacity-80">Current goal</p>
            <h3 className="font-serif text-xl leading-tight">{offer.title}</h3>
            {offer.description && <p className="text-sm opacity-90">{offer.description}</p>}
            <p className="pt-2 text-xs opacity-80">
              Reward: <span className="font-medium opacity-100">{offer.reward}</span>
            </p>
          </div>
          {cyclesCompleted > 0 && (
            <div className="flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs backdrop-blur">
              <Trophy className="size-3.5" /> {cyclesCompleted}× earned
            </div>
          )}
        </div>
        <div className="absolute -right-6 -bottom-6 size-28 rounded-full bg-white/10 blur-2xl" />
      </div>

      <div className="relative space-y-4 p-5">
        <div className="flex items-end justify-between">
          <p className="text-xs font-semibold uppercase tracking-tight">Your attendance</p>
          <span className="text-xs text-muted-foreground">
            {stamped} of {offer.required_visits} · {offer.window_days}-day window
          </span>
        </div>

        <div
          className={`grid gap-3 ${
            offer.required_visits <= 6 ? "grid-cols-6" : offer.required_visits <= 10 ? "grid-cols-5" : "grid-cols-6"
          } ${complete ? "opacity-90" : ""}`}
        >
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
                    ? "bg-primary ring-2 ring-primary shadow-md"
                    : isNext
                      ? "bg-primary/10 ring-1 ring-primary/40 hover:bg-primary/15"
                      : "border border-dashed border-border bg-transparent"
                } ${isJust ? "animate-stamp" : ""}`}
              >
                {isStamped && (
                  <span className="absolute inset-0 grid place-items-center text-primary-foreground">
                    <CheckCircle2 className="size-6" strokeWidth={2.5} />
                  </span>
                )}
                {isJust && <span className="absolute inset-0 rounded-full animate-burst" />}
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
          <div className="relative">
            {/* Big COMPLETE stamp overlay */}
            <div className="pointer-events-none absolute -top-2 right-2 z-10">
              <div className="rotate-[-8deg] rounded-md border-4 border-primary px-3 py-1 font-serif text-lg font-bold uppercase tracking-widest text-primary animate-badge-pop">
                Complete
              </div>
            </div>
            <div className="space-y-3 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-4">
              <div className="flex items-center gap-2 text-sm text-primary">
                <Sparkles className="size-4" />
                <span>
                  Reward ready: <strong>{offer.reward}</strong>
                </span>
              </div>
              <Button className="w-full" size="lg" onClick={() => setOtpOpen(true)}>
                <KeyRound className="size-4" /> Show redemption code
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                Staff will enter this 6-digit code to confirm your reward. New code every 60 seconds.
              </p>
            </div>
            <OtpDialog
              open={otpOpen}
              onOpenChange={setOtpOpen}
              offer={offer}
              restaurantId={restaurantId}
              onRedeemed={onChanged}
            />
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

function FlyingCards() {
  const cards = useMemo(
    () =>
      Array.from({ length: 14 }).map((_, i) => ({
        id: i,
        left: 20 + Math.random() * 60,
        tx: (Math.random() - 0.5) * 80,
        ty: -60 - Math.random() * 40,
        r0: Math.random() * 360,
        r1: Math.random() * 720 - 360,
        delay: Math.random() * 0.4,
        emoji: ["🎉", "⭐", "🏆", "✨", "🎊"][i % 5],
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {cards.map((c) => (
        <span
          key={c.id}
          className="fly-card absolute text-3xl"
          style={
            {
              left: `${c.left}%`,
              top: "0",
              "--tx": `${c.tx}vw`,
              "--ty": `${c.ty}vh`,
              "--r0": `${c.r0}deg`,
              "--r1": `${c.r1}deg`,
              animationDelay: `${c.delay}s`,
            } as React.CSSProperties
          }
        >
          {c.emoji}
        </span>
      ))}
    </div>
  );
}

function OtpDialog({
  open,
  onOpenChange,
  offer,
  restaurantId,
  onRedeemed,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  offer: Offer;
  restaurantId: string;
  onRedeemed: () => void;
}) {
  const { user } = useAuth();
  const [code, setCode] = useState<string>("");
  const [secondsLeft, setSecondsLeft] = useState(60);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Generate (or rotate) a code valid for 60s
  const rotate = async () => {
    if (!user) return;
    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const { error } = await supabase.from("redemption_codes").insert({
      user_id: user.id,
      offer_id: offer.id,
      restaurant_id: restaurantId,
      code: newCode,
      expires_at: expiresAt,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setCode(newCode);
    setSecondsLeft(60);
  };

  useEffect(() => {
    if (!open) return;
    rotate();
    const tick = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          rotate();
          return 60;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Listen for redemption inserted by staff → auto-close + celebrate
  useEffect(() => {
    if (!open || !user) return;
    const ch = supabase
      .channel(`redeem-${offer.id}-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "redemptions", filter: `user_id=eq.${user.id}` },
        (payload) => {
          if ((payload.new as any).offer_id === offer.id) {
            celebrate();
            toast.success("🎉 Reward redeemed!", { description: offer.reward });
            onRedeemed();
            onOpenChange(false);
          }
        },
      )
      .subscribe();
    channelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
    };
  }, [open, user, offer.id, offer.reward, onRedeemed, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif">Show this to staff</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2 text-center">
          <p className="text-sm text-muted-foreground">{offer.title}</p>
          <div className="rounded-2xl bg-primary/10 p-6">
            <p className="font-mono text-5xl font-bold tracking-[0.4em] text-primary">
              {code || "······"}
            </p>
          </div>
          <div className="space-y-2">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-primary transition-all duration-1000 ease-linear"
                style={{ width: `${(secondsLeft / 60) * 100}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">New code in {secondsLeft}s</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Reward: <strong className="text-foreground">{offer.reward}</strong>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
