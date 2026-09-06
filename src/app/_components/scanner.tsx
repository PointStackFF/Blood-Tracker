"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { getDecoder, type Decoder } from "@/lib/zxing";

function QuietButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-xl bg-white/10 px-5 py-3.5 text-[16px] font-semibold text-white ring-1 ring-white/25 transition active:scale-[.99] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-xl bg-zinc-900 px-5 py-4 text-[17px] font-semibold text-white transition active:scale-[.99] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export type ScanOutcome<T> = { ok: true; value: T } | { ok: false; message: string };

export interface ScannerProps<T> {
  title: string;
  hint?: string;
  validateScan: (raw: string) => ScanOutcome<T>;
  validateManual: (raw: string) => ScanOutcome<T>;
  onAccepted: (value: T) => void;
  onCancel: () => void;
}

const READ_OPTS = { maxNumberOfSymbols: 4, minLineCount: 2 };

/**
 * Full-screen scanner overlay — ports the settings proven out in
 * index.html (see CLAUDE.md's "hard-won scanner details"): centre-band
 * live decoding at native resolution, 1920x1080 + continuous autofocus,
 * the plain wide rear lens preferred silently (no picker shown — the app
 * infers the action), and a full-resolution photo fallback for curved
 * labels. Manual entry is always available, never gated behind camera
 * success — the app must never be able to block a launch.
 */
export function Scanner<T>({ title, hint, validateScan, validateManual, onAccepted, onCancel }: ScannerProps<T>) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const scanningRef = useRef(false);
  const acceptedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [status, setStatus] = useState<"loading" | "starting" | "scanning" | "error">("loading");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [manual, setManual] = useState("");
  const [manualError, setManualError] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);

  useEffect(() => {
    canvasRef.current = document.createElement("canvas");
    let stream: MediaStream | null = null;

    function handleRaw(raw: string) {
      if (acceptedRef.current) return;
      const result = validateScan(raw);
      if (result.ok) {
        acceptedRef.current = true;
        scanningRef.current = false;
        onAccepted(result.value);
      } else {
        setMessage(result.message);
      }
    }

    async function loop(readBarcodes: Decoder["readBarcodes"]) {
      if (!scanningRef.current || acceptedRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2 && video.videoWidth) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        const bandH = Math.round(h * 0.42);
        const y = Math.round((h - bandH) / 2);
        canvas.width = w;
        canvas.height = bandH;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, y, w, bandH, 0, 0, w, bandH);
          try {
            const results = await readBarcodes(ctx.getImageData(0, 0, w, bandH), READ_OPTS);
            for (const r of results) {
              if (r.text) handleRaw(r.text);
              if (acceptedRef.current) break;
            }
          } catch (e) {
            scanningRef.current = false;
            setStatus("error");
            setError(e instanceof Error ? e.message : "Live decode failed.");
            return;
          }
        }
      }
      if (scanningRef.current && !acceptedRef.current) requestAnimationFrame(() => loop(readBarcodes));
    }

    async function start() {
      try {
        setStatus("loading");
        const { readBarcodes } = await getDecoder();
        setStatus("starting");

        const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
          (d) => d.kind === "videoinput"
        );
        const back =
          devices.find((d) => /back|rear/i.test(d.label) && !/tele|ultra/i.test(d.label)) ||
          devices.find((d) => /back|rear|environment/i.test(d.label));

        const base = {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          advanced: [{ focusMode: "continuous" }],
        };
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: (back
            ? { deviceId: { exact: back.deviceId }, ...base }
            : { facingMode: { ideal: "environment" }, ...base }) as MediaTrackConstraints,
        });

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const track = stream.getVideoTracks()[0];
        trackRef.current = track;
        const caps = track.getCapabilities ? track.getCapabilities() : ({} as MediaTrackCapabilities);
        setTorchAvailable(!!(caps as { torch?: boolean }).torch);

        setStatus("scanning");
        scanningRef.current = true;
        loop(readBarcodes);
      } catch (e) {
        setStatus("error");
        setError(e instanceof Error ? e.message : "Camera didn't start.");
      }
    }

    start();
    return () => {
      scanningRef.current = false;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
    // Runs once per mount — Scanner is always freshly mounted when opened, never reused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTorch = async () => {
    const track = trackRef.current;
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] });
      setTorchOn(!torchOn);
    } catch {
      // Torch toggle failing isn't worth surfacing — it's a convenience, not a blocker.
    }
  };

  const handlePhoto = async (file: File) => {
    setPhotoBusy(true);
    setMessage("");
    try {
      const { readBarcodes } = await getDecoder();
      let found = false;
      for (const r of await readBarcodes(file, READ_OPTS)) {
        if (r.text) {
          found = true;
          const result = validateScan(r.text);
          if (result.ok) {
            acceptedRef.current = true;
            scanningRef.current = false;
            onAccepted(result.value);
            return;
          }
          setMessage(result.message);
        }
      }
      if (!found) {
        const bmp = await createImageBitmap(file);
        for (const crop of [0.8, 0.6, 0.4]) {
          const cw = Math.round(bmp.width * crop);
          const ch = Math.round(bmp.height * crop);
          const cv = document.createElement("canvas");
          cv.width = cw;
          cv.height = ch;
          const ctx = cv.getContext("2d", { willReadFrequently: true });
          if (!ctx) continue;
          ctx.drawImage(bmp, (bmp.width - cw) / 2, (bmp.height - ch) / 2, cw, ch, 0, 0, cw, ch);
          for (const r of await readBarcodes(ctx.getImageData(0, 0, cw, ch), READ_OPTS)) {
            if (r.text) {
              found = true;
              const result = validateScan(r.text);
              if (result.ok) {
                acceptedRef.current = true;
                scanningRef.current = false;
                onAccepted(result.value);
                return;
              }
              setMessage(result.message);
            }
          }
          if (found) break;
        }
        if (!found) {
          setMessage("No barcode found in that photo. Flatten the label, fill the frame, and angle slightly to kill the glare.");
        }
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Photo decode failed.");
    } finally {
      setPhotoBusy(false);
    }
  };

  const submitManual = () => {
    if (!manual.trim()) return;
    const result = validateManual(manual);
    if (result.ok) {
      onAccepted(result.value);
    } else {
      setManualError(result.message);
    }
  };

  return (
    <div className="fixed inset-0 z-20 flex flex-col bg-zinc-950 text-white">
      <div className="flex items-center justify-between px-4 pt-4">
        <div>
          <div className="text-[17px] font-semibold">{title}</div>
          {hint && <div className="text-[13px] text-zinc-400">{hint}</div>}
        </div>
        <button onClick={onCancel} className="text-[15px] text-zinc-300 hover:text-white">
          Cancel
        </button>
      </div>

      <div className="relative mx-4 mt-4 aspect-[4/3] overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-x-[5%] inset-y-[32%] rounded-lg border-2 border-white/90 shadow-[0_0_0_100vmax_rgba(0,0,0,0.35)]" />
        {status !== "scanning" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 px-6 text-center text-[15px]">
            {status === "loading" && "Loading the decoder…"}
            {status === "starting" && "Starting camera…"}
            {status === "error" && (error || "Camera unavailable — use manual entry below.")}
          </div>
        )}
      </div>

      <div className="px-4 pt-3 text-center text-[14px] text-amber-300">{message || " "}</div>

      {torchAvailable && status === "scanning" && (
        <div className="px-4">
          <QuietButton onClick={toggleTorch}>{torchOn ? "Torch off" : "Torch on"}</QuietButton>
        </div>
      )}

      <div className="px-4 pt-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) handlePhoto(file);
          }}
        />
        <QuietButton onClick={() => fileInputRef.current?.click()} disabled={photoBusy}>
          {photoBusy ? "Reading photo…" : "Take a photo instead"}
        </QuietButton>
      </div>

      <div className="mt-auto rounded-t-3xl bg-white p-5 text-zinc-900">
        <div className="text-[15px] font-medium text-zinc-900">Type it in instead</div>
        <p className="mt-1 text-[14px] leading-relaxed text-zinc-600">
          Camera trouble happens. This works every time.
        </p>
        <input
          value={manual}
          onChange={(e) => {
            setManual(e.target.value);
            setManualError("");
          }}
          placeholder="W1833 26 337371 8"
          className="mt-3 w-full rounded-xl border border-zinc-300 px-4 py-3 font-mono text-[16px] focus:border-zinc-900 focus:outline-none"
        />
        {manualError && <div className="mt-1.5 text-[14px] text-rose-700">{manualError}</div>}
        <div className="mt-3">
          <PrimaryButton onClick={submitManual} disabled={!manual.trim()}>
            Use this number
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
