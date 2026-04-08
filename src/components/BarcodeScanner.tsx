import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, X, Search } from "lucide-react";

interface BarcodeScannerProps {
  open: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

export default function BarcodeScanner({ open, onClose, onScan }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [supported, setSupported] = useState(true);
  const scanIntervalRef = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }, []);

  const startCamera = useCallback(async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);

      // Check BarcodeDetector support
      if (!("BarcodeDetector" in window)) {
        setSupported(false);
        setError("Barcode scanning not supported in this browser. Use manual SKU entry below.");
        stopCamera();
        return;
      }

      const detector = new (window as any).BarcodeDetector({
        formats: ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "qr_code"],
      });

      scanIntervalRef.current = window.setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState !== 4) return;
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0) {
            const code = barcodes[0].rawValue;
            stopCamera();
            onScan(code);
            onClose();
          }
        } catch {
          // ignore detection errors
        }
      }, 300);
    } catch (err: any) {
      setError("Camera access denied. Please allow camera permissions or enter SKU manually.");
    }
  }, [onScan, onClose, stopCamera]);

  useEffect(() => {
    if (open) {
      startCamera();
    }
    return () => stopCamera();
  }, [open, startCamera, stopCamera]);

  const handleManualSubmit = () => {
    if (manualCode.trim()) {
      stopCamera();
      onScan(manualCode.trim());
      onClose();
      setManualCode("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { stopCamera(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" /> Scan Barcode / Enter SKU
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Camera View */}
          {supported && (
            <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
              {scanning && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-48 h-32 border-2 border-primary rounded-lg animate-pulse" />
                </div>
              )}
              {!scanning && !error && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Button onClick={startCamera} variant="outline" className="gap-2">
                    <Camera className="h-4 w-4" /> Start Camera
                  </Button>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          {/* Manual Entry */}
          <div className="flex gap-2">
            <Input
              placeholder="Enter SKU or barcode number..."
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
            />
            <Button onClick={handleManualSubmit} disabled={!manualCode.trim()} size="icon">
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
