import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { GoodsInType } from "../types/inbound.type";
import {
  buildBarcodeScanPayload,
  printBarcodeLabels,
} from "../services/barcodePrint";
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
  const [printQty, setPrintQty] = useState("1");

  const getDefaultPrintQty = (item: GoodsInType) => {
    const parsedQty = Math.floor(Number(item.qty ?? item.quantity_receive ?? 1));
    return String(Math.max(1, parsedQty || 1));
  };

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
      setPrintQty(getDefaultPrintQty(goodsInItem));
    }
  }, [isOpen, goodsInItem]);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
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

  const handlePrint = async () => {
    if (!goodsInItem) return;
    const copies = Math.max(1, Math.floor(Number(printQty) || 1));
    await printBarcodeLabels([{ item: goodsInItem, copies }]);
  };

  if (!isOpen || !goodsInItem) return null;

  // preview payload (ใน modal)

  const qrPayload = buildBarcodeScanPayload(goodsInItem);

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
          <div className="inbound-barcode-print-qty-group">
            <label htmlFor="barcode-print-qty">Qty Print</label>
            <input
              id="barcode-print-qty"
              type="number"
              min="1"
              step="1"
              value={printQty}
              onChange={(e) => {
                const { value } = e.target;
                if (value === "") {
                  setPrintQty("");
                  return;
                }

                const nextQty = Math.max(1, Math.floor(Number(value) || 1));
                setPrintQty(String(nextQty));
              }}
              onBlur={() => {
                setPrintQty((currentQty) => {
                  const nextQty = Math.max(1, Math.floor(Number(currentQty) || 1));
                  return String(nextQty);
                });
              }}
              className="inbound-barcode-print-qty-input"
            />
          </div>

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
