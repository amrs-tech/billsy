import { BrowserMultiFormatReader } from "@zxing/browser";

type NativeBarcodeDetector = {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
};

type NativeBarcodeDetectorConstructor = new (options?: { formats?: string[] }) => NativeBarcodeDetector;

declare global {
  interface Window {
    BarcodeDetector?: NativeBarcodeDetectorConstructor;
  }
}

export const hasNativeBarcodeDetector = () => typeof window !== "undefined" && Boolean(window.BarcodeDetector);

export const createZxingReader = () => new BrowserMultiFormatReader();

export const barcodeFormats = ["code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e", "qr_code"];

export const getCameraReadinessIssue = () => {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "Camera scanning is available only in a browser.";
  }

  if (!window.isSecureContext) {
    return "Camera scanning needs a secure connection. You opened Billsy from a local network HTTP address, so this mobile browser blocks camera access. Open Billsy with an HTTPS ngrok URL for mobile camera scanning, or use manual/hardware barcode entry on this page.";
  }

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    return "This browser does not provide camera access to web apps. Try Chrome or Edge, or use manual/hardware barcode entry.";
  }

  return "";
};

export const getCameraErrorMessage = (error: unknown) => {
  if (!(error instanceof DOMException)) {
    return error instanceof Error ? error.message : "Camera scanner could not start.";
  }

  if (error.name === "NotAllowedError" || error.name === "SecurityError") {
    return "Camera permission was denied. Allow camera access in the browser, then open the scanner again.";
  }

  if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
    return "No camera was found on this device.";
  }

  if (error.name === "NotReadableError" || error.name === "TrackStartError") {
    return "The camera is already in use by another app or browser tab.";
  }

  if (error.name === "OverconstrainedError") {
    return "The requested camera mode is not available on this device.";
  }

  return error.message || "Camera scanner could not start.";
};
