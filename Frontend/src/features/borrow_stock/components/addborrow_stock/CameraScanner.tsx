import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";
import "./addborrow_stock.css";

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (text: string) => void;
};

const REGION_ID = "addborrow_stock-scan-region";

async function safeStopAndClear(scanner: Html5Qrcode | null) {
  if (!scanner) return;

  const state = scanner.getState?.() as Html5QrcodeScannerState | undefined;

  if (
    state === Html5QrcodeScannerState.SCANNING ||
    state === Html5QrcodeScannerState.PAUSED
  ) {
    try {
      await scanner.stop();
    } catch {}
  }

  try {
    await scanner.clear();
  } catch {}
}

const CameraScanner: React.FC<Props> = ({ open, onClose, onDetected }) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const closingRef = useRef(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    closingRef.current = false;
    setErrorMsg(null);

    const scanner = new Html5Qrcode(REGION_ID, false);
    scannerRef.current = scanner;

    const start = async () => {
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 260, aspectRatio: 1.0 } as any,
          async (decodedText) => {
            if (closingRef.current) return;
            closingRef.current = true;

            onDetected(decodedText);

            await safeStopAndClear(scannerRef.current);
            scannerRef.current = null;

            onClose();
          },
          () => {},
        );
      } catch (e: any) {
        setErrorMsg(
          e?.message ||
            "ไม่สามารถเปิดกล้องได้ กรุณาอนุญาต Camera และเปิดผ่าน https",
        );
      }
    };

    start();

    return () => {
      closingRef.current = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      safeStopAndClear(s);
    };
  }, [open, onClose, onDetected]);

  if (!open) return null;

  return (
    <div className="addborrow_stock-cam-backdrop">
      <div className="addborrow_stock-cam-modal">
        <div className="addborrow_stock-cam-header">
          <div>Scan</div>
          <button
            type="button"
            onClick={onClose}
            className="addborrow_stock-cam-close"
          >
            ✕
          </button>
        </div>

        <div className="addborrow_stock-cam-body">
          <div id={REGION_ID} />
          {errorMsg ? (
            <div className="addborrow_stock-cam-error">{errorMsg}</div>
          ) : (
            <div className="addborrow_stock-cam-hint">
              เล็ง Barcode/QR ให้ชัด แล้วรอ 1–2 วินาที
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CameraScanner;