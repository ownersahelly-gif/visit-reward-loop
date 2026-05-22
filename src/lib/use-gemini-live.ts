// Gemini Live API client hook — real-time voice in / voice out via WebSocket.
import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleGenAI, Modality, type Session } from "@google/genai";
import { supabase } from "@/integrations/supabase/client";

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

function float32ToPCM16Base64(float32: Float32Array): string {
  const pcm16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(pcm16.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64PCM16ToFloat32(b64: string): Float32Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(new ArrayBuffer(len));
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  const dv = new DataView(bytes.buffer);
  const out = new Float32Array(new ArrayBuffer((len / 2) * 4));
  for (let i = 0; i < out.length; i++) {
    out[i] = dv.getInt16(i * 2, true) / 0x8000;
  }
  return out;
}

export type LiveStatus = "idle" | "connecting" | "live" | "error";
export type TranscriptEntry = { role: "user" | "assistant"; text: string };

export function useGeminiLive(restaurantId: string) {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [muted, setMutedState] = useState(false);

  const sessionRef = useRef<Session | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const procNodeRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const playHeadRef = useRef<number>(0);
  const mutedRef = useRef(false);
  const pendingRef = useRef<{ user: string; assistant: string }>({ user: "", assistant: "" });

  const setMuted = useCallback((v: boolean) => {
    mutedRef.current = v;
    setMutedState(v);
  }, []);

  const flush = useCallback((role: "user" | "assistant") => {
    const text = pendingRef.current[role].trim();
    if (!text) return;
    setTranscript((t) => [...t, { role, text }]);
    pendingRef.current[role] = "";
  }, []);

  const stop = useCallback(() => {
    try { procNodeRef.current?.disconnect(); } catch {}
    try { sourceNodeRef.current?.disconnect(); } catch {}
    try { micStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    try { inputCtxRef.current?.close(); } catch {}
    try { outputCtxRef.current?.close(); } catch {}
    try { sessionRef.current?.close(); } catch {}
    procNodeRef.current = null;
    sourceNodeRef.current = null;
    micStreamRef.current = null;
    inputCtxRef.current = null;
    outputCtxRef.current = null;
    sessionRef.current = null;
    playHeadRef.current = 0;
    mutedRef.current = false;
    setMutedState(false);
    pendingRef.current = { user: "", assistant: "" };
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setStatus("connecting");
    setTranscript([]);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("gemini-live-token", {
        body: { restaurantId },
      });
      if (fnErr) throw fnErr;
      if ((data as any).error) throw new Error((data as any).error);
      const token = (data as any).token as string;

      const OutCtx: typeof AudioContext =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      const outCtx = new OutCtx({ sampleRate: OUTPUT_SAMPLE_RATE });
      outputCtxRef.current = outCtx;
      playHeadRef.current = outCtx.currentTime;

      const ai = new GoogleGenAI({
        apiKey: token,
        httpOptions: { apiVersion: "v1alpha" },
      });
      const session = await ai.live.connect({
        model: "gemini-2.0-flash-live-001",
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        } as any,
        callbacks: {
          onopen: () => setStatus("live"),
          onmessage: (msg: any) => {
            const sc = msg?.serverContent;
            const audioPart = sc?.modelTurn?.parts?.find(
              (p: any) => p?.inlineData?.mimeType?.startsWith("audio/")
            );
            const b64 = audioPart?.inlineData?.data;
            if (b64 && outputCtxRef.current) {
              const ctx = outputCtxRef.current;
              const f32 = base64PCM16ToFloat32(b64);
              const buf = ctx.createBuffer(1, f32.length, OUTPUT_SAMPLE_RATE);
              buf.getChannelData(0).set(f32);
              const src = ctx.createBufferSource();
              src.buffer = buf;
              src.connect(ctx.destination);
              const startAt = Math.max(ctx.currentTime, playHeadRef.current);
              src.start(startAt);
              playHeadRef.current = startAt + buf.duration;
            }
            const inT = sc?.inputTranscription?.text;
            if (inT) pendingRef.current.user += inT;
            const outT = sc?.outputTranscription?.text;
            if (outT) pendingRef.current.assistant += outT;
            if (sc?.turnComplete) {
              flush("user");
              flush("assistant");
            }
            if (sc?.interrupted) {
              playHeadRef.current = outputCtxRef.current?.currentTime ?? 0;
              flush("assistant");
            }
          },
          onerror: (e: any) => {
            console.error("Live error", e);
            setError(e?.message ?? "Live session error");
            setStatus("error");
          },
          onclose: () => setStatus("idle"),
        },
      });
      sessionRef.current = session;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: INPUT_SAMPLE_RATE, echoCancellation: true, noiseSuppression: true },
      });
      micStreamRef.current = stream;

      const inCtx = new OutCtx({ sampleRate: INPUT_SAMPLE_RATE });
      inputCtxRef.current = inCtx;
      const source = inCtx.createMediaStreamSource(stream);
      sourceNodeRef.current = source;
      const proc = inCtx.createScriptProcessor(4096, 1, 1);
      procNodeRef.current = proc;
      proc.onaudioprocess = (ev) => {
        if (!sessionRef.current || mutedRef.current) return;
        const ch = ev.inputBuffer.getChannelData(0);
        const b64 = float32ToPCM16Base64(ch);
        try {
          sessionRef.current.sendRealtimeInput({
            audio: { data: b64, mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}` },
          });
        } catch (e) {
          console.warn("send mic chunk failed", e);
        }
      };
      source.connect(proc);
      proc.connect(inCtx.destination);
    } catch (e: any) {
      console.error("Live start failed", e);
      setError(e?.message ?? "Failed to start live session");
      setStatus("error");
      stop();
    }
  }, [restaurantId, stop, flush]);

  useEffect(() => () => stop(), [stop]);

  return { status, error, start, stop, transcript, muted, setMuted };
}
