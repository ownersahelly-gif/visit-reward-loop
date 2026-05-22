// Gemini Live API client hook — raw WebSocket, voice in / voice out.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
const WS_URL = (key: string) =>
  `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${key}`;

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

  const wsRef = useRef<WebSocket | null>(null);
  const setupCompleteRef = useRef(false);
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

  const stopMic = useCallback(() => {
    try { procNodeRef.current?.disconnect(); } catch {}
    try { sourceNodeRef.current?.disconnect(); } catch {}
    try { micStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    try { inputCtxRef.current?.close(); } catch {}
    procNodeRef.current = null;
    sourceNodeRef.current = null;
    micStreamRef.current = null;
    inputCtxRef.current = null;
  }, []);

  const stop = useCallback(() => {
    stopMic();
    try { outputCtxRef.current?.close(); } catch {}
    try { wsRef.current?.close(); } catch {}
    outputCtxRef.current = null;
    wsRef.current = null;
    setupCompleteRef.current = false;
    playHeadRef.current = 0;
    mutedRef.current = false;
    setMutedState(false);
    pendingRef.current = { user: "", assistant: "" };
    setStatus("idle");
  }, [stopMic]);

  const startMicCapture = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, sampleRate: INPUT_SAMPLE_RATE, echoCancellation: true, noiseSuppression: true },
    });
    micStreamRef.current = stream;

    const Ctx: typeof AudioContext =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    const inCtx = new Ctx({ sampleRate: INPUT_SAMPLE_RATE });
    inputCtxRef.current = inCtx;
    const source = inCtx.createMediaStreamSource(stream);
    sourceNodeRef.current = source;
    const proc = inCtx.createScriptProcessor(4096, 1, 1);
    procNodeRef.current = proc;
    proc.onaudioprocess = (ev) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || !setupCompleteRef.current || mutedRef.current) return;
      const ch = ev.inputBuffer.getChannelData(0);
      const b64 = float32ToPCM16Base64(ch);
      try {
        ws.send(JSON.stringify({
          realtime_input: {
            media_chunks: [{ data: b64, mime_type: `audio/pcm;rate=${INPUT_SAMPLE_RATE}` }],
          },
        }));
      } catch (e) {
        console.warn("send mic chunk failed", e);
      }
    };
    source.connect(proc);
    proc.connect(inCtx.destination);
  }, []);

  const handleServerMessage = useCallback(async (raw: any) => {
    let msg: any;
    try {
      const text = typeof raw === "string" ? raw : await (raw as Blob).text();
      msg = JSON.parse(text);
    } catch (e) {
      console.warn("non-JSON msg", e);
      return;
    }

    if (msg.setupComplete) {
      setupCompleteRef.current = true;
      setStatus("live");
      try {
        await startMicCapture();
      } catch (e: any) {
        console.error("mic start failed", e);
        setError(e?.message ?? "Microphone access failed");
        setStatus("error");
      }
      return;
    }

    const sc = msg.serverContent;
    if (!sc) return;

    const parts = sc.modelTurn?.parts ?? [];
    for (const p of parts) {
      const b64 = p?.inlineData?.data;
      const mime = p?.inlineData?.mimeType ?? "";
      if (b64 && mime.startsWith("audio/") && outputCtxRef.current) {
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
    }

    const inT = sc.inputTranscription?.text;
    if (inT) pendingRef.current.user += inT;
    const outT = sc.outputTranscription?.text;
    if (outT) pendingRef.current.assistant += outT;
    if (sc.turnComplete) {
      flush("user");
      flush("assistant");
    }
    if (sc.interrupted) {
      playHeadRef.current = outputCtxRef.current?.currentTime ?? 0;
      flush("assistant");
    }
  }, [flush, startMicCapture]);

  const start = useCallback(async () => {
    setError(null);
    setStatus("connecting");
    setTranscript([]);
    setupCompleteRef.current = false;
    try {
      if (!GEMINI_API_KEY) throw new Error("VITE_GEMINI_API_KEY is not configured");

      const { data, error: fnErr } = await supabase.functions.invoke("gemini-live-token", {
        body: { restaurantId },
      });
      if (fnErr) throw fnErr;
      if ((data as any).error) throw new Error((data as any).error);
      const systemInstruction = (data as any).systemInstruction as string;

      const Ctx: typeof AudioContext =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      const outCtx = new Ctx({ sampleRate: OUTPUT_SAMPLE_RATE });
      outputCtxRef.current = outCtx;
      playHeadRef.current = outCtx.currentTime;

      const ws = new WebSocket(WS_URL(GEMINI_API_KEY));
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          setup: {
            model: "models/gemini-2.0-flash-live-001",
            generation_config: {
              response_modalities: ["AUDIO"],
            },
            system_instruction: {
              parts: [{ text: systemInstruction }],
            },
            input_audio_transcription: {},
            output_audio_transcription: {},
          },
        }));
      };
      ws.onmessage = (ev) => { void handleServerMessage(ev.data); };
      ws.onerror = (e) => {
        console.error("WS error", e);
        setError("Live connection error");
        setStatus("error");
      };
      ws.onclose = (ev) => {
        if (!setupCompleteRef.current) {
          setError(`Connection closed (${ev.code})`);
          setStatus("error");
        } else {
          setStatus("idle");
        }
        setupCompleteRef.current = false;
      };
    } catch (e: any) {
      console.error("Live start failed", e);
      setError(e?.message ?? "Failed to start live session");
      setStatus("error");
      stop();
    }
  }, [restaurantId, stop, handleServerMessage]);

  useEffect(() => () => stop(), [stop]);

  return { status, error, start, stop, transcript, muted, setMuted };
}
