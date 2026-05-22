import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { QrScannerDialog, parseScannedCode } from "@/components/QrScannerDialog";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { ScanLine, CheckCircle2, QrCode } from "lucide-react";

export const Route = createFileRoute("/staff")({ component: StaffPage });

type Assignment = { id: string; restaurant_id: string; label: string | null; restaurants: { name: string } };

function StaffPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("restaurant_staff" as any)
        .select("id, restaurant_id, label, restaurants(name)")
        .eq("user_id", user.id);
      setAssignments((data ?? []) as any);
    })();
  }, [user]);

  return (
    <AppShell>
      <h1 className="font-serif text-3xl font-semibold">Verify rewards</h1>
      <p className="mt-1 text-sm text-muted-foreground">Enter the customer's 6-digit code to confirm their reward.</p>
      {assignments.length === 0 && (
        <Card className="mt-6 p-5 text-sm text-muted-foreground">
          You don't have any restaurant assignments yet. Ask the owner to add you.
        </Card>
      )}
      <div className="mt-6 space-y-4">
        {assignments.map((a) => (
          <Card key={a.id} className="p-5">
            <h2 className="font-serif text-xl">{a.restaurants?.name}</h2>
            {a.label && <p className="text-xs text-muted-foreground">{a.label}</p>}
            <div className="mt-4">
              <VerifyForm restaurantId={a.restaurant_id} />
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}

function VerifyForm({ restaurantId }: { restaurantId: string }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ title: string; reward: string; customer?: string } | null>(null);
  const [reveal, setReveal] = useState<{ title: string; reward: string; customer?: string } | null>(null);
  const [countdown, setCountdown] = useState(5);
  const [scannerOpen, setScannerOpen] = useState(false);

  useEffect(() => {
    if (!reveal) return;
    setCountdown(5);
    const i = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);
    const t = setTimeout(() => setReveal(null), 5000);
    return () => { clearInterval(i); clearTimeout(t); };
  }, [reveal]);


  const verifyCode = async (raw: string, scannedRestaurantId?: string) => {
    const t = raw.trim();
    if (t.length !== 6) {
      toast.error("Invalid code");
      return;
    }
    if (scannedRestaurantId && scannedRestaurantId !== restaurantId) {
      toast.error("Wrong restaurant", {
        description: "This reward code belongs to a different restaurant.",
      });
      return;
    }
    setBusy(true);
    try {
      const { data: rows, error } = await supabase
        .from("redemption_codes")
        .select("id, user_id, offer_id, expires_at, used_at, offers(title, reward)")
        .eq("restaurant_id", restaurantId)
        .eq("code", t)
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .limit(1);
      if (error) throw error;
      const row = rows?.[0] as any;
      if (!row) {
        toast.error("Invalid or expired code");
        return;
      }
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", row.user_id)
        .maybeSingle();
      row.profiles = prof;
      await finalize(row);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }

    async function finalize(row: any) {
      const { error: u1 } = await supabase
        .from("redemption_codes")
        .update({ used_at: new Date().toISOString() })
        .eq("id", row.id)
        .is("used_at", null);
      if (u1) throw u1;
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const { error: u2 } = await supabase.from("redemptions").insert({
        user_id: row.user_id,
        offer_id: row.offer_id,
        restaurant_id: restaurantId,
        verified_by: authUser?.id ?? null,
      });
      if (u2) throw u2;
      setLast({
        title: row.offers?.title ?? "Offer",
        reward: row.offers?.reward ?? "",
        customer: row.profiles?.full_name ?? row.profiles?.email ?? undefined,
      });
      setReveal({
        title: row.offers?.title ?? "Offer",
        reward: row.offers?.reward ?? "",
        customer: row.profiles?.full_name ?? row.profiles?.email ?? undefined,
      });
      setCode("");
      toast.success("Reward verified!");
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    verifyCode(code);
  };

  const onScanned = (raw: string) => {
    setScannerOpen(false);
    const parsed = parseScannedCode(raw);
    if (!parsed) {
      toast.error("Unrecognized QR code");
      return;
    }
    setCode(parsed.code);
    verifyCode(parsed.code, parsed.restaurantId);
  };

  return (
    <>
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
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
          <ScanLine className="size-4" />
          {busy ? "Verifying…" : "Verify"}
        </Button>
        <Button type="button" variant="outline" size="lg" onClick={() => setScannerOpen(true)}>
          <QrCode className="size-4" />
          Scan QR
        </Button>
      </form>
      {last && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-primary/10 p-3 text-sm text-primary">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">{last.title} — redeemed</p>
            <p className="opacity-80">Give the customer: {last.reward}</p>
            {last.customer && <p className="text-xs opacity-70">For: {last.customer}</p>}
          </div>
        </div>
      )}
      <QrScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onResult={onScanned}
      />
    </>
  );
}
