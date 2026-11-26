"use client";

import React, { useEffect, useId, useRef, useState, useCallback } from "react";
import {
  ScanBarcode,
  X,
  Camera,
  ImagePlus,
  Loader2,
  AlertCircle,
  Search,
} from "lucide-react";
import { useNativeDialog } from "@/lib/ui/use-native-dialog";
import { normalizeBarcode } from "@/lib/catalog/parser";

interface DetectedBarcodeItem {
  rawValue?: string;
}

interface BrowserBarcodeDetector {
  detect(source: ImageBitmapSource): Promise<DetectedBarcodeItem[]>;
}

interface BrowserBarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BrowserBarcodeDetector;
  getSupportedFormats?: () => Promise<string[]>;
}

function getBarcodeDetectorCtor(): BrowserBarcodeDetectorConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    BarcodeDetector?: BrowserBarcodeDetectorConstructor;
  };
  return typeof w.BarcodeDetector === "function" ? w.BarcodeDetector : null;
}

const TARGET_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDetected: (barcode: string) => void;
  title?: string;
  subtitle?: string;
}

export function BarcodeScannerModal({
  isOpen,
  onClose,
  onDetected,
  title = "Scan Barcode / EAN",
  subtitle = "Secondary lookup via camera BarcodeDetector or manual EAN entry",
}: BarcodeScannerModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const detectorRef = useRef<BrowserBarcodeDetector | null>(null);

  const [manualCode, setManualCode] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [cameraSupported, setCameraSupported] = useState(false);
  const [detectorSupported, setDetectorSupported] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanningPhoto, setScanningPhoto] = useState(false);

  const stopCamera = useCallback(() => {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setCameraStarting(false);
  }, []);

  const handleClose = useCallback(() => {
    stopCamera();
    onClose();
  }, [stopCamera, onClose]);

  useNativeDialog(dialogRef, isOpen, handleClose);

  const handleCompleteDetection = useCallback(
    (code: string) => {
      stopCamera();
      if (dialogRef.current?.open) {
        dialogRef.current.close("detected");
      }
      onDetected(code);
    },
    [stopCamera, onDetected]
  );

  const ensureDetector = useCallback(async () => {
    if (detectorRef.current) return detectorRef.current;
    const Ctor = getBarcodeDetectorCtor();
    if (!Ctor) return null;
    let formats = TARGET_FORMATS;
    if (typeof Ctor.getSupportedFormats === "function") {
      try {
        const supported = await Ctor.getSupportedFormats();
        const filtered = TARGET_FORMATS.filter((f) => supported.includes(f));
        if (filtered.length > 0) formats = filtered;
      } catch {
        // Fallback to default target formats
      }
    }
    const instance = new Ctor({ formats });
    detectorRef.current = instance;
    return instance;
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    const detector = await ensureDetector();
    if (!detector || !navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "Live camera scanning is not supported in this browser. Enter the barcode digits below."
      );
      return;
    }

    setCameraStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;

      const videoEl = videoRef.current;
      if (!videoEl) {
        stopCamera();
        return;
      }

      videoEl.srcObject = stream;
      await videoEl.play();
      setCameraActive(true);
      setCameraStarting(false);

      let busy = false;
      scanTimerRef.current = window.setInterval(async () => {
        if (busy || !videoRef.current || videoRef.current.readyState < 2) return;
        busy = true;
        try {
          const found = await detector.detect(videoRef.current);
          for (const item of found) {
            const valid = normalizeBarcode(item.rawValue);
            if (valid) {
              handleCompleteDetection(valid);
              return;
            }
          }
        } catch {
          // Ignore transient frame decode errors
        } finally {
          busy = false;
        }
      }, 200);
    } catch (err) {
      stopCamera();
      setCameraError(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Camera permission denied. Use manual EAN entry below."
          : "Could not access camera. Use manual EAN entry below."
      );
    }
  }, [ensureDetector, handleCompleteDetection, stopCamera]);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    setManualCode("");
    setManualError(null);
    setCameraError(null);

    const hasDetector = Boolean(getBarcodeDetectorCtor());
    const hasCamera =
      typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
    setDetectorSupported(hasDetector);
    setCameraSupported(hasDetector && hasCamera);

    if (hasDetector && hasCamera) {
      void startCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const valid = normalizeBarcode(manualCode);
    if (!valid) {
      setManualError("Enter 8 to 14 numeric barcode digits (EAN-8 / EAN-13 / UPC).");
      return;
    }
    setManualError(null);
    handleCompleteDetection(valid);
  };

  const handleImageFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setManualError(null);
    setScanningPhoto(true);
    try {
      const detector = await ensureDetector();
      if (!detector) {
        setManualError("Image barcode detection is not supported in this browser.");
        return;
      }
      const bitmap = await createImageBitmap(file);
      try {
        const detections = await detector.detect(bitmap);
        for (const item of detections) {
          const valid = normalizeBarcode(item.rawValue);
          if (valid) {
            handleCompleteDetection(valid);
            return;
          }
        }
        setManualError("No EAN/UPC barcode detected in that photo. Try entering digits manually.");
      } finally {
        bitmap.close();
      }
    } catch {
      setManualError("Could not decode barcode from image.");
    } finally {
      setScanningPhoto(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="m-auto w-[calc(100%-1.5rem)] max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] p-0 shadow-2xl backdrop:bg-[var(--scrim)] backdrop:backdrop-blur-[2px]"
    >
      <div className="flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-[var(--primary-tint)] text-[var(--primary)] border border-[var(--primary)]/25 flex items-center justify-center shrink-0">
              <ScanBarcode className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2
                id={titleId}
                className="font-display font-semibold text-[16px] text-[var(--text-primary)] truncate"
              >
                {title}
              </h2>
              <p className="text-[13px] text-[var(--text-muted)] truncate">
                {subtitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => dialogRef.current?.close("cancel")}
            className="w-8 h-8 rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] inline-flex items-center justify-center transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            aria-label="Close barcode scanner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Live Camera Viewfinder */}
          {cameraSupported ? (
            <div className="space-y-2">
              <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[#141513] flex items-center justify-center">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${
                    cameraActive ? "block" : "hidden"
                  }`}
                />
                {cameraActive && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="w-56 h-24 rounded-lg border-2 border-[var(--primary)] shadow-[0_0_0_9999px_rgba(20,21,19,0.45)]" />
                  </div>
                )}
                {cameraStarting && !cameraActive && (
                  <div className="flex items-center gap-2 text-[13px] text-[#F2F1EC]">
                    <Loader2 className="w-4 h-4 animate-spin text-[var(--primary)]" />
                    <span>Starting camera...</span>
                  </div>
                )}
                {!cameraStarting && !cameraActive && (
                  <div className="p-4 text-center space-y-2 bg-[var(--bg-subtle)] w-full h-full flex flex-col items-center justify-center">
                    <Camera className="w-6 h-6 text-[var(--text-muted)] mx-auto" />
                    <p className="text-[13px] text-[var(--text-muted)]">
                      {cameraError || "Camera preview paused."}
                    </p>
                    <button
                      type="button"
                      onClick={() => void startCamera()}
                      className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-page)] text-[13px] text-[var(--text-primary)] font-medium whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5 text-[var(--primary)]" />
                      <span>Retry camera</span>
                    </button>
                  </div>
                )}
              </div>
              {cameraActive && (
                <p className="text-[13px] text-[var(--text-muted)] text-center">
                  Align the EAN barcode inside the green frame.
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3.5 text-[13px] text-[var(--text-muted)] flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
              <span>
                Live camera barcode scanning isn&apos;t supported in this
                browser. Enter the barcode digits below.
              </span>
            </div>
          )}

          {/* Manual EAN Fallback Form */}
          <form onSubmit={handleManualSubmit} className="space-y-2">
            <label
              htmlFor="manual-ean-input"
              className="block text-[13px] font-medium text-[var(--text-primary)]"
            >
              Barcode digits (EAN / UPC)
            </label>
            <div className="flex items-center gap-2">
              <input
                id="manual-ean-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9\s-]{8,20}"
                value={manualCode}
                onChange={(e) => {
                  setManualCode(e.target.value);
                  if (manualError) setManualError(null);
                }}
                placeholder="e.g. 8480000105302"
                autoFocus={!cameraSupported}
                className="flex-1 min-w-0 h-10 px-3.5 rounded-xl bg-[var(--bg-page)] border border-[var(--border)] focus:border-[var(--primary)] text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none tabular-nums"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[13px] font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                <Search className="w-4 h-4" />
                <span>Lookup</span>
              </button>
            </div>
            {manualError && (
              <p className="text-[13px] text-[var(--negative)]">
                {manualError}
              </p>
            )}
          </form>

          {/* Optional Scan from Photo */}
          {detectorSupported && (
            <div className="pt-2 flex items-center justify-between border-t border-[var(--border)]">
              <span className="text-[13px] text-[var(--text-muted)]">
                Or read from a product photo
              </span>
              <label className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-[var(--bg-subtle)] hover:border-[var(--border-strong)] border border-[var(--border)] text-[13px] text-[var(--text-primary)] font-medium cursor-pointer whitespace-nowrap shrink-0 transition-colors">
                {scanningPhoto ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--primary)]" />
                ) : (
                  <ImagePlus className="w-3.5 h-3.5 text-[var(--primary)]" />
                )}
                <span>Scan photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageFileScan}
                  className="hidden"
                />
              </label>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
