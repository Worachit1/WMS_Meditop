import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";

import { goodsoutApi } from "../services/outbound.api";
import { confirmAlert, successAlert } from "../../../utils/alert";

import "../../../styles/component.css";
import type { LotUpdatedPayload } from "../components/groporder/GroupOrder";

/* ================= Types ================= */

type GoodsOutItem = {
  id: number;
  outbound_no: string;
  code: string;
  lot_serial: string;
  qty: number;
  pick: number;
  pack: number;
  barcode?: string | null;
  barcode_text?: string | null;
};

type EditLotModalProps = {
  isOpen: boolean;
  onClose: () => void;

  // ❌ เดิม: onSuccess: () => void;
  // ✅ ใหม่:
  onSuccess: (payload: LotUpdatedPayload) => void;

  invoiceItem: {
    outbound_no: string;
    goods_out_id: number;
    lot_serial?: string | null;
    qty?: number;
    product_id?: number | null;
    code?: string;
    name?: string;
  } | null;
};

/* ================= Component ================= */

const EditLotModal = ({
  isOpen,
  onClose,
  onSuccess,
  invoiceItem,
}: EditLotModalProps) => {
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [itemData, setItemData] = useState<GoodsOutItem | null>(null);

  // ✅ เก็บ Lot เดิม/ใหม่ แยกกัน
  const [formData, setFormData] = useState<{
    lot_serial_old: string;
    lot_serial_new: string;
    lot_id_new: number | null;
    qty: number;
  }>({
    lot_serial_old: "",
    lot_serial_new: "",
    lot_id_new: null,
    qty: 0,
  });

  const [currentUser, setCurrentUser] = useState("");
  const [currentTimestamp, setCurrentTimestamp] = useState("");

  const [scanValue, setScanValue] = useState("");
  const scanRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

  // const normalizeToken = (v: unknown) =>
  //   (v ?? "")
  //     .toString()
  //     .replace(/\s|\r|\n|\t/g, "")
  //     .trim();

  // const stripTailExpYYMMDD = (raw: string) => {
  //   return raw.replace(/(\d{6})$/, "");
  // };

  // ✅ parse GS1 แบบมีวงเล็บ เช่น
  // (01)0222111122332233(11)250224(17)260224(10)1234567890
  // => { "01": "...", "11": "...", "17": "...", "10": "1234567890" }
  // const parseGs1WithParens = (raw: string): Record<string, string> => {
  //   const value = normalizeToken(raw);
  //   if (!value.includes("(") || !value.includes(")")) return {};

  //   const result: Record<string, string> = {};
  //   const regex = /\((\d{2,4})\)([^()]+)/g;

  //   let match: RegExpExecArray | null;
  //   while ((match = regex.exec(value)) !== null) {
  //     const ai = match[1];
  //     const data = match[2]?.trim() ?? "";
  //     if (ai) result[ai] = data;
  //   }

  //   return result;
  // };

  // const extractLotFromScan = (rawScan: string, barcodeText: string) => {
  //   const scan = normalizeToken(rawScan);
  //   const bt = normalizeToken(barcodeText);

  //   if (!scan) return "";

  //   // ✅ NEW: ถ้าเป็น GS1 มีวงเล็บ ให้ใช้ค่า AI(10) ก่อนทันที
  //   const gs1 = parseGs1WithParens(scan);
  //   if (gs1["10"]) {
  //     return gs1["10"];
  //   }

  //   // =============================
  //   // fallback: logic เดิม
  //   // =============================
  //   const noExp = stripTailExpYYMMDD(scan);

  //   if (!bt) return "";

  //   if (noExp.includes(bt)) {
  //     const afterBarcode = noExp.replace(bt, "");
  //     return afterBarcode.trim();
  //   }

  //   if (noExp.length >= bt.length) {
  //     const afterBarcode = noExp.slice(bt.length);
  //     return afterBarcode.trim();
  //   }

  //   return "";
  // };

  /* ================= User + Time ================= */

  useEffect(() => {
    if (!isOpen) return;

    const firstName = localStorage.getItem("first_name");
    const lastName = localStorage.getItem("last_name");

    setCurrentUser(
      firstName && lastName ? `${firstName} ${lastName}` : "Unknown User",
    );

    const now = new Date();
    setCurrentTimestamp(
      `${now.toLocaleDateString("th-TH")} ${now.toLocaleTimeString("th-TH")}`,
    );
  }, [isOpen]);

  /* ================= GET ITEM DETAIL ================= */

  useEffect(() => {
    if (!isOpen || !invoiceItem) return;

    const fetchItem = async () => {
      setLoading(true);
      try {
        const res = await goodsoutApi.getOutboundItem(
          invoiceItem.outbound_no,
          invoiceItem.goods_out_id,
        );
        const data: GoodsOutItem = {
          ...res.data,
          code: res.data.code ?? invoiceItem?.code ?? "",
          lot_serial: res.data.lot_serial ?? invoiceItem?.lot_serial ?? "",
          qty: res.data.qty ?? invoiceItem?.qty ?? 0,
        };

        setItemData(data);

        // ✅ reset lot_new ทุกครั้งที่เปิด modal
        setFormData({
          lot_serial_old: data.lot_serial || "",
          lot_serial_new: "",
          lot_id_new: null,
          qty: Number(data.qty ?? 0),
        });

        setScanValue("");
        setTimeout(() => scanRef.current?.focus(), 0);
      } catch {
        toast.error("ไม่สามารถดึงข้อมูล Item ได้");
      } finally {
        setLoading(false);
      }
    };

    fetchItem();
  }, [isOpen, invoiceItem]);

  /* ================= Handlers ================= */

  const handleQtyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      qty: Number(e.target.value),
    }));
  };

  const handleScanKeyDown = async (
  e: React.KeyboardEvent<HTMLInputElement>,
) => {
  if (e.key !== "Enter" && e.key !== "Tab") return;
  e.preventDefault();

  if (!itemData || !invoiceItem) return;

  const raw = scanValue.trim();
  if (!raw) return;

  try {
    setIsSubmitting(true);

    const res = await goodsoutApi.checkOutboundItemBarcode(
      invoiceItem.outbound_no,
      String(invoiceItem.goods_out_id),
      { barcode: raw },
    );

    const checked = res.data?.data;

    const lotNew = String(checked?.lot_serial ?? "").trim();
    // const normalizedScan = String(checked?.normalized_scan ?? "").trim();

    if (!lotNew) {
      toast.error("อ่าน Lot ใหม่จาก barcode ไม่ได้");
      setScanValue("");
      setTimeout(() => scanRef.current?.focus(), 0);
      return;
    }

    setFormData((prev) => ({
      ...prev,
      lot_serial_new: lotNew,
    }));

    // จะโชว์ค่าแปลงแล้วในช่อง scan ก็ได้
    setScanValue("");

    toast.success(`Lot ใหม่: ${lotNew}`);

    scanRef.current?.blur();
    setTimeout(() => qtyRef.current?.focus(), 100);
  } catch (error: any) {
    toast.error(
      error?.response?.data?.message || "ไม่สามารถตรวจสอบ barcode ได้",
    );
    setScanValue("");
    setTimeout(() => scanRef.current?.focus(), 0);
  } finally {
    setIsSubmitting(false);
  }
};

  /* ================= PATCH ================= */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemData || !invoiceItem) return;

    const lotNew = (formData.lot_serial_new || "").trim();
    if (!lotNew) {
      toast.error("กรุณา Scan เพื่อได้ Lot ใหม่ก่อน");
      setTimeout(() => scanRef.current?.focus(), 0);
      return;
    }

    if (formData.qty <= 0) {
      toast.error("QTY ต้องมากกว่า 0");
      return;
    }

    if (formData.qty > itemData.qty) {
      toast.error("QTY ห้ามเกินจำนวนเดิม");
      return;
    }

    const confirm = await confirmAlert("ยืนยันการอัพเดท Lot และ Quantity ?");
    if (!confirm.isConfirmed) return;

    setIsSubmitting(true);
    try {
      await goodsoutApi.createOutboundLotAdjustment(
        invoiceItem.outbound_no,
        String(invoiceItem.goods_out_id),
        {
          user_ref: currentUser,
          lines: [
            {
              lot_serial: formData.lot_serial_old,
              qty: itemData.qty - formData.qty,
            },
            {
              lot_serial: lotNew,
              qty: formData.qty,
            },
          ],
        },
      );

      await successAlert("อัพเดท Lot สำเร็จ");

      // ✅ ส่ง payload ขึ้นไป
      onSuccess({
        outbound_no: invoiceItem.outbound_no,
        goods_out_id: String(invoiceItem.goods_out_id),
        lot_old: formData.lot_serial_old,
        lot_new: lotNew,
        qty_old: itemData.qty,
        qty_new: formData.qty,
      });
      onClose();
    } catch {
      toast.error("ไม่สามารถอัพเดทข้อมูลได้");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="edit-OVW-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="edit-OVW-modal-content">
        <h2 className="edit-OVW-title">เปลี่ยน Lot.</h2>

        {loading ? (
          <div className="edit-OVW-loading">Loading...</div>
        ) : !itemData ? null : (
          <form onSubmit={handleSubmit}>
            <div className="edit-OVW-info-section">
              <div className="edit-OVW-info-row">
                <label className="edit-OVW-label">Invoice :</label>
                <span className="edit-OVW-value">{itemData.outbound_no}</span>
              </div>
              <div className="edit-OVW-info-row">
                <label className="edit-OVW-label">SKU :</label>
                <span className="edit-OVW-value">{itemData.code}</span>
              </div>
              <div className="edit-OVW-info-row">
                <label className="edit-OVW-label">QTY :</label>
                <span className="edit-OVW-value">{itemData.qty}</span>
              </div>
            </div>

            <hr className="edit-OVW-divider" />

            <div className="edit-OVW-input-section">
              <div className="edit-OVW-form-group">
                <label className="edit-OVW-input-label">
                  Scan สินค้า เปลี่ยน Lot
                </label>
                <input
                  ref={scanRef}
                  type="text"
                  value={scanValue}
                  onChange={(e) => setScanValue(e.target.value)}
                  onKeyDown={handleScanKeyDown}
                  className="edit-OVW-input"
                  placeholder="สแกน QR: [barcode + lot + yymmdd]"
                  disabled={isSubmitting}
                />
              </div>

              <div className="edit-OVW-form-group">
                <label className="edit-OVW-input-label">Lot เดิม</label>
                <input
                  type="text"
                  value={formData.lot_serial_old}
                  className="edit-OVW-input"
                  readOnly
                  disabled
                  style={{ background: "#f5f5f5", cursor: "not-allowed" }}
                />
              </div>

              <div className="edit-OVW-form-group">
                <label className="edit-OVW-input-label">Lot ใหม่</label>
                <input
                  type="text"
                  value={formData.lot_serial_new}
                  className="edit-OVW-input"
                  readOnly
                  disabled
                  placeholder="สแกนเพื่อดึง Lot ใหม่"
                  style={{
                    background: formData.lot_serial_new ? "#e8f5e9" : "#f5f5f5",
                    cursor: "not-allowed",
                    fontWeight: 700,
                  }}
                />
              </div>

              <div className="edit-OVW-form-group">
                <label className="edit-OVW-input-label">QTY</label>
                <input
                  ref={qtyRef}
                  type="number"
                  value={formData.qty}
                  onChange={handleQtyChange}
                  className="edit-OVW-input"
                  disabled={isSubmitting}
                  min={1}
                  max={itemData.qty}
                />
              </div>
            </div>

            <hr className="edit-OVW-divider" />

            <div className="edit-OVW-footer-info">
              <div className="edit-OVW-info-row">
                <label className="edit-OVW-label">User</label>
                <span className="edit-OVW-value">{currentUser}</span>
              </div>
              <div className="edit-OVW-info-row">
                <label className="edit-OVW-label">Timestamp</label>
                <span className="edit-OVW-value">{currentTimestamp}</span>
              </div>
            </div>

            <div className="edit-OVW-actions">
              <button
                type="button"
                onClick={onClose}
                className="edit-OVW-btn-cancel"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="edit-OVW-btn-confirm"
                disabled={isSubmitting || !formData.lot_serial_new.trim()}
                title={
                  !formData.lot_serial_new.trim()
                    ? "กรุณา Scan เพื่อได้ Lot ใหม่ก่อน"
                    : undefined
                }
              >
                {isSubmitting ? "Processing..." : "Confirm"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default EditLotModal;
