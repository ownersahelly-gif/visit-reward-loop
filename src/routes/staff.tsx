import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { ScanLine, CheckCircle2 } from "lucide-react";

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
  const [last, setLast] = useState<{ title: string; reward: string } | null>(null);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = code.trim();
    if (t.length !== 6) return toast.error("Enter the 6-digit code");
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
      if (!row) return toast.error("Invalid or expired code");
      const { error: u1 } = await supabase.from("redemption_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id).is("used_at", null);
      if (u1) throw u1;
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const { error: u2 } = await supabase.from("redemptions").insert({ user_id: row.user_id, offer_id: row.offer_id, restaurant_id: restaurantId, verified_by: authUser?.id ?? null });
      if (u2) throw u2;
      setLast({ title: row.offers?.title ?? "Offer", reward: row.offers?.reward ?? "" });
      setCode("");
      toast.success("Reward verified!");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <form onSubmit={verify} className="flex flex-col gap-3 sm:flex-row">
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
      </form>
      {last && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-primary/10 p-3 text-sm text-primary">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">{last.title} — redeemed</p>
            <p className="opacity-80">Give the customer: {last.reward}</p>
          </div>
        </div>
      )}
    </>
  );
}
