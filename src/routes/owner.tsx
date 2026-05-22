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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2, ScanLine, CheckCircle2, ChevronDown, Users, Store, UserPlus, GitBranch, Package, Truck, XCircle, Clock } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { removeStaffAccount } from "@/lib/staff.functions";
import {
  createBranchRequest,
  listMyBranchRequests,
} from "@/lib/branch-requests.functions";

export const Route = createFileRoute("/owner")({ component: OwnerPage });

type Restaurant = { id: string; name: string; description: string | null; cuisine: string | null; image_url: string | null; status: string };
type Offer = { id: string; title: string; description: string | null; reward: string; required_visits: number; window_days: number; active: boolean; restaurant_id: string };

function OwnerPage() {
  const { user, roles, loading } = useAuth();
  const nav = useNavigate();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [customerCount, setCustomerCount] = useState<Record<string, number>>({});
  const [tick, setTick] = useState(0);

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
  }, [user, tick]);

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
      <p className="mt-1 text-sm text-muted-foreground">Manage your restaurant, customers and staff.</p>

      <Tabs defaultValue="restaurant" className="mt-6">
        <TabsList className="grid h-auto w-full grid-cols-3 p-1">
          <TabsTrigger value="restaurant" className="min-w-0 gap-1 px-1.5 py-2 text-xs sm:text-sm">
            <Store className="size-3.5 shrink-0" /> <span className="truncate">Restaurant</span>
          </TabsTrigger>
          <TabsTrigger value="customers" className="min-w-0 gap-1 px-1.5 py-2 text-xs sm:text-sm">
            <Users className="size-3.5 shrink-0" /> <span className="truncate">Customers</span>
          </TabsTrigger>
          <TabsTrigger value="staff" className="min-w-0 gap-1 px-1.5 py-2 text-xs sm:text-sm">
            <GitBranch className="size-3.5 shrink-0" /> <span className="truncate">Staff</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="restaurant" className="mt-6 space-y-6">
          <CollapsibleRestaurant restaurant={restaurant} onSaved={() => setTick((t) => t + 1)} />

          {restaurant && (
            <VerifyPanel restaurantId={restaurant.id} />
          )}

          {restaurant && (
            <section className="space-y-4">
              <div className="flex items-end justify-between">
                <div>
                  <h2 className="font-serif text-2xl">Offers</h2>
                  <p className="text-sm text-muted-foreground">Goals customers can chase to earn a reward.</p>
                </div>
                <OfferDialog restaurantId={restaurant.id} onSaved={() => setTick((t) => t + 1)} />
              </div>
              {offers.length === 0 && <p className="text-sm text-muted-foreground">No offers yet.</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                {offers.map((o) => (
                  <OfferCard
                    key={o.id}
                    offer={o}
                    stamps={customerCount[o.id] ?? 0}
                    onChanged={() => setTick((t) => t + 1)}
                  />
                ))}
              </div>
            </section>
          )}
        </TabsContent>

        <TabsContent value="customers" className="mt-6">
          {restaurant ? <CustomersPanel restaurantId={restaurant.id} /> : <SetupRestaurantNotice />}
        </TabsContent>

        <TabsContent value="staff" className="mt-6">
          {restaurant ? <StaffPanel restaurantId={restaurant.id} /> : <SetupRestaurantNotice />}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function SetupRestaurantNotice() {
  return (
    <Card className="p-5">
      <h2 className="font-serif text-xl">Create your restaurant first</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Save your restaurant profile, then this section will show its customer and staff tools.
      </p>
    </Card>
  );
}

function CollapsibleRestaurant({ restaurant, onSaved }: { restaurant: Restaurant | null; onSaved: () => void }) {
  const [open, setOpen] = useState(!restaurant);
  return (
    <Card className="overflow-hidden p-0">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 p-5 text-left transition hover:bg-secondary/40">
          <div className="min-w-0">
            <h2 className="font-serif text-xl truncate">{restaurant?.name ?? "Create your restaurant"}</h2>
            <div className="mt-1 flex items-center gap-2">
              {restaurant ? (
                <Badge variant={restaurant.status === "active" ? "default" : "secondary"}>
                  {restaurant.status === "active" ? "Active partner" : "Pending approval"}
                </Badge>
              ) : (
                <p className="text-xs text-muted-foreground">Tap to set up your profile</p>
              )}
              {restaurant?.cuisine && <span className="text-xs text-muted-foreground">{restaurant.cuisine}</span>}
            </div>
          </div>
          <ChevronDown className={`size-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t border-border">
          <div className="p-5">
            <RestaurantForm restaurant={restaurant} onSaved={onSaved} />
            {restaurant && (
              <p className="mt-3 text-xs text-muted-foreground">
                {restaurant.status === "active"
                  ? "Your restaurant is live to all customers."
                  : "An admin needs to approve your collaboration before customers can stamp visits."}
              </p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
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
    <form onSubmit={save} className="space-y-3">
      <div className="space-y-1.5"><Label>Name</Label><Input required value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Cuisine</Label><Input value={cuisine} onChange={(e) => setCuisine(e.target.value)} placeholder="Italian, Café, …" /></div>
      <div className="space-y-1.5"><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} /></div>
      <div className="space-y-1.5"><Label>Image URL</Label><Input type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" /></div>
      <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
    </form>
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
      const { error: upErr } = await supabase
        .from("redemption_codes")
        .update({ used_at: new Date().toISOString() })
        .eq("id", row.id)
        .is("used_at", null);
      if (upErr) throw upErr;
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const { error: redErr } = await supabase.from("redemptions").insert({
        user_id: row.user_id,
        offer_id: row.offer_id,
        restaurant_id: restaurantId,
        verified_by: authUser?.id ?? null,
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

type CustomerRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  birthday: string | null;
  visits: number;
  rewards: number;
  branches: string[];
  lastBranch: string | null;
  lastAt: string | null;
};

function CustomersPanel({ restaurantId }: { restaurantId: string }) {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: offers } = await supabase.from("offers").select("id").eq("restaurant_id", restaurantId);
      const offerIds = (offers ?? []).map((o) => o.id);
      const visitsRes = offerIds.length
        ? await supabase
            .from("visits")
            .select("user_id, offer_id, verified_by, visited_at")
            .in("offer_id", offerIds)
        : { data: [] as any[] };
      const visits = visitsRes.data ?? [];
      const { data: reds } = await supabase
        .from("redemptions")
        .select("user_id, redeemed_at")
        .eq("restaurant_id", restaurantId);
      const { data: staff } = await supabase
        .from("restaurant_staff" as any)
        .select("user_id, label")
        .eq("restaurant_id", restaurantId);
      const branchByStaff: Record<string, string> = {};
      (staff ?? []).forEach((s: any) => {
        branchByStaff[s.user_id] = s.label || "Main branch";
      });

      type C = { v: number; r: number; branches: Set<string>; lastBranch: string | null; lastAt: string | null };
      const counts: Record<string, C> = {};
      const mk = (): C => ({ v: 0, r: 0, branches: new Set(), lastBranch: null, lastAt: null });
      visits.forEach((v: any) => {
        const c = (counts[v.user_id] = counts[v.user_id] ?? mk());
        c.v++;
        const label = v.verified_by ? (branchByStaff[v.verified_by] ?? "Unknown branch") : "Unverified";
        c.branches.add(label);
        if (!c.lastAt || v.visited_at > c.lastAt) {
          c.lastAt = v.visited_at;
          c.lastBranch = label;
        }
      });
      (reds ?? []).forEach((r: any) => {
        const c = (counts[r.user_id] = counts[r.user_id] ?? mk());
        c.r++;
      });

      const userIds = Object.keys(counts);
      if (userIds.length === 0) { setRows([]); setLoading(false); return; }
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, email, birthday").in("id", userIds);
      const list: CustomerRow[] = userIds.map((uid) => {
        const p = (profiles ?? []).find((x) => x.id === uid);
        const c = counts[uid];
        return {
          user_id: uid,
          full_name: p?.full_name ?? null,
          email: (p as any)?.email ?? null,
          birthday: (p as any)?.birthday ?? null,
          visits: c.v,
          rewards: c.r,
          branches: Array.from(c.branches),
          lastBranch: c.lastBranch,
          lastAt: c.lastAt,
        };
      }).sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? "") || b.visits - a.visits);
      setRows(list);
      setLoading(false);
    };

    load();

    const offerIdSet = new Set<string>();
    const channel = supabase
      .channel(`owner-visits-${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "visits" },
        (payload: any) => {
          // Reload if the visit belongs to one of our offers (cheap re-fetch)
          if (offerIdSet.size === 0 || offerIdSet.has(payload.new?.offer_id)) load();
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "redemptions", filter: `restaurant_id=eq.${restaurantId}` },
        () => load(),
      )
      .subscribe();
    // Track our offer ids so the visits filter is fast
    supabase.from("offers").select("id").eq("restaurant_id", restaurantId).then(({ data }) => {
      (data ?? []).forEach((o: any) => offerIdSet.add(o.id));
    });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId]);


  return (
    <Card className="p-5">
      <h2 className="font-serif text-xl">Customer database</h2>
      <p className="mt-1 text-sm text-muted-foreground">Everyone who has stamped a visit with you. Updates live as staff scan.</p>
      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No customers yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-2">Name</th>
                <th className="py-2 pr-2">Email</th>
                <th className="py-2 pr-2">Birthday</th>
                <th className="py-2 pr-2">Last branch</th>
                <th className="py-2 pr-2">All branches</th>
                <th className="py-2 pr-2 text-right">Visits</th>
                <th className="py-2 pr-2 text-right">Rewards</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user_id} className="border-b last:border-0">
                  <td className="py-2 pr-2 font-medium">{r.full_name ?? "—"}</td>
                  <td className="py-2 pr-2 text-muted-foreground">{r.email ?? "—"}</td>
                  <td className="py-2 pr-2 text-muted-foreground">{r.birthday ?? "—"}</td>
                  <td className="py-2 pr-2">
                    {r.lastBranch ? <Badge variant="secondary">{r.lastBranch}</Badge> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="py-2 pr-2 text-muted-foreground">
                    {r.branches.length ? r.branches.join(", ") : "—"}
                  </td>
                  <td className="py-2 pr-2 text-right">{r.visits}</td>
                  <td className="py-2 pr-2 text-right">{r.rewards}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

type StaffRow = { id: string; user_id: string; label: string | null; password: string | null; nfc_token: string | null; profiles?: { full_name: string | null; email: string | null } | null };

function StaffPanel({ restaurantId }: { restaurantId: string }) {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [scans, setScans] = useState<Record<string, number>>({});
  const [tick, setTick] = useState(0);
  const [openRow, setOpenRow] = useState<StaffRow | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("restaurant_staff" as any)
        .select("id, user_id, label, password, nfc_token")
        .eq("restaurant_id", restaurantId);
      if (error) {
        console.error("staff load error", error);
      }
      let list = (data ?? []) as any[];
      if (list.length) {
        const ids = list.map((l) => l.user_id);
        const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
        list = list.map((l) => ({ ...l, profiles: (profs ?? []).find((p) => p.id === l.user_id) ?? null }));
      }
      setRows(list);

      // Scan counts per staff member
      const { data: reds } = await supabase
        .from("redemptions")
        .select("verified_by")
        .eq("restaurant_id", restaurantId)
        .not("verified_by", "is", null);
      const counts: Record<string, number> = {};
      (reds ?? []).forEach((r: any) => {
        if (!r.verified_by) return;
        counts[r.verified_by] = (counts[r.verified_by] ?? 0) + 1;
      });
      setScans(counts);
    })();
  }, [restaurantId, tick]);

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl">Staff & branches</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Each branch needs an NFC card. Request one from the admin — it's <strong>1000 EGP</strong>, paid cash on delivery.
          </p>
        </div>
        <RequestBranchDialog
          restaurantId={restaurantId}
          existingStaff={rows.map((r) => ({ id: r.id, label: r.label, email: r.profiles?.email ?? null }))}
          onSubmitted={() => setTick((t) => t + 1)}
        />
      </div>

      <BranchRequestsList restaurantId={restaurantId} reloadKey={tick} />

      <div className="pt-2">
        <h3 className="text-sm font-medium">Active branches</h3>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No branches yet. Submit a request above.</p>
        ) : (
          <ul className="mt-2 divide-y">
            {rows.map((s) => {
              const n = scans[s.user_id] ?? 0;
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                  <button
                    type="button"
                    onClick={() => setOpenRow(s)}
                    className="min-w-0 flex-1 text-left hover:opacity-80"
                  >
                    <p className="truncate font-medium">{s.label ?? s.profiles?.full_name ?? "Branch"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {s.profiles?.email}
                      {s.nfc_token ? <> · <span className="text-primary">card active</span></> : <> · <span className="text-muted-foreground">no card yet</span></>}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <ScanLine className="mr-1 inline size-3" />
                      {n} scan{n === 1 ? "" : "s"}
                    </p>
                  </button>
                  <Badge variant="secondary" className="whitespace-nowrap">{n}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={!!openRow} onOpenChange={(o) => !o && setOpenRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{openRow?.label ?? openRow?.profiles?.full_name ?? "Branch"}</DialogTitle>
          </DialogHeader>
          {openRow && (
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Staff login email</p>
                <p className="font-mono">{openRow.profiles?.email ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Password</p>
                <p className="font-mono">{openRow.password ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">NFC card status</p>
                <p className="font-medium">{openRow.nfc_token ? "Active" : "Not issued yet"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total scans</p>
                <p className="font-medium">{scans[openRow.user_id] ?? 0}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Lost the card? Use <strong>Request branch → Reissue</strong> to order a replacement.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string; Icon: any }> = {
    pending: { label: "Pending review", cls: "bg-secondary text-secondary-foreground", Icon: Clock },
    accepted: { label: "Accepted — preparing card", cls: "bg-primary/15 text-primary", Icon: CheckCircle2 },
    shipped: { label: "Shipped", cls: "bg-primary/15 text-primary", Icon: Truck },
    delivered: { label: "Delivered & paid", cls: "bg-emerald-500/15 text-emerald-700", Icon: Package },
    rejected: { label: "Rejected", cls: "bg-destructive/15 text-destructive", Icon: XCircle },
  };
  const m = map[status] ?? map.pending;
  const Icon = m.Icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${m.cls}`}>
      <Icon className="size-3" /> {m.label}
    </span>
  );
}

function BranchRequestsList({ restaurantId, reloadKey }: { restaurantId: string; reloadKey: number }) {
  const list = useServerFn(listMyBranchRequests);
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const res = await list({ data: { restaurantId } });
        setRows(res.requests);
      } catch (e: any) {
        console.error(e);
      }
    })();
  }, [restaurantId, reloadKey, list]);

  if (rows.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-medium">My requests</h3>
      <ul className="mt-2 space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="rounded-lg border border-border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {r.branch_label}{" "}
                  <span className="text-xs text-muted-foreground">
                    · {r.request_type === "reissue" ? "Reissue" : "New branch"}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.fee_amount} {r.currency} · cash on delivery
                </p>
                {r.reject_reason && (
                  <p className="mt-1 text-xs text-destructive">Reason: {r.reject_reason}</p>
                )}
              </div>
              {statusBadge(r.status)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RequestBranchDialog({
  restaurantId,
  existingStaff,
  onSubmitted,
}: {
  restaurantId: string;
  existingStaff: { id: string; label: string | null; email: string | null }[];
  onSubmitted: () => void;
}) {
  const create = useServerFn(createBranchRequest);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"new" | "reissue">("new");
  const [branchLabel, setBranchLabel] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [existingStaffId, setExistingStaffId] = useState<string>("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setMode("new"); setBranchLabel(""); setFullName(""); setEmail("");
    setPassword(""); setExistingStaffId(""); setShippingAddress(""); setNotes("");
  };

  const submit = async () => {
    setBusy(true);
    try {
      await create({
        data: {
          restaurantId,
          requestType: mode,
          branchLabel,
          staffEmail: mode === "new" ? email : undefined,
          staffPassword: mode === "new" ? password : undefined,
          staffFullName: mode === "new" ? fullName : undefined,
          existingStaffId: mode === "reissue" ? existingStaffId : undefined,
          shippingAddress,
          notes: notes || undefined,
        },
      });
      toast.success("Request submitted. Admin will review and ship the card.");
      setOpen(false);
      reset();
      onSubmitted();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to submit request");
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    !!branchLabel &&
    shippingAddress.length >= 5 &&
    (mode === "reissue"
      ? !!existingStaffId
      : !!fullName && !!email && password.length >= 6);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><UserPlus className="size-4" /> Request branch</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request a branch NFC card</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            Fee: <strong className="text-foreground">1000 EGP</strong>, cash on delivery.
            Admin reviews, then ships the programmed NFC card to your address.
          </div>

          <Tabs value={mode} onValueChange={(v) => setMode(v as "new" | "reissue")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="new">New branch</TabsTrigger>
              <TabsTrigger value="reissue" disabled={existingStaff.length === 0}>
                Reissue (lost card)
              </TabsTrigger>
            </TabsList>

            <TabsContent value="new" className="mt-3 space-y-3">
              <div className="space-y-1.5">
                <Label>Branch name</Label>
                <Input value={branchLabel} onChange={(e) => setBranchLabel(e.target.value)} placeholder="New Cairo" />
              </div>
              <div className="space-y-1.5">
                <Label>Staff full name</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Sara Hossam" />
              </div>
              <div className="space-y-1.5">
                <Label>Staff login email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Temporary password</Label>
                <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
              </div>
            </TabsContent>

            <TabsContent value="reissue" className="mt-3 space-y-3">
              <div className="space-y-1.5">
                <Label>Branch</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={existingStaffId}
                  onChange={(e) => {
                    setExistingStaffId(e.target.value);
                    const found = existingStaff.find((s) => s.id === e.target.value);
                    if (found?.label) setBranchLabel(found.label);
                  }}
                >
                  <option value="">Select a branch…</option>
                  {existingStaff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label ?? s.email ?? s.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Branch name (confirm)</Label>
                <Input value={branchLabel} onChange={(e) => setBranchLabel(e.target.value)} />
              </div>
              <p className="text-xs text-muted-foreground">
                The old card stops working as soon as admin ships the replacement.
              </p>
            </TabsContent>
          </Tabs>

          <div className="space-y-1.5">
            <Label>Shipping address</Label>
            <Textarea
              value={shippingAddress}
              onChange={(e) => setShippingAddress(e.target.value)}
              placeholder="Street, building, city, governorate, contact phone"
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Notes <span className="text-xs text-muted-foreground">(optional)</span></Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy || !canSubmit}>
            {busy ? "Submitting…" : "Submit request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

  );
}

