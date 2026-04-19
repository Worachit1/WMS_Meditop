import type { GoodsInType } from "../types/inbound.type";

const escapeHtml = (s: string) =>
  (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatYYMMDD = (value: string) => {
  if (!value) return "999999";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "999999";

  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
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

export const buildBarcodeScanPayload = (item: GoodsInType) => {
  const barcodeText =
    (item as any).barcode_text ??
    (item as any).barcodeText ??
    (item as any).barcode?.barcode ??
    item.code ??
    "";

  const lotPart =
    (item as any).lot_serial && String((item as any).lot_serial).trim()
      ? String((item as any).lot_serial).trim()
      : "XXXXXX";

  const expPart = item.exp ? formatYYMMDD(item.exp) : "999999";

  return `${barcodeText}${lotPart}${expPart}`;
};

const buildLabelMarkup = (item: GoodsInType) => {
  const qrPayload = buildBarcodeScanPayload(item);

  const lotText =
    (item as any).lot_serial && String((item as any).lot_serial).trim()
      ? String((item as any).lot_serial).trim()
      : item.lot || "XXXXXX";

  const expText =
    item.no_expiry || !item.exp ? "** No Expiry **" : formatDateOnlyDMY(item.exp);

  const productText = item.code || "---";

  return `
    <div class="stgoodin-page">
      <div class="stgoodin-root">
        <div class="stgoodin-top">
          <div class="stgoodin-qr" data-qr=${JSON.stringify(qrPayload)}></div>

          <div class="stgoodin-info">
            <div class="stgoodin-lot">${escapeHtml(String(lotText))}</div>
            <div class="stgoodin-exp">${escapeHtml(expText)}</div>
          </div>
        </div>

        <div class="stgoodin-pname">${escapeHtml(productText)}</div>
      </div>
    </div>
  `;
};

const buildPrintDocument = (labelsMarkup: string) => `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Print GoodIn Sticker</title>
      <style>
        .stgoodin-page, .stgoodin-page * { box-sizing: border-box; margin: 0; padding: 0; }
        @page { size: 6cm 3cm; margin: 0; }

        html, body {
          margin: 0;
          padding: 0;
          background: #fff;
          font-family: Arial, sans-serif;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .stgoodin-page {
          width: 6cm;
          height: 3cm;
          padding: 2.5mm;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          position: relative;
          page-break-after: always;
          overflow: hidden;
        }

        .stgoodin-page:last-child {
          page-break-after: auto;
        }

        .stgoodin-page::before {
          content: "";
          position: absolute;
          left: 1mm;
          top: 1mm;
          right: 1mm;
          bottom: 1mm;
          border: 0.2mm dashed #000;
          opacity: 0.35;
          pointer-events: none;
        }

        .stgoodin-top {
          display: flex;
          gap: 2mm;
          align-items: center;
          position: relative;
          z-index: 1;
        }

        .stgoodin-qr {
          width: 20mm;
          height: 20mm;
          flex: 0 0 20mm;
        }

        .stgoodin-qr canvas, .stgoodin-qr img {
          width: 100% !important;
          height: 100% !important;
          display: block;
        }

        .stgoodin-info {
          flex: 1;
          min-width: 0;
          line-height: 1;
          position: relative;
          z-index: 1;
          margin-top: -5.5mm;
        }

        .stgoodin-lot {
          font-size: 4.8mm;
          font-weight: 700;
          margin-bottom: 0.2mm;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .stgoodin-exp {
          font-size: 3.8mm;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .stgoodin-pname {
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
      ${labelsMarkup}
      <script>
        document.querySelectorAll('.stgoodin-qr').forEach((node) => {
          new QRCode(node, {
            text: node.getAttribute('data-qr') || '',
            width: 220,
            height: 220,
            correctLevel: QRCode.CorrectLevel.M
          });
        });

        setTimeout(() => {
          window.focus();
          window.print();
        }, 300);

        window.onafterprint = () => {
          setTimeout(() => window.close(), 150);
        };
      </script>
    </body>
  </html>
`;

export type PrintBarcodeStatus = "printed" | "cancelled";

export const printBarcodeLabels = (
  items: Array<{ item: GoodsInType; copies: number }>,
): Promise<PrintBarcodeStatus> => {
  const expandedLabels = items.flatMap(({ item, copies }) => {
    const safeCopies = Math.max(1, Math.floor(copies || 1));
    return Array.from({ length: safeCopies }, () => buildLabelMarkup(item));
  });

  if (expandedLabels.length === 0) {
    return Promise.resolve("cancelled");
  }

  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    throw new Error("ไม่สามารถเปิดหน้าต่างสำหรับพิมพ์ได้");
  }

  const labelsMarkup = expandedLabels.join("");

  return new Promise<PrintBarcodeStatus>((resolve, reject) => {
    let settled = false;
    let sawAfterPrint = false;
    let fallbackTimer: number | null = null;

    const cleanup = () => {
      if (fallbackTimer) {
        window.clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }

      try {
        printWindow.removeEventListener("afterprint", handleAfterPrint);
        printWindow.removeEventListener("beforeunload", handleBeforeUnload);
      } catch {
        // ignore
      }
    };

    const finish = (status: PrintBarcodeStatus) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(status);
    };

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };

    const handleAfterPrint = () => {
      sawAfterPrint = true;
    };

    const handleBeforeUnload = () => {
      finish(sawAfterPrint ? "printed" : "cancelled");
    };

    try {
      printWindow.addEventListener("afterprint", handleAfterPrint);
      printWindow.addEventListener("beforeunload", handleBeforeUnload);

      printWindow.document.open();
      printWindow.document.write(buildPrintDocument(labelsMarkup));
      printWindow.document.close();
    } catch {
      fail("ไม่สามารถเตรียมหน้าต่างสำหรับพิมพ์ได้");
      return;
    }

    fallbackTimer = window.setTimeout(() => {
      if (!settled) finish(sawAfterPrint ? "printed" : "cancelled");
    }, 3000);
  });
};