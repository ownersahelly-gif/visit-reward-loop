import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Mic, MicOff, Send, Volume2, VolumeX, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/ai/$restaurantId")({ component: AIPage });

type Msg = { role: "user" | "assistant"; content: string; photos?: { name: string; photo_url: string }[] };

// Browser Speech API types
type SR = any;
const SpeechRecognitionImpl: SR | undefined =
  typeof window !== "undefined"
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : undefined;

function AIPage() {
  const { restaurantId } = Route.useParams();
  const [restaurant, setRestaurant] = useState<{ name: string; cuisine: string | null; image_url: string | null } | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakOn, setSpeakOn] = useState(true);
  const [voiceReady, setVoiceReady] = useState(false);
  const recognitionRef = useRef<any>(null);
  const greetedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from("restaurants").select("name, cuisine, image_url").eq("id", restaurantId).maybeSingle().then(({ data }) => {
      setRestaurant(data as any);
    });
  }, [restaurantId]);

  // Greet once restaurant loads (requires user interaction to actually speak on iOS)
  useEffect(() => {
    if (!restaurant || greetedRef.current) return;
    greetedRef.current = true;
    const greeting = `Welcome to ${restaurant.name}! How can I help you today?`;
    setMessages([{ role: "assistant", content: greeting }]);
  }, [restaurant]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const speak = (text: string) => {
    if (!speakOn || typeof window === "undefined" || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.0;
      u.pitch = 1.0;
      // Prefer a friendly English voice
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find((v) => /Google|Samantha|Karen|Daniel|Alex/i.test(v.name)) || voices.find((v) => v.lang.startsWith("en"));
      if (preferred) u.voice = preferred;
      window.speechSynthesis.speak(u);
    } catch (e) {
      console.warn("TTS failed", e);
    }
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const next = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-chat", {
        body: {
          restaurantId,
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        },
      });
      if (error) throw error;
      if ((data as any).error) throw new Error((data as any).error);
      const reply = (data as any).reply as string;
      const photos = (data as any).photos as { name: string; photo_url: string }[] | undefined;
      setMessages([...next, { role: "assistant", content: reply, photos }]);
      speak(reply);
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't reach the assistant");
    } finally {
      setBusy(false);
    }
  };

  const toggleMic = () => {
    if (!SpeechRecognitionImpl) {
      toast.error("Voice input not supported", {
        description: "Try Chrome on Android, or just type your question.",
      });
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new SpeechRecognitionImpl();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setInput(transcript);
      sendMessage(transcript);
    };
    rec.onerror = (e: any) => {
      console.warn("speech recognition error", e);
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  };

  // First user tap "warms up" voice synthesis on iOS
  const enableVoiceAndGreet = () => {
    setVoiceReady(true);
    if (messages[0]) speak(messages[0].content);
  };

  useEffect(() => () => {
    try { window.speechSynthesis?.cancel(); } catch {}
    try { recognitionRef.current?.stop(); } catch {}
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-background to-secondary/30">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Link to="/restaurants/$id" params={{ id: restaurantId }} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Restaurant
          </Link>
          <div className="text-center">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">AI Assistant</p>
            <h1 className="font-serif text-lg leading-tight">{restaurant?.name ?? "…"}</h1>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (speakOn) window.speechSynthesis?.cancel();
              setSpeakOn(!speakOn);
            }}
            aria-label={speakOn ? "Mute voice" : "Unmute voice"}
          >
            {speakOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </Button>
        </div>
      </header>

      {/* Conversation */}
      <div ref={scrollRef} className="mx-auto w-full max-w-2xl flex-1 space-y-4 overflow-y-auto px-4 py-6">
        {!voiceReady && messages.length > 0 && (
          <Card className="border-primary/40 bg-primary/5 p-4 text-center">
            <p className="text-sm text-foreground">Tap below to start the conversation with voice.</p>
            <Button className="mt-3" onClick={enableVoiceAndGreet}>
              <Volume2 className="size-4" /> Start
            </Button>
          </Card>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] space-y-2 rounded-2xl px-4 py-3 ${
              m.role === "user"
                ? "bg-primary text-primary-foreground"
                : "bg-card text-card-foreground shadow-sm"
            }`}>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</p>
              {m.photos && m.photos.length > 0 && (
                <div className="grid grid-cols-2 gap-2 pt-2">
                  {m.photos.map((p) => (
                    <figure key={p.photo_url} className="overflow-hidden rounded-lg bg-secondary">
                      <img src={p.photo_url} alt={p.name} className="aspect-square w-full object-cover" loading="lazy" />
                      <figcaption className="px-2 py-1 text-[10px] font-medium text-muted-foreground">{p.name}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-card px-4 py-3 shadow-sm">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="sticky bottom-0 border-t border-border bg-background/95 backdrop-blur">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3"
        >
          <Button
            type="button"
            size="icon"
            variant={listening ? "default" : "outline"}
            onClick={toggleMic}
            disabled={busy}
            aria-label={listening ? "Stop listening" : "Speak"}
            className={listening ? "animate-pulse" : ""}
          >
            {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </Button>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={listening ? "Listening…" : "Ask about the menu…"}
            disabled={busy || listening}
          />
          <Button type="submit" size="icon" disabled={busy || !input.trim()}>
            <Send className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
