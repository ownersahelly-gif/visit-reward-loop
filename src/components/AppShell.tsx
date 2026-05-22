import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, Store, ShieldCheck, Coffee, User, ScanLine } from "lucide-react";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, roles, signOut } = useAuth();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isOwner = roles.includes("owner");
  const isAdmin = roles.includes("admin");
  const isCustomer = roles.includes("customer");
  const inOwnerView = pathname.startsWith("/owner");

  // Toggle is shown only when the user truly has both customer and owner roles
  // (admins or test accounts). Real restaurant owners stay in the dashboard.
  const showCustomerToggle = isOwner && (isAdmin || (isCustomer && !isOwnerOnly(roles)));

  const [isStaff, setIsStaff] = useState(false);
  useEffect(() => {
    if (!user) return setIsStaff(false);
    (async () => {
      const { count } = await supabase
        .from("restaurant_staff" as any)
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      setIsStaff((count ?? 0) > 0);
    })();
  }, [user]);

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-3 sm:px-4">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <span className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground">
              <Coffee className="size-4" />
            </span>
            <span className="font-serif text-lg font-semibold tracking-tight">Stamp</span>
          </Link>
          <nav className="flex min-w-0 items-center gap-1 text-sm">
            {showCustomerToggle && (
              <div className="mr-1 inline-flex items-center rounded-full bg-secondary p-0.5 text-xs">
                <Link
                  to="/"
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition ${
                    !inOwnerView ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <User className="size-3" /> Customer
                </Link>
                <Link
                  to="/owner"
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition ${
                    inOwnerView ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Store className="size-3" /> Restaurant
                </Link>
              </div>
            )}
            {!showCustomerToggle && isOwner && (
              <Link to="/owner" className="rounded-md px-2 py-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
                <span className="inline-flex items-center gap-1.5"><Store className="size-3.5" /> Dashboard</span>
              </Link>
            )}
            {isStaff && (
              <Link to="/staff" className="rounded-md px-2 py-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
                <span className="inline-flex items-center gap-1.5"><ScanLine className="size-3.5" /> Verify</span>
              </Link>
            )}
            {isAdmin && (
              <Link to="/admin" className="rounded-md px-2 py-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
                <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5" /> Admin</span>
              </Link>
            )}
            {user ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await signOut();
                  router.navigate({ to: "/auth" });
                }}
              >
                <LogOut className="size-3.5" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            ) : (
              <Link to="/auth">
                <Button size="sm">Sign in</Button>
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-3 py-6 sm:px-4 sm:py-8">{children}</main>
    </div>
  );
}

// owner-only = owner role present, customer role absent
function isOwnerOnly(roles: string[]) {
  return roles.includes("owner") && !roles.includes("customer");
}
