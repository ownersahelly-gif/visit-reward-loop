// Cross-platform NFC scanner.
// - Native iOS / Android via Capacitor (@exxili/capacitor-nfc)
// - Chrome on Android (web) via Web NFC (NDEFReader)
//
// Returns a stop() function the caller uses to cancel.

import { Capacitor } from "@capacitor/core";

type StartOptions = {
  onToken: (token: string) => void | Promise<void>;
  onError?: (message: string) => void;
};

type Stop = () => void;

// Pull a hex token out of any text payload, fall back to raw text/UID.
function extractToken(text: string | undefined | null, fallbackUid?: string): string {
  if (text) {
    const m = text.match(/([a-f0-9]{16,})/i);
    if (m) return m[1];
    const cleaned = text.trim();
    if (cleaned) return cleaned;
  }
  if (fallbackUid) return fallbackUid.replace(/[^a-f0-9]/gi, "");
  return "";
}

export function isNfcAvailable(): boolean {
  if (typeof window === "undefined") return false;
  // Capacitor native (iOS / Android)
  if (Capacitor.isNativePlatform()) return true;
  // Web NFC (Chrome on Android only)
  return "NDEFReader" in window;
}

export function nfcUnsupportedMessage(): string {
  if (typeof window !== "undefined" && Capacitor.getPlatform() === "web") {
    return "On the web, use Chrome on an Android phone — or install our iOS / Android app.";
  }
  return "NFC isn't available on this device.";
}

export async function startNfcScan({ onToken, onError }: StartOptions): Promise<Stop> {
  if (Capacitor.isNativePlatform()) {
    // Lazy import so the web bundle never tries to load the native plugin
    const { NFC } = await import("@exxili/capacitor-nfc");

    const offRead = NFC.onRead((data: any) => {
      try {
        const textView = data.string?.();
        let text: string | undefined;
        const records = textView?.messages?.[0]?.records ?? [];
        for (const r of records) {
          if (typeof r?.payload === "string" && r.payload.length > 0) {
            text = r.payload;
            break;
          }
        }
        const token = extractToken(text);
        if (!token) {
          onError?.("Card is empty or unreadable");
          return;
        }
        void onToken(token);
      } catch (e: any) {
        onError?.(e?.message ?? "Couldn't read card");
      }
    });

    const offErr = NFC.onError((err: any) => {
      const msg = typeof err === "string" ? err : err?.message ?? "NFC error";
      // User-cancelled session on iOS shouldn't surface as a hard error
      if (/cancel|invalidate/i.test(msg)) return;
      onError?.(msg);
    });

    // iOS requires explicitly starting a session; on Android it's a no-op.
    try {
      await NFC.startScan();
    } catch (e: any) {
      offRead();
      offErr();
      throw new Error(e?.message ?? "Couldn't start NFC reader");
    }

    return () => {
      try { offRead(); } catch {}
      try { offErr(); } catch {}
      // Best-effort cancel — not all versions expose a stop method
      try { (NFC as any).cancelScan?.(); } catch {}
    };
  }

  // Web NFC fallback (Chrome on Android)
  if (typeof window === "undefined" || !("NDEFReader" in window)) {
    throw new Error(nfcUnsupportedMessage());
  }
  // @ts-ignore - NDEFReader is not in lib.dom
  const reader = new window.NDEFReader();
  const ctrl = new AbortController();
  await reader.scan({ signal: ctrl.signal });
  reader.onreadingerror = () => onError?.("Couldn't read the card. Try again.");
  reader.onreading = (event: any) => {
    try {
      let text: string | undefined;
      for (const record of event.message?.records ?? []) {
        if (
          record.recordType === "text" ||
          record.recordType === "url" ||
          record.recordType === "mime"
        ) {
          const decoder = new TextDecoder(record.encoding ?? "utf-8");
          text = decoder.decode(record.data);
          break;
        }
      }
      const token = extractToken(text, event.serialNumber);
      if (!token) {
        onError?.("Card is empty or unreadable");
        return;
      }
      void onToken(token);
    } catch (e: any) {
      onError?.(e?.message ?? "Couldn't read card");
    }
  };
  return () => ctrl.abort();
}
