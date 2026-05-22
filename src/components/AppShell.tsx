import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { LogOut, Store, ShieldCheck, Coffee, User } from "lucide-react";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, roles, signOut } = useAuth();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isOwner = roles.includes("owner");
  const isAdmin = roles.includes("admin");
  const inOwnerView = pathname.startsWith("/owner");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground">
              <Coffee className="size-4" />
            </span>
            <span className="font-serif text-lg font-semibold tracking-tight">Stamp</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {isOwner && (
              <div className="mr-1 inline-flex items-center rounded-full bg-secondary p-0.5 text-xs">
                <Link
                  to="/"
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition ${
                    !inOwnerView ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                  aria-pressed={!inOwnerView}
                >
                  <User className="size-3" /> Customer
                </Link>
                <Link
                  to="/owner"
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition ${
                    inOwnerView ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                  aria-pressed={inOwnerView}
                >
                  <Store className="size-3" /> Restaurant
                </Link>
              </div>
            )}
            {isAdmin && (
              <Link to="/admin" className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
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
                <LogOut className="size-3.5" /> Sign out
              </Button>
            ) : (
              <Link to="/auth">
                <Button size="sm">Sign in</Button>
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
