import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, CheckCircle2, Truck, Package, XCircle, Clock, Nfc } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@/lib/edge";
import {
  listAllBranchRequests,
  acceptBranchRequest,
  markBranchRequestShipped,
  markBranchRequestDelivered,
  rejectBranchRequest,
} from "@/lib/branch-requests.functions";

export const Route = createFileRoute("/admin")({ component: AdminPage });

type Restaurant = { id: string; name: string; cuisine: string | null; status: string; created_at: string };

function AdminPage() {
  const { user, roles, loading, signOut } = useAuth();
  const nav = useNavigate();
  const [items, setItems] = useState<Restaurant[]>([]);
  const [tick, setTick] = useState(0);

  const handleSignOut = async () => {
    await signOut();
    nav({ to: "/auth" });
  };

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  useEffect(() => {
    if (!roles.includes("admin")) return;
    (async () => {
      const { data } = await supabase.from("restaurants").select("*").order("status").order("created_at", { ascending: false });
      setItems((data ?? []) as Restaurant[]);
    })();
  }, [roles, tick]);

  if (loading) return <AppShell><p>Loading…</p></AppShell>;

  if (!roles.includes("admin")) {
    return (
      <AppShell>
        <Card className="space-y-2 p-6">
          <h1 className="font-serif text-2xl">Admin access required</h1>
          <p className="text-sm text-muted-foreground">
            Your account doesn't have admin privileges.
          </p>
          {user && (
            <p className="text-xs text-muted-foreground">Your user id: <code>{user.id}</code></p>
          )}
        </Card>
      </AppShell>
    );
  }

  const toggle = async (r: Restaurant, active: boolean) => {
    const { error } = await supabase
      .from("restaurants")
      .update({ status: active ? "active" : "in_progress" })
      .eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success(active ? "Restaurant approved" : "Restaurant set to in progress");
    setTick((t) => t + 1);
  };

  return (
    <AppShell>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Network admin</h1>
          <p className="mt-1 text-sm text-muted-foreground">Approve restaurants and fulfil branch NFC card orders.</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleSignOut}>
          <LogOut className="size-4" />
          Sign out
        </Button>
      </div>

      <Tabs defaultValue="restaurants" className="mt-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="restaurants">Restaurants</TabsTrigger>
          <TabsTrigger value="requests">Branch requests</TabsTrigger>
        </TabsList>

        <TabsContent value="restaurants" className="mt-6 space-y-3">
          {items.map((r) => (
            <Card key={r.id} className="flex items-center justify-between gap-4 p-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{r.name}</h3>
                  <Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status === "active" ? "Active" : "Pending"}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{r.cuisine}</p>
              </div>
              <Switch checked={r.status === "active"} onCheckedChange={(v) => toggle(r, v)} />
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="requests" className="mt-6">
          <BranchRequestsAdminPanel />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

type ReqRow = {
  id: string;
  restaurant_id: string;
  request_type: "new" | "reissue";
  branch_label: string;
  staff_email: string | null;
  staff_full_name: string | null;
  staff_password: string | null;
  fee_amount: number;
  currency: string;
  status: string;
  reject_reason: string | null;
  shipping_address: string | null;
  notes: string | null;
  created_at: string;
  accepted_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  paid_at: string | null;
  resulting_staff_id: string | null;
  restaurants?: { name: string } | null;
};

function statusPill(status: string) {
  const map: Record<string, { l: string; cls: string; Icon: any }> = {
    pending: { l: "Pending", cls: "bg-secondary text-secondary-foreground", Icon: Clock },
    accepted: { l: "Accepted", cls: "bg-primary/15 text-primary", Icon: CheckCircle2 },
    shipped: { l: "Shipped", cls: "bg-primary/15 text-primary", Icon: Truck },
    delivered: { l: "Delivered & paid", cls: "bg-emerald-500/15 text-emerald-700", Icon: Package },
    rejected: { l: "Rejected", cls: "bg-destructive/15 text-destructive", Icon: XCircle },
  };
  const x = map[status] ?? map.pending;
  const Icon = x.Icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${x.cls}`}>
      <Icon className="size-3" /> {x.l}
    </span>
  );
}

function BranchRequestsAdminPanel() {
  const list = useServerFn(listAllBranchRequests);
  const accept = useServerFn(acceptBranchRequest);
  const ship = useServerFn(markBranchRequestShipped);
  const deliver = useServerFn(markBranchRequestDelivered);
  const reject = useServerFn(rejectBranchRequest);
  const [rows, setRows] = useState<ReqRow[]>([]);
  const [tick, setTick] = useState(0);
  const [tokenShown, setTokenShown] = useState<{ id: string; token: string } | null>(null);
  const [rejectFor, setRejectFor] = useState<ReqRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await list();
        setRows(res.requests as ReqRow[]);
      } catch (e: any) {
        toast.error(e.message);
      }
    })();
  }, [tick, list]);

  const reload = () => setTick((t) => t + 1);

  const doAccept = async (r: ReqRow) => {
    try {
      const res = await accept({ data: { requestId: r.id } });
      toast.success("Accepted — card token generated");
      setTokenShown({ id: r.id, token: res.token });
      reload();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const doShip = async (r: ReqRow) => {
    try {
      await ship({ data: { requestId: r.id } });
      toast.success("Marked as shipped");
      reload();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const doDeliver = async (r: ReqRow) => {
    try {
      await deliver({ data: { requestId: r.id } });
      toast.success("Marked delivered and paid");
      reload();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const doReject = async () => {
    if (!rejectFor) return;
    try {
      await reject({ data: { requestId: rejectFor.id, reason: rejectReason } });
      toast.success("Rejected");
      setRejectFor(null);
      setRejectReason("");
      reload();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No branch requests yet.</p>;
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <Card key={r.id} className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">
                {r.restaurants?.name ?? "Restaurant"} — {r.branch_label}{" "}
                <span className="text-xs text-muted-foreground">
                  · {r.request_type === "reissue" ? "Reissue" : "New branch"}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {r.fee_amount} {r.currency} · cash on delivery · {new Date(r.created_at).toLocaleString()}
              </p>
            </div>
            {statusPill(r.status)}
          </div>

          {r.request_type === "new" && (
            <div className="rounded-md bg-secondary/40 p-2 text-xs">
              <p><span className="text-muted-foreground">Staff:</span> {r.staff_full_name} · <span className="font-mono">{r.staff_email}</span></p>
              <p><span className="text-muted-foreground">Temp password:</span> <span className="font-mono">{r.staff_password}</span></p>
            </div>
          )}

          {r.shipping_address && (
            <div className="text-xs">
              <p className="text-muted-foreground">Shipping address</p>
              <p className="whitespace-pre-wrap">{r.shipping_address}</p>
            </div>
          )}

          {r.notes && (
            <div className="text-xs">
              <p className="text-muted-foreground">Notes</p>
              <p className="whitespace-pre-wrap">{r.notes}</p>
            </div>
          )}

          {r.reject_reason && (
            <p className="text-xs text-destructive">Rejected: {r.reject_reason}</p>
          )}

          <div className="flex flex-wrap gap-2">
            {r.status === "pending" && (
              <>
                <Button size="sm" onClick={() => doAccept(r)}>
                  <CheckCircle2 className="size-4" /> Accept & generate card
                </Button>
                <Button size="sm" variant="outline" onClick={() => setRejectFor(r)}>
                  <XCircle className="size-4" /> Reject
                </Button>
              </>
            )}
            {r.status === "accepted" && (
              <Button size="sm" onClick={() => doShip(r)}>
                <Truck className="size-4" /> Mark shipped
              </Button>
            )}
            {r.status === "shipped" && (
              <Button size="sm" onClick={() => doDeliver(r)}>
                <Package className="size-4" /> Delivered & paid
              </Button>
            )}
            {(r.status === "accepted" || r.status === "shipped") && r.resulting_staff_id && (
              <WriteCardButton staffId={r.resulting_staff_id} />
            )}
          </div>
        </Card>
      ))}

      <Dialog open={!!tokenShown} onOpenChange={(o) => !o && setTokenShown(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Card token generated</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Program a blank NFC card with this token, then ship it.
          </p>
          <p className="break-all rounded bg-secondary/50 p-2 font-mono text-xs">
            {tokenShown?.token}
          </p>
          <DialogFooter>
            <Button onClick={() => setTokenShown(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectFor} onOpenChange={(o) => { if (!o) { setRejectFor(null); setRejectReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject request</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectFor(null)}>Cancel</Button>
            <Button onClick={doReject} disabled={!rejectReason}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WriteCardButton({ staffId }: { staffId: string }) {
  const [busy, setBusy] = useState(false);
  const supported = typeof window !== "undefined" && "NDEFReader" in window;

  const writeCard = async () => {
    if (!supported) {
      toast.error("Use Chrome on Android to write NFC cards");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("restaurant_staff")
        .select("nfc_token")
        .eq("id", staffId)
        .maybeSingle();
      if (error || !data?.nfc_token) throw new Error("No token");
      // @ts-ignore NDEFReader not in lib.dom
      const writer = new window.NDEFReader();
      await writer.write({ records: [{ recordType: "text", data: data.nfc_token }] });
      toast.success("Card programmed");
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't write card");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={writeCard} disabled={busy}>
      <Nfc className="size-4" /> {busy ? "Tap a card…" : "Write to NFC card"}
    </Button>
  );
}
