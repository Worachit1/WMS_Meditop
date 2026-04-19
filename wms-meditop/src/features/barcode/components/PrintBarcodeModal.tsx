import { useState, useEffect } from "react";
import Barcode from "react-barcode";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "react-toastify";
import { barcodeApi } from "../services/barcode.api";
import type { BarcodeType } from "../types/barcode.type";
import "./printbarcode.css";

type PrintBarcodeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  barcodeId: number | null;
};

const PrintBarcodeModal = ({ isOpen, onClose, barcodeId }: PrintBarcodeModalProps) => {
  const [barcodeData, setBarcodeData] = useState<BarcodeType | null>(null);
  const [stickerSize, setStickerSize] = useState<"small" | "large">("small");
  const [lot, setLot] = useState("");
  const [exp, setExp] = useState("");
  const [noExpiry, setNoExpiry] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchBarcodeData = async () => {
      if (!isOpen || !barcodeId) return;

      setLoading(true);
      try {
        const response = await barcodeApi.getById(barcodeId);
        const data =
          Array.isArray(response.data.data) && response.data.data.length > 0
            ? response.data.data[0]
            : response.data;

        setBarcodeData(data);

        // ใช้ข้อมูลจาก API โดยตรง ไม่คำนวณจาก barcode
        setLot(data.lot || "");
        setExp(data.exp || "");
        setNoExpiry(data.no_expiry || false);
      } catch (error) {
        console.error("Error fetching barcode:", error);
        toast.error("Failed to fetch barcode data");
      } finally {
        setLoading(false);
      }
    };

    fetchBarcodeData();
  }, [isOpen, barcodeId]);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const escapeHtml = (s: string) =>
    (s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  // ✅ PRINT แบบ LocationTable (window.open)
  const handlePrint = () => {
    if (!barcodeData) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const isSmall = stickerSize === "small";
    const pageSize = isSmall ? "6cm 3cm" : "6cm 4cm";

    const barcodeValue = barcodeData.barcode || "0000000000000";
    const qrPayload = barcodeValue;

    // แสดง barcode เต็มๆ
    const barcodeDisplayValue = barcodeValue;

    const lotText = lot || "---";
    const expText = noExpiry || !exp ? "**No Expiry**" : exp;
    const productText = barcodeData.product_code || "---";

    // ขนาดในหน้า print
    const qrMm = isSmall ? 18 : 16;
    const paddingMm = isSmall ? 2.5 : 3;
    const dashInsetMm = 1;

    // Barcode sizing (large)
    const barcodeHeightPx = 20;
    const barcodeFontPx = 9;
    const barcodeLineWidth = 1.5;

    printWindow.document.open();
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Print Barcode</title>

        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }

          @page { size: ${pageSize}; margin: 0; }

          html, body {
            width: 6cm;
            height: ${isSmall ? "3cm" : "4cm"};
            margin: 0;
            padding: 0;
            overflow: hidden;
            font-family: Arial, sans-serif;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            background: #fff;
          }

          body {
            padding: ${paddingMm}mm;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            position: relative;
          }

          /* เส้นประรอบสติ๊กเกอร์สำหรับตัด */
          body::before {
            content: "";
            position: absolute;
            left: ${dashInsetMm}mm;
            top: ${dashInsetMm}mm;
            right: ${dashInsetMm}mm;
            bottom: ${dashInsetMm}mm;
            border: 0.2mm dashed #000;
            opacity: 0.35;
            pointer-events: none;
          }

          .top {
            display: flex;
            gap: 2mm;
            align-items: center;
            position: relative;
            z-index: 1;
          }

          .qr {
            width: ${qrMm}mm;
            height: ${qrMm}mm;
            flex: 0 0 ${qrMm}mm;
          }

          .qr canvas, .qr img {
            width: 100% !important;
            height: 100% !important;
            display: block;
          }

          .info {
            flex: 1;
            min-width: 0;
            line-height: 1;
            position: relative;
            z-index: 1;
          }

          .lot {
            font-size: ${isSmall ? "4.2mm" : "3.6mm"};
            font-weight: 700;
            margin-bottom: 0.2mm;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .exp {
            font-size: ${isSmall ? "4.2mm" : "3.6mm"};
            font-weight: 600;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .pname {
            margin-top: ${isSmall ? "0.8mm" : "1.5mm"};
            font-size: ${isSmall ? "4.2mm" : "3.6mm"};
            font-weight: 600;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            position: relative;
            z-index: 1;
          }

          /* Barcode (เฉพาะ large) */
          .barcode-wrap {
            margin-top: auto;
            display: ${isSmall ? "none" : "flex"};
            justify-content: center;
            align-items: flex-end;
            position: relative;
            z-index: 1;
          }

          /* ย่อ SVG กันล้นนิดๆ */
          svg#barcodeSvg {
            transform: scale(0.92);
            transform-origin: bottom center;
            width: 100%;
            height: auto;
            display: block;
          }
        </style>

        <!-- QRCodeJS -->
        <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
        <!-- JsBarcode -->
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
      </head>

      <body>
        <div class="top">
          <div class="qr" id="qrcode"></div>
          <div class="info">
            <div class="lot">${escapeHtml(lotText)}</div>
            <div class="exp">${escapeHtml(expText)}</div>
          </div>
        </div>

        <div class="pname">${escapeHtml(productText)}</div>

        <div class="barcode-wrap">
          <svg id="barcodeSvg"></svg>
        </div>

        <script>
          // QR
          new QRCode(document.getElementById("qrcode"), {
            text: ${JSON.stringify(qrPayload)},
            width: 220,
            height: 220,
            correctLevel: QRCode.CorrectLevel.M
          });

          ${isSmall ? "" : `
            // Barcode (CODE128)
            JsBarcode("#barcodeSvg", ${JSON.stringify(barcodeDisplayValue)}, {
              format: "CODE128",
              displayValue: true,
              font: "Arial",
              fontSize: ${barcodeFontPx},
              height: ${barcodeHeightPx},
              width: ${barcodeLineWidth},
              margin: 0
            });
          `}

          setTimeout(() => {
            window.focus();
            window.print();
            setTimeout(() => window.close(), 300);
          }, 300);
        </script>
      </body>
      </html>
    `);

    printWindow.document.close();
  };

  if (!isOpen) return null;

  if (loading) {
    return (
      <div className="print-barcode-modal-overlay">
        <div className="print-barcode-modal-content">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!barcodeData) return null;

  // preview (บน modal)
  const barcodeValue = barcodeData.barcode || "0000000000000";
  const qrPayload = barcodeData.barcode;

  // แสดง barcode เต็มๆ
  const barcodeDisplayValuePreview = barcodeValue;

  return (
    <div className="print-barcode-modal-overlay" onClick={handleOverlayClick}>
      <div className="print-barcode-modal-content">
        <h2 className="print-barcode-modal-title">พิมพ์ Barcode</h2>

        {/* Sticker Size Selection */}
        <div className="print-barcode-input-section">
          <div className="print-barcode-input-group">
            <label>ขนาดสติกเกอร์</label>
            <div style={{ display: "flex", gap: "12px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <input
                  type="radio"
                  name="stickerSize"
                  value="small"
                  checked={stickerSize === "small"}
                  onChange={(e) => setStickerSize(e.target.value as "small" | "large")}
                />
                <span>สติกเกอร์เล็ก</span>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <input
                  type="radio"
                  name="stickerSize"
                  value="large"
                  checked={stickerSize === "large"}
                  onChange={(e) => setStickerSize(e.target.value as "small" | "large")}
                />
                <span>สติกเกอร์ใหญ่</span>
              </label>
            </div>
          </div>
        </div>

        {/* Preview Section (ไม่ใช่ print) */}
        <div className="print-barcode-display-section">
          <div className="print-barcode-row">
            <div className="print-barcode-qr-code-container">
              <QRCodeSVG value={qrPayload} size={100} />
            </div>

            <div className="print-barcode-info">
              <div className="print-barcode-lot-print">{lot || "---"}</div>
              <div className="print-barcode-expiry-print">
                {noExpiry || !exp ? "**No Expiry**" : exp}
              </div>
            </div>
          </div>

          <div className="print-barcode-pname-print">
            {barcodeData.product_code || "---"}
          </div>

          {stickerSize === "large" && (
            <div className="print-barcode-container">
              <Barcode
                value={barcodeDisplayValuePreview}
                width={2}
                height={30}
                displayValue={true}
                fontSize={12}
              />
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="print-barcode-modal-actions">
          <button className="btn-barcode-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-barcode-print" onClick={handlePrint}>
            Print
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrintBarcodeModal;
