import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { GoodsInType } from "../types/inbound.type";
import "./barcodegoodin.css";

type BarcodeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  goodsInItem: GoodsInType | null;
  onSuccess: () => void;
};

const BarcodeModal = ({
  isOpen,
  onClose,
  goodsInItem,
}: BarcodeModalProps) => {
  const [lot, setLot] = useState("");
  const [exp, setExp] = useState("");
  const [noExpiry, setNoExpiry] = useState(false);

  useEffect(() => {
    if (isOpen && goodsInItem) {
      setLot(goodsInItem.lot || "");

      if (goodsInItem.exp) {
        const expDate = new Date(goodsInItem.exp);
        const formattedExp = expDate.toISOString().slice(0, 10); // YYYY-MM-DD
        setExp(formattedExp);
      } else {
        setExp("");
      }

      setNoExpiry(goodsInItem.no_expiry || false);
    }
  }, [isOpen, goodsInItem]);


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

  const formatYYMMDD = (datetimeLocal: string) => {
    // datetimeLocal: "YYYY-MM-DDTHH:mm"
    if (!datetimeLocal) return "999999";
    const d = new Date(datetimeLocal);
    if (Number.isNaN(d.getTime())) return "999999";

    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}${mm}${dd}`;
  };

  const formatDateOnlyDMY = (value: string) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Asia/Bangkok",
    });
  };

  // ✅ สร้าง payload สำหรับสแกน
  const buildScanPayload = (item: GoodsInType) => {
    const barcodeText =
      (item as any).barcode_text ??
      (item as any).barcodeText ??
      (item as any).barcode ??
      item.code ??
      "";

    // ✅ lot_serial ถ้า null → xxxxxx
    const lotPart =
      (item as any).lot_serial && String((item as any).lot_serial).trim()
        ? String((item as any).lot_serial).trim()
        : "XXXXXX";

    // ✅ exp ถ้า null → 999999
    const expPart = item.exp ? formatYYMMDD(item.exp) : "999999";

    return `${barcodeText}${lotPart}${expPart}`;
  };

  // ✅ PRINT 6x3cm (window.open) แบบเดียวกับ PrintBarcodeModal
  const handlePrint = () => {
    if (!goodsInItem) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    // ขนาดเดียว 6x3cm
    const pageSize = "6cm 3cm";
    const qrMm = 20; // จูนให้บาลานซ์
    const paddingMm = 2.5;
    const dashInsetMm = 1;

    const qrPayload = buildScanPayload(goodsInItem);

    const lotText = lot || "XXXXXX";
    const expText =
      noExpiry || !exp ? "** No Expiry **" : formatDateOnlyDMY(exp);

    const productText = goodsInItem.code || "---";

    printWindow.document.open();
    printWindow.document.write(`
      <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Print GoodIn Sticker</title>

              <style>
                /* reset เฉพาะหน้านี้ */
                .stgoodin-root, .stgoodin-root * { box-sizing: border-box; margin: 0; padding: 0; }

                @page { size: ${pageSize}; margin: 0; }

                html, body {
                  width: 6cm;
                  height: 3cm;
                  margin: 0;
                  padding: 0;
                  overflow: hidden;
                  font-family: Arial, sans-serif;
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                  background: #fff;
                }

                .stgoodin-root{
                  width: 100%;
                  height: 100%;
                  padding: ${paddingMm}mm;
                  display: flex;
                  flex-direction: column;
                  justify-content: flex-start;
                  position: relative;
                }

                /* เส้นประรอบสติ๊กเกอร์สำหรับตัด */
                .stgoodin-root::before{
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

                .stgoodin-top{
                  display: flex;
                  gap: 2mm;
                  align-items: center;
                  position: relative;
                  z-index: 1;
                }

                .stgoodin-qr{
                  width: ${qrMm}mm;
                  height: ${qrMm}mm;
                  flex: 0 0 ${qrMm}mm;
                }

                .stgoodin-qr canvas, .stgoodin-qr img{
                  width: 100% !important;
                  height: 100% !important;
                  display: block;
                }

                .stgoodin-info{
                  flex: 1;
                  min-width: 0;
                  line-height: 1;
                  position: relative;
                  z-index: 1;
                  margin-top: -5.5mm;
                }

                .stgoodin-lot{
                  font-size: 4.8mm;
                  font-weight: 700;
                  margin-bottom: 0.2mm;
                  white-space: nowrap;
                  overflow: hidden;
                  text-overflow: ellipsis;
                }

                .stgoodin-exp{
                  font-size: 3.8mm;
                  font-weight: 600;
                  white-space: nowrap;
                  overflow: hidden;
                  text-overflow: ellipsis;
                }

                .stgoodin-pname{
                  margin-top: 0.8mm;
                  font-size: 3.6mm;
                  font-weight: 700;
                  white-space: nowrap;
                  overflow: hidden;
                  text-overflow: ellipsis;
                  position: relative;
                  z-index: 1;
                }
              </style>

              <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
            </head>

            <body>
              <div class="stgoodin-root">
                <div class="stgoodin-top">
                  <div class="stgoodin-qr" id="qrcode"></div>

                  <div class="stgoodin-info">
                    <div class="stgoodin-lot">${escapeHtml(lotText)}</div>
                    <div class="stgoodin-exp">${escapeHtml(expText)}</div>
                  </div>
                </div>

                <div class="stgoodin-pname">${escapeHtml(productText)}</div>
              </div>

              <script>
                new QRCode(document.getElementById("qrcode"), {
                  text: ${JSON.stringify(qrPayload)},
                  width: 220,
                  height: 220,
                  correctLevel: QRCode.CorrectLevel.M
                });

                setTimeout(() => {
                  window.focus();
                  window.print();
                  setTimeout(() => window.close(), 300);
                }, 250);
              </script>
            </body>
        </html>
    `);

    printWindow.document.close();
  };

  if (!isOpen || !goodsInItem) return null;

  // preview payload (ใน modal)

  const qrPayload = buildScanPayload(goodsInItem);

  return (
    <div className="inbound-barcode-modal-overlay" onClick={handleOverlayClick}>
      <div className="inbound-barcode-modal-content">
        <h2 className="inbound-barcode-modal-title">2D Barcode</h2>

        {/* Input Section */}
        <div className="inbound-barcode-input-section">
          <div className="inbound-barcode-input-group">
            <label>Lot</label>
            <input
              type="text"
              value={lot}
              onChange={(e) => {
                setLot(e.target.value);
              }}
              placeholder="ระบุ Lot "
              className="inbound-barcode-input"
              disabled
            />
          </div>

        </div>

        {/* Preview Section (ไม่ใช่ print) */}
        <div className="inbound-barcode-display-section">
          <div className="inbound-barcode-row">
            <div className="qr-code-container">
              <QRCodeSVG value={qrPayload} size={100} />
            </div>

            <div className="inbound-barcode-info">
              <div className="inbound-barcode-lot-print">{lot || "XXXXXX"}</div>
              <div className="inbound-barcode-expiry-print">
                {noExpiry || !exp ? "** No Expiry **" : formatDateOnlyDMY(exp)}
              </div>
            </div>
          </div>

          <div className="inbound-barcode-pname-print">
            {goodsInItem.code || "---"}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="inbound-barcode-modal-actions">
          <button className="inbound-btn-barcode-print" onClick={handlePrint}>
            Print
          </button>
          <button className="inbound-btn-barcode-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default BarcodeModal;
