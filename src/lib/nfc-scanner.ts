// Cross-platform NFC scanner.
// - Native iOS / Android via @capgo/capacitor-nfc
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

// Bytes (number[]) -> hex string
function bytesToHex(bytes: number[] | undefined | null): string {
  if (!bytes || bytes.length === 0) return "";
  return bytes.map((b) => (b & 0xff).toString(16).padStart(2, "0")).join("");
}

// Decode an NDEF text record payload: [status, lang..., text...]
// For URI records: [prefix, uri...]. Best effort UTF-8 for everything else.
function decodeNdefPayload(tnf: number, type: number[], payload: number[]): string | undefined {
  if (!payload || payload.length === 0) return undefined;
  const typeStr = String.fromCharCode(...(type ?? []));
  try {
    // NDEF Well-Known Text (TNF=1, type="T")
    if (tnf === 1 && typeStr === "T") {
      const status = payload[0] ?? 0;
      const langLen = status & 0x3f;
      const textBytes = payload.slice(1 + langLen);
      return new TextDecoder("utf-8").decode(new Uint8Array(textBytes));
    }
    // NDEF Well-Known URI (TNF=1, type="U")
    if (tnf === 1 && typeStr === "U") {
      const prefixes = [
        "", "http://www.", "https://www.", "http://", "https://",
        "tel:", "mailto:", "ftp://anonymous:anonymous@", "ftp://ftp.",
        "ftps://", "sftp://", "smb://", "nfs://", "ftp://", "dav://",
        "news:", "telnet://", "imap:", "rtsp://", "urn:", "pop:",
        "sip:", "sips:", "tftp:", "btspp://", "btl2cap://", "btgoep://",
        "tcpobex://", "irdaobex://", "file://", "urn:epc:id:",
        "urn:epc:tag:", "urn:epc:pat:", "urn:epc:raw:", "urn:epc:", "urn:nfc:",
      ];
      const prefix = prefixes[payload[0]] ?? "";
      const rest = new TextDecoder("utf-8").decode(new Uint8Array(payload.slice(1)));
      return prefix + rest;
    }
    // Fallback: try utf-8 decode of the raw payload
    return new TextDecoder("utf-8").decode(new Uint8Array(payload));
  } catch {
    return undefined;
  }
}

export function isNfcAvailable(): boolean {
  if (typeof window === "undefined") return false;
  if (Capacitor.isNativePlatform()) return true;
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
    const { CapacitorNfc } = await import("@capgo/capacitor-nfc");

    const handleEvent = (event: any) => {
      try {
        const tag = event?.tag ?? {};
        let text: string | undefined;
        const records: any[] = tag.ndefMessage ?? [];
        for (const r of records) {
          const decoded = decodeNdefPayload(r?.tnf ?? 0, r?.type ?? [], r?.payload ?? []);
          if (decoded) {
            text = decoded;
            break;
          }
        }
        const uidHex = bytesToHex(tag.id);
        const token = extractToken(text, uidHex);
        if (!token) {
          onError?.("Card is empty or unreadable");
          return;
        }
        void onToken(token);
      } catch (e: any) {
        onError?.(e?.message ?? "Couldn't read card");
      }
    };

    const ndefHandle = await CapacitorNfc.addListener("ndefDiscovered", handleEvent);
    const tagHandle = await CapacitorNfc.addListener("tagDiscovered", handleEvent);

    try {
      await CapacitorNfc.startScanning({
        alertMessage: "Hold the NFC card near the top of your phone",
        invalidateAfterFirstRead: true,
      });
    } catch (e: any) {
      try { await ndefHandle.remove(); } catch {}
      try { await tagHandle.remove(); } catch {}
      throw new Error(e?.message ?? "Couldn't start NFC reader");
    }

    return () => {
      void (async () => {
        try { await ndefHandle.remove(); } catch {}
        try { await tagHandle.remove(); } catch {}
        try { await CapacitorNfc.stopScanning(); } catch {}
      })();
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
