import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, Keyboard, X } from "lucide-react";
import { barcodeFormats, createZxingReader, getCameraErrorMessage, getCameraReadinessIssue, hasNativeBarcodeDetector } from "../lib/scanner";

type BarcodeScannerProps = {
  onDetected: (code: string) => void;
  onClose: () => void;
};

const scannerConstraints: MediaStreamConstraints = {
  video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
  audio: false
};

export function BarcodeScanner({ onDetected, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onDetectedRef = useRef(onDetected);
  const [error, setError] = useState("");

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let controls: { stop: () => void } | undefined;
    let raf = 0;

    const stopStream = () => {
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    };

    const isInterruptedPlayError = (playError: unknown) => {
      const message = playError instanceof Error ? playError.message.toLowerCase() : "";
      return (
        playError instanceof DOMException &&
        playError.name === "AbortError" &&
        (message.includes("interrupted") || message.includes("removed from the document"))
      );
    };

    const playVideo = async (video: HTMLVideoElement) => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          await video.play();
          return true;
        } catch (playError) {
          if (!isInterruptedPlayError(playError)) throw playError;
          await new Promise((resolve) => requestAnimationFrame(resolve));
          if (stopped || !video.isConnected || !video.srcObject) return false;
        }
      }
      return !stopped;
    };

    const start = async () => {
      try {
        const readinessIssue = getCameraReadinessIssue();
        if (readinessIssue) {
          setError(readinessIssue);
          return;
        }

        if (!videoRef.current) return;

        if (hasNativeBarcodeDetector() && window.BarcodeDetector) {
          stream = await navigator.mediaDevices.getUserMedia(scannerConstraints);
          if (stopped || !videoRef.current) {
            stopStream();
            return;
          }

          videoRef.current.srcObject = stream;
          const canPlay = await playVideo(videoRef.current);
          if (!canPlay || stopped || !videoRef.current) return;

          const detector = new window.BarcodeDetector({ formats: barcodeFormats });
          const tick = async () => {
            if (stopped || !videoRef.current) return;
            const results = await detector.detect(videoRef.current);
            if (results[0]?.rawValue) {
              onDetectedRef.current(results[0].rawValue);
              return;
            }
            raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
          return;
        }

        const reader = createZxingReader();
        controls = await reader.decodeFromConstraints(scannerConstraints, videoRef.current, (result) => {
          if (stopped) return;
          const text = result?.getText();
          if (text) onDetectedRef.current(text);
        });

        if (stopped) controls.stop();
      } catch (scanError) {
        if (stopped || isInterruptedPlayError(scanError)) return;
        setError(getCameraErrorMessage(scanError));
      }
    };

    start();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      controls?.stop();
      stopStream();
    };
  }, []);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="scanner-panel">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Camera scan</p>
            <h2>Scan product barcode</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close scanner">
            <X size={20} />
          </button>
        </div>
        {error ? (
          <div className="scanner-view unavailable">
            <AlertTriangle size={34} />
            <strong>Camera unavailable</strong>
            <span>Use the barcode field behind this dialog, or check browser camera permission and HTTPS access.</span>
          </div>
        ) : (
          <div className="scanner-view">
            <video ref={videoRef} muted playsInline />
            <div className="scan-frame" />
          </div>
        )}
        {error ? (
          <div className="scanner-error">
            <p>{error}</p>
            <div className="inline-help">
              <Keyboard size={16} /> Manual barcode entry and USB/Bluetooth scanners still work.
            </div>
          </div>
        ) : (
          <p className="muted inline-help">
            <Camera size={16} /> Keep the barcode inside the frame. Hardware scanners can also type into the barcode field.
          </p>
        )}
      </div>
    </div>
  );
}
