import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2, ScanLine, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/owner")({ component: OwnerPage });

type Restaurant = { id: string; name: string; description: string | null; cuisine: string | null; image_url: string | null; status: string };
type Offer = { id: string; title: string; description: string | null; reward: string; required_visits: number; window_days: number; active: boolean; restaurant_id: string };

function OwnerPage() {
  const { user, roles, loading } = useAuth();
  const nav = useNavigate();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [customerCount, setCustomerCount] = useState<Record<string, number>>({});
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: r } = await supabase.from("restaurants").select("*").eq("owner_id", user.id).maybeSingle();
      setRestaurant((r as Restaurant) ?? null);
      if (r) {
        const { data: o } = await supabase.from("offers").select("*").eq("restaurant_id", r.id).order("created_at", { ascending: false });
        setOffers((o ?? []) as Offer[]);
        if (o && o.length) {
          const counts: Record<string, number> = {};
          for (const off of o) {
            const { count } = await supabase
              .from("visits")
              .select("user_id", { count: "exact", head: true })
              .eq("offer_id", off.id);
            counts[off.id] = count ?? 0;
          }
          setCustomerCount(counts);
        }
      }
    })();
  }, [user, refreshTick]);

  if (loading) return <AppShell><p>Loading…</p></AppShell>;
  if (!roles.includes("owner")) {
    return (
      <AppShell>
        <Card className="p-6">
          <h1 className="font-serif text-2xl">Owner access required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account isn't registered as a restaurant. Create an owner account from the sign-up page.
          </p>
          <Link to="/auth" className="mt-4 inline-block text-primary underline">Go to sign up</Link>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="font-serif text-3xl font-semibold">Partner dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">Set up your restaurant profile and loyalty offers.</p>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <RestaurantForm restaurant={restaurant} onSaved={() => setRefreshTick((t) => t + 1)} />
        {restaurant && (
          <Card className="p-5">
            <h2 className="font-serif text-xl">Status</h2>
            <div className="mt-3 flex items-center gap-2">
              <Badge variant={restaurant.status === "active" ? "default" : "secondary"}>
                {restaurant.status === "active" ? "Active partner" : "Pending approval"}
              </Badge>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {restaurant.status === "active"
                ? "Your restaurant is live to all customers."
                : "An admin needs to approve your collaboration before customers can stamp visits."}
            </p>
          </Card>
        )}
      </div>

      {restaurant && restaurant.status === "active" && (
        <section className="mt-10">
          <VerifyPanel restaurantId={restaurant.id} />
        </section>
      )}

      {restaurant && (
        <section className="mt-10 space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="font-serif text-2xl">Offers</h2>
              <p className="text-sm text-muted-foreground">Goals customers can chase to earn a reward.</p>
            </div>
            <OfferDialog restaurantId={restaurant.id} onSaved={() => setRefreshTick((t) => t + 1)} />
          </div>
          {offers.length === 0 && <p className="text-sm text-muted-foreground">No offers yet.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {offers.map((o) => (
              <OfferCard
                key={o.id}
                offer={o}
                stamps={customerCount[o.id] ?? 0}
                onChanged={() => setRefreshTick((t) => t + 1)}
              />
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}

function RestaurantForm({ restaurant, onSaved }: { restaurant: Restaurant | null; onSaved: () => void }) {
  const { user } = useAuth();
  const [name, setName] = useState(restaurant?.name ?? "");
  const [cuisine, setCuisine] = useState(restaurant?.cuisine ?? "");
  const [description, setDescription] = useState(restaurant?.description ?? "");
  const [imageUrl, setImageUrl] = useState(restaurant?.image_url ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(restaurant?.name ?? "");
    setCuisine(restaurant?.cuisine ?? "");
    setDescription(restaurant?.description ?? "");
    setImageUrl(restaurant?.image_url ?? "");
  }, [restaurant]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      if (restaurant) {
        const { error } = await supabase.from("restaurants").update({ name, cuisine, description, image_url: imageUrl }).eq("id", restaurant.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("restaurants").insert({ name, cuisine, description, image_url: imageUrl, owner_id: user.id });
        if (error) throw error;
      }
      toast.success("Saved");
      onSaved();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <h2 className="font-serif text-xl">{restaurant ? "Your restaurant" : "Create your restaurant"}</h2>
      <form onSubmit={save} className="mt-4 space-y-3">
        <div className="space-y-1.5"><Label>Name</Label><Input required value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Cuisine</Label><Input value={cuisine} onChange={(e) => setCuisine(e.target.value)} placeholder="Italian, Café, …" /></div>
        <div className="space-y-1.5"><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} /></div>
        <div className="space-y-1.5"><Label>Image URL</Label><Input type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" /></div>
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </form>
    </Card>
  );
}

function OfferDialog({ restaurantId, offer, onSaved }: { restaurantId: string; offer?: Offer; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(offer?.title ?? "");
  const [description, setDescription] = useState(offer?.description ?? "");
  const [reward, setReward] = useState(offer?.reward ?? "");
  const [required, setRequired] = useState(offer?.required_visits ?? 5);
  const [windowDays, setWindowDays] = useState(offer?.window_days ?? 30);

  const save = async () => {
    if (offer) {
      const { error } = await supabase.from("offers").update({ title, description, reward, required_visits: required, window_days: windowDays }).eq("id", offer.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("offers").insert({ restaurant_id: restaurantId, title, description, reward, required_visits: required, window_days: windowDays });
      if (error) return toast.error(error.message);
    }
    toast.success("Saved");
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">{offer ? "Edit" : (<><Plus className="size-4" /> New offer</>)}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{offer ? "Edit offer" : "Create offer"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Weekend Espresso Club" /></div>
          <div className="space-y-1.5"><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Visit 3 weekends in a row for…" /></div>
          <div className="space-y-1.5"><Label>Reward</Label><Input value={reward} onChange={(e) => setReward(e.target.value)} placeholder="Free drink / 10% off" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Required visits</Label><Input type="number" min={1} max={30} value={required} onChange={(e) => setRequired(Number(e.target.value))} /></div>
            <div className="space-y-1.5"><Label>Window (days)</Label><Input type="number" min={1} max={365} value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))} /></div>
          </div>
        </div>
        <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OfferCard({ offer, stamps, onChanged }: { offer: Offer; stamps: number; onChanged: () => void }) {
  const toggle = async (active: boolean) => {
    await supabase.from("offers").update({ active }).eq("id", offer.id);
    onChanged();
  };
  const remove = async () => {
    if (!confirm("Delete this offer?")) return;
    await supabase.from("offers").delete().eq("id", offer.id);
    onChanged();
  };
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-serif text-lg leading-tight">{offer.title}</h3>
        <Switch checked={offer.active} onCheckedChange={toggle} />
      </div>
      <p className="text-sm text-muted-foreground">{offer.description}</p>
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="secondary">{offer.required_visits} visits</Badge>
        <Badge variant="secondary">{offer.window_days}-day window</Badge>
        <Badge variant="secondary">Reward: {offer.reward}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">{stamps} stamp{stamps === 1 ? "" : "s"} logged by customers</p>
      <div className="flex gap-2">
        <OfferDialog restaurantId={offer.restaurant_id} offer={offer} onSaved={onChanged} />
        <Button variant="ghost" size="sm" onClick={remove}><Trash2 className="size-4" /></Button>
      </div>
    </Card>
  );
}

function VerifyPanel({ restaurantId }: { restaurantId: string }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastVerified, setLastVerified] = useState<{ title: string; reward: string } | null>(null);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (trimmed.length !== 6) return toast.error("Enter the 6-digit code");
    setBusy(true);
    try {
      // Find an unused, unexpired code for this restaurant
      const { data: rows, error } = await supabase
        .from("redemption_codes")
        .select("id, user_id, offer_id, expires_at, used_at, offers(title, reward)")
        .eq("restaurant_id", restaurantId)
        .eq("code", trimmed)
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .limit(1);
      if (error) throw error;
      const row = rows?.[0] as any;
      if (!row) {
        toast.error("Invalid or expired code");
        return;
      }
      // Mark used
      const { error: upErr } = await supabase
        .from("redemption_codes")
        .update({ used_at: new Date().toISOString() })
        .eq("id", row.id)
        .is("used_at", null);
      if (upErr) throw upErr;
      // Insert redemption (cycle complete)
      const { error: redErr } = await supabase.from("redemptions").insert({
        user_id: row.user_id,
        offer_id: row.offer_id,
        restaurant_id: restaurantId,
      });
      if (redErr) throw redErr;
      setLastVerified({ title: row.offers?.title ?? "Offer", reward: row.offers?.reward ?? "" });
      setCode("");
      toast.success("Reward verified!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <ScanLine className="size-5 text-primary" />
        <h2 className="font-serif text-xl">Verify customer reward</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Ask the customer to open their completed offer and read out the 6-digit code.
      </p>
      <form onSubmit={verify} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Input
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          placeholder="6-digit code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className="font-mono text-2xl tracking-[0.4em]"
        />
        <Button type="submit" disabled={busy || code.length !== 6} size="lg">
          {busy ? "Verifying…" : "Verify"}
        </Button>
      </form>
      {lastVerified && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-primary/10 p-3 text-sm text-primary">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">{lastVerified.title} — redeemed</p>
            <p className="opacity-80">Give the customer: {lastVerified.reward}</p>
          </div>
        </div>
      )}
    </Card>
  );
}
