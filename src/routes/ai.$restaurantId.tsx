import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Mic, ArrowLeft, Loader2, PhoneOff } from "lucide-react";
import { toast } from "sonner";
import { useGeminiLive } from "@/lib/use-gemini-live";

export const Route = createFileRoute("/ai/$restaurantId")({ component: AIPage });

function AIPage() {
  const { restaurantId } = Route.useParams();
  const [restaurant, setRestaurant] = useState<{ name: string } | null>(null);
  const live = useGeminiLive(restaurantId);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from("restaurants").select("name").eq("id", restaurantId).maybeSingle().then(({ data }) => {
      setRestaurant(data as any);
    });
  }, [restaurantId]);

  useEffect(() => {
    if (live.error) toast.error(live.error);
  }, [live.error]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [live.transcript]);

  const isLive = live.status === "live";
  const connecting = live.status === "connecting";

  // Press-and-hold: open session on first press; thereafter hold = unmute, release = mute.
  const handlePressStart = async () => {
    if (connecting) return;
    if (live.status === "idle" || live.status === "error") {
      live.setMuted(false);
      await live.start();
      return;
    }
    if (isLive) live.setMuted(false);
  };
  const handlePressEnd = () => {
    if (isLive) live.setMuted(true);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-background to-secondary/30">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Link to="/restaurants/$id" params={{ id: restaurantId }} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Restaurant
          </Link>
          <div className="text-center">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Live Voice</p>
            <h1 className="font-serif text-lg leading-tight">{restaurant?.name ?? "…"}</h1>
          </div>
          <div className="w-16" />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center px-4 py-8">
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <button
            type="button"
            disabled={connecting}
            onPointerDown={handlePressStart}
            onPointerUp={handlePressEnd}
            onPointerLeave={handlePressEnd}
            onPointerCancel={handlePressEnd}
            aria-label={isLive ? "Hold to talk" : "Tap to start"}
            className={[
              "relative flex size-48 items-center justify-center rounded-full transition-all duration-300 select-none",
              "shadow-2xl active:scale-95 disabled:opacity-60",
              isLive && !live.muted
                ? "bg-primary text-primary-foreground ring-8 ring-primary/30"
                : isLive
                ? "bg-primary/80 text-primary-foreground ring-4 ring-primary/20"
                : "bg-primary text-primary-foreground hover:scale-105",
            ].join(" ")}
          >
            {connecting ? (
              <Loader2 className="size-20 animate-spin" />
            ) : (
              <Mic className="size-20" />
            )}
            {isLive && !live.muted && (
              <span className="pointer-events-none absolute inset-0 rounded-full ring-4 ring-primary/40 animate-ping" />
            )}
          </button>

          <p className="text-center text-sm text-muted-foreground">
            {connecting
              ? "Connecting…"
              : !isLive
              ? "Tap and hold to talk"
              : live.muted
              ? "Hold to speak"
              : "Listening… speak now"}
          </p>

          {isLive && (
            <Button variant="outline" size="sm" onClick={() => live.stop()}>
              <PhoneOff className="size-4" /> End conversation
            </Button>
          )}
        </div>

        <div
          ref={scrollRef}
          className="mt-8 w-full max-w-xl space-y-2 overflow-y-auto rounded-2xl border border-border bg-card/50 p-4 text-sm"
          style={{ maxHeight: "35vh", minHeight: "140px" }}
        >
          {live.transcript.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground">
              Your conversation will appear here.
            </p>
          ) : (
            live.transcript.map((t, i) => (
              <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 leading-relaxed ${
                    t.role === "user"
                      ? "bg-primary/10 text-foreground"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                  dir="auto"
                >
                  {t.text}
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
