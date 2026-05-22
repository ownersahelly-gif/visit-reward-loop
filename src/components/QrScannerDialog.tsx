import { useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QrCode, X } from "lucide-react";
import { toast } from "sonner";

export function QrScannerDialog({
  open,
  onOpenChange,
  onResult,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  onResult: (text: string) => void;
}) {
  const containerId = "qr-scanner-region";
  const scannerRef = useRef<any>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (cancelled) return;
      const el = document.getElementById(containerId);
      if (!el) return;
      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decoded) => onResult(decoded),
          () => {},
        );
      } catch (e: any) {
        toast.error(e?.message ?? "Camera unavailable");
        onOpenChange(false);
      }
    })();
    return () => {
      cancelled = true;
      const s = scannerRef.current;
      if (s) {
        s.stop().catch(() => {}).finally(() => s.clear().catch(() => {}));
        scannerRef.current = null;
      }
    };
  }, [open, onResult, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="size-4" /> Scan customer QR
          </DialogTitle>
        </DialogHeader>
        <div id={containerId} className="overflow-hidden rounded-xl bg-black [&_video]:w-full" />
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          <X className="size-4" /> Cancel
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function parseScannedCode(raw: string): { code: string; restaurantId?: string } | null {
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj.c === "string" && /^\d{6}$/.test(obj.c)) {
      return { code: obj.c, restaurantId: typeof obj.r === "string" ? obj.r : undefined };
    }
  } catch {
    if (/^\d{6}$/.test(raw.trim())) return { code: raw.trim() };
  }
  return null;
}
