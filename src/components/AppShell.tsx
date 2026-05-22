import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, Store, ShieldCheck, Coffee, User, ScanLine, Trophy } from "lucide-react";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, roles, signOut } = useAuth();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isOwner = roles.includes("owner");
  const isAdmin = roles.includes("admin");
  const isCustomer = roles.includes("customer");
  const inOwnerView = pathname.startsWith("/owner");

  // Toggle is shown only when the account legitimately has both sides
  // (admins, or older accounts with both roles). Pure restaurant owners stay
  // in the dashboard only. Staff never see the customer toggle.
  // (showCustomerToggle is computed below after isStaff is known)

  const [isStaff, setIsStaff] = useState(false);
  const [staffChecked, setStaffChecked] = useState(false);
  useEffect(() => {
    if (!user) {
      setIsStaff(false);
      setStaffChecked(true);
      return;
    }
    setStaffChecked(false);
    (async () => {
      const { count } = await supabase
        .from("restaurant_staff" as any)
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      setIsStaff((count ?? 0) > 0);
      setStaffChecked(true);
    })();
  }, [user]);

  const showCustomerToggle = isOwner && (isAdmin || isCustomer) && !isStaff;

  // Route guard: keep restaurant owners and staff out of the customer flow.
  // Customers / admins are unaffected. Owners with a customer role (legacy
  // accounts + admins) keep the toggle and can browse both sides.
  useEffect(() => {
    if (!user || !staffChecked) return;
    const onCustomerSurface =
      pathname === "/" || pathname.startsWith("/restaurants");
    if (!onCustomerSurface) return;
    // Staff accounts are restricted to /staff even if they also have the
    // auto-assigned customer role (handle_new_user trigger always grants it).
    if (isStaff && !isAdmin) {
      router.navigate({ to: "/staff" });
      return;
    }
    if (isOwner && !isCustomer && !isAdmin) {
      router.navigate({ to: "/owner" });
    }
  }, [user, staffChecked, isStaff, isOwner, isAdmin, isCustomer, pathname, router]);

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-background text-foreground">
      <div aria-hidden className="bg-background" style={{ height: "env(safe-area-inset-top)" }} />
      <header
        className="sticky z-40 border-b border-border/60 bg-background/80 backdrop-blur"
        style={{ top: "env(safe-area-inset-top)" }}
      >
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
            {user && !isStaff && (isCustomer || isAdmin || !isOwner) && (
              <Link to="/rewards" className="rounded-md px-2 py-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
                <span className="inline-flex items-center gap-1.5"><Trophy className="size-3.5" /> Rewards</span>
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
                <span className="ml-1">Sign out</span>
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
