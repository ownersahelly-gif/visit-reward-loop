import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { toast } from "sonner";

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
            Your account doesn't have admin privileges. Ask another admin to grant you the <code>admin</code> role
            in the <strong>user_roles</strong> table.
          </p>
          {user && (
            <p className="text-xs text-muted-foreground">
              Your user id: <code>{user.id}</code>
            </p>
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
      <h1 className="font-serif text-3xl font-semibold">Network admin</h1>
      <p className="mt-1 text-sm text-muted-foreground">Approve partner restaurants to make them visible to customers.</p>

      <div className="mt-8 space-y-3">
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
      </div>
    </AppShell>
  );
}
