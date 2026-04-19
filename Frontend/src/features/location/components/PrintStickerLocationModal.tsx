import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "react-toastify";
import { locationApi } from "../services/location.api";
import type { LocationType } from "../types/location.type";
import "../../barcode/components/printbarcode.css";

type PrintStickerLocationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  locationId: number | null;
};

const PrintStickerLocationModal = ({
  isOpen,
  onClose,
  locationId,
}: PrintStickerLocationModalProps) => {
  const [locationData, setLocationData] = useState<LocationType | null>(null);
  const [stickerSize, setStickerSize] = useState<"6x3" | "10x10">("6x3");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchLocationData = async () => {
      if (!isOpen || !locationId) return;

      setLoading(true);
      try {
        const response = await locationApi.getById(locationId);
        const data = Array.isArray(response.data.data)
          ? response.data.data[0]
          : response.data.data || response.data;
        setLocationData(data);
      } catch (error) {
        console.error("Error fetching location:", error);
        toast.error("Failed to fetch location data");
      } finally {
        setLoading(false);
      }
    };

    fetchLocationData();
  }, [isOpen, locationId]);

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

  const handlePrint = () => {
    if (!locationData) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const is6x3 = stickerSize === "6x3";
    const pageWidth = is6x3 ? "6cm" : "10.16cm";
    const pageHeight = is6x3 ? "3cm" : "10.16cm";
    const pageSize = `${pageWidth} ${pageHeight}`;

    const qrPayload =
      locationData.full_name || locationData.location_code || "";
    const locationText = locationData.full_name || "---";
    const buildingText = locationData.building?.short_name || "---";
    const zoneText =
      `${locationData.zone?.short_name || ""}` +
      (locationData.zone?.zone_type?.short_name !== "Normal"
        ? `,${locationData.zone?.zone_type?.short_name || ""}`
        : "");
    const lockNoText = locationData.lock_no || "---";

    // ✅ ปรับใหม่:
    // 6x3 = layout เดิม
    // 10x10 = QR ใหญ่เกือบเต็มกระดาษจริง
    const qrMm = is6x3 ? 25 : 83;
    const paddingMm = is6x3 ? 2.5 : 2;
    const dashInsetMm = 1;

    printWindow.document.open();
    printWindow.document.write(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Print Location Sticker</title>

  <style>
    .stlocate-root, .stlocate-root * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    @page {
      size: ${pageSize};
      margin: 0;
    }

    html, body {
      width: ${pageWidth};
      height: ${pageHeight};
      margin: 0;
      padding: 0;
      overflow: hidden;
      font-family: Arial, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      background: #fff;
    }

    body {
      width: ${pageWidth};
      height: ${pageHeight};
    }

    .stlocate-root {
      width: 100%;
      height: 100%;
      padding: ${paddingMm}mm;
      position: relative;
      overflow: hidden;
      background: #fff;
      display: flex;
      flex-direction: column;
      ${
        is6x3
          ? `
      justify-content: space-between;
      `
          : `
      align-items: center;
      justify-content: center;
      `
      }
    }

    .stlocate-root::before {
      content: "";
      position: absolute;
      left: ${dashInsetMm}mm;
      top: ${dashInsetMm}mm;
      right: ${dashInsetMm}mm;
      bottom: ${dashInsetMm}mm;
      border: 0.2mm dashed #000;
      opacity: 0.45;
      pointer-events: none;
    }

    .stlocate-top {
      position: relative;
      z-index: 1;
      ${
        is6x3
          ? `
      display: flex;
      flex-direction: row;
      gap: 2.5mm;
      align-items: flex-start;
      justify-content: flex-start;
      `
          : `
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      `
      }
    }

    .stlocate-qr {
      width: ${qrMm}mm;
      height: ${qrMm}mm;
      flex: 0 0 ${qrMm}mm;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .stlocate-qr canvas,
    .stlocate-qr img {
      width: 100% !important;
      height: 100% !important;
      display: block;
    }

    .stlocate-info {
      ${
        is6x3
          ? `
      flex: 1;
      width: 100%;
      display: block;
      `
          : `
      display: none;
      `
      }
    }

    .stlocate-row {
      display: grid;
      grid-template-columns: 11mm 1fr;
      column-gap: 2mm;
      align-items: start;
      margin-bottom: 1mm;
      white-space: nowrap;
    }

    .stlocate-label {
      font-weight: 600;
      font-size: 7pt;
      justify-self: start;
    }

    .stlocate-value {
      font-weight: 300;
      font-size: 7pt;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .stlocate-fullname {
      position: relative;
      z-index: 1;
      ${
        is6x3
          ? `
      font-weight: 600;
      font-size: 7pt;
      line-height: 1.1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding-left: 28mm;
      margin-top: -10mm;
      text-align: left;
      `
          : `
      position: absolute;
      left: 3mm;
      right: 3mm;
      bottom: 3mm;
      font-weight: 600;
      font-size: 14pt;
      line-height: 1.1;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;

      height: 5mm;            /* ✅ กันชน QR */
      line-height: 5mm;
      `
      }
    }

    @media print {
      html, body {
        width: ${pageWidth} !important;
        height: ${pageHeight} !important;
      }
    }
  </style>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
</head>

<body>
  <div class="stlocate-root">
    <div class="stlocate-top">
      <div class="stlocate-qr" id="qrcode"></div>

      <div class="stlocate-info">
        <div class="stlocate-row">
          <div class="stlocate-label">Building</div>
          <div class="stlocate-value">${escapeHtml(buildingText)}</div>
        </div>
        <div class="stlocate-row">
          <div class="stlocate-label">Zone</div>
          <div class="stlocate-value">${escapeHtml(zoneText)}</div>
        </div>
        <div class="stlocate-row" style="margin-bottom:0;">
          <div class="stlocate-label">Lock No.</div>
          <div class="stlocate-value">${escapeHtml(lockNoText)}</div>
        </div>
      </div>
    </div>

    <div class="stlocate-fullname">${escapeHtml(locationText)}</div>
  </div>

  <script>
    new QRCode(document.getElementById("qrcode"), {
      text: ${JSON.stringify(qrPayload)},
      width: ${is6x3 ? 220 : 900},
      height: ${is6x3 ? 220 : 900},
      correctLevel: QRCode.CorrectLevel.M
    });

    setTimeout(() => {
      window.focus();
      window.print();
      setTimeout(() => window.close(), 500);
    }, 800);
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

  if (!locationData) return null;

  const qrPayload = locationData.full_name || locationData.location_code || "";
  const buildingText = locationData.building?.short_name || "---";
  const zoneText =
    `${locationData.zone?.short_name || ""}` +
    (locationData.zone?.zone_type?.short_name !== "Normal"
      ? `,${locationData.zone?.zone_type?.short_name || ""}`
      : "");
  const lockNoText = locationData.lock_no || "---";
  const fullNameText = locationData.full_name || "---";

  return (
    <div className="print-barcode-modal-overlay" onClick={handleOverlayClick}>
      <div className="print-barcode-modal-content">
        <h2 className="print-barcode-modal-title">พิมพ์สติกเกอร์ Location</h2>

        <div className="print-barcode-input-section">
          <div className="print-barcode-input-group">
            <label>ขนาดสติกเกอร์</label>
            <div style={{ display: "flex", gap: "12px" }}>
              <label
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <input
                  type="radio"
                  name="stickerSize"
                  value="6x3"
                  checked={stickerSize === "6x3"}
                  onChange={(e) =>
                    setStickerSize(e.target.value as "6x3" | "10x10")
                  }
                />
                <span>6×3 ซม.</span>
              </label>

              <label
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <input
                  type="radio"
                  name="stickerSize"
                  value="10x10"
                  checked={stickerSize === "10x10"}
                  onChange={(e) =>
                    setStickerSize(e.target.value as "6x3" | "10x10")
                  }
                />
                <span>10.16×10.16 ซม. / 4×4 นิ้ว</span>
              </label>
            </div>
          </div>
        </div>

        <div className="print-barcode-display-section">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "16px",
                alignItems: "flex-start",
              }}
            >
              <div className="print-barcode-qr-code-container">
                <QRCodeSVG
                  value={qrPayload}
                  size={stickerSize === "6x3" ? 100 : 220}
                />
              </div>

              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  paddingTop: "4px",
                }}
              >
                <div style={{ display: "flex", gap: "8px" }}>
                  <span style={{ fontWeight: 600, minWidth: "80px" }}>
                    Building:
                  </span>
                  <span>{buildingText}</span>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <span style={{ fontWeight: 600, minWidth: "80px" }}>
                    Zone:
                  </span>
                  <span>{zoneText}</span>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <span style={{ fontWeight: 600, minWidth: "80px" }}>
                    Lock No.:
                  </span>
                  <span>{lockNoText}</span>
                </div>
              </div>
            </div>

            <div
              style={{
                fontWeight: 600,
                fontSize: "16px",
                paddingTop: "8px",
                borderTop: "1px solid #e0e0e0",
                marginTop: "8px",
              }}
            >
              {fullNameText}
            </div>
          </div>
        </div>

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

export default PrintStickerLocationModal;
