// src/modules/adjustment/components/adjustdetail/AdjustDetailModal.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import Swal from "sweetalert2";
import { toast } from "react-toastify";

import type {
  AdjustmentType,
  AdjustmentItem,
} from "../../types/adjustment.type";
import { adjustmentApi } from "../../services/adjustment.api";
import { confirmAlert, successAlert } from "../../../../utils/alert";

import "./adjustdetail.css";

type Props = {
  isOpen: boolean;
  adjustment: AdjustmentType | null; // from list
  onClose: () => void;
  onUpdated?: () => void; // parent refetch list
};

type ImpactLine = {
  key: string;
  code: string;
  name: string;

  location_full_name: string;
  lot_serial: string;
  qty: number;

  unit?: string | null;

  scanned_location?: string; // ✅ เพิ่ม: ต้นทางที่ scan มา
};

const normalize = (v: unknown) => String(v ?? "").trim();

const getUserRef = () => {
  const first = (localStorage.getItem("first_name") || "").trim();
  const last = (localStorage.getItem("last_name") || "").trim();
  return `${first} ${last}`.trim();
};

// ✅ FE แสดงแค่ 3 สถานะ: pending / in-progress / completed
// แต่ถ้า BE ส่ง draft มา ให้ FE แสดงเป็น in-progress
const toUiStatus = (
  s?: string | null,
): "pending" | "in-progress" | "completed" => {
  if (s === "completed") return "completed";
  if (s === "pending") return "pending";
  // draft / in-progress / null => treat as in-progress for UI
  return "in-progress";
};

const statusLabel = (s?: string | null) => {
  const ui = toUiStatus(s);
  if (ui === "pending") return "Pending";
  if (ui === "in-progress") return "In Progress";
  return "Completed";
};

function mergeImpactLines(prev: ImpactLine[], next: ImpactLine[]) {
  // ✅ กันซ้ำตาม key (key = adjustment_item.id)
  const map = new Map<string, ImpactLine>();
  for (const p of prev) map.set(p.key, p);

  for (const n of next) {
    if (!map.has(n.key)) {
      map.set(n.key, n);
      continue;
    }

    // ถ้าซ้ำ: เลือกจะ "ไม่ทับ" ของเดิม เพื่อไม่ทำให้ user กรอกแล้วหาย
    // (ถ้าคุณอยากทับบาง field ก็ปรับตรงนี้ได้)
  }

  return Array.from(map.values());
}

const AdjustDetailModal = ({
  isOpen,
  adjustment,
  onClose,
  onUpdated,
}: Props) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const [detail, setDetail] = useState<AdjustmentType | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [scanLocation, setScanLocation] = useState("");
  const [confirmedLocation, setConfirmedLocation] = useState<string | null>(
    null,
  );

  const [impactLines, setImpactLines] = useState<ImpactLine[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const actionLoading = isSaving || isConfirming || loadingDetail;

  const loadDetail = useCallback(async () => {
    if (!adjustment?.id) return;
    setLoadingDetail(true);
    try {
      const resp = await adjustmentApi.getDetailById(adjustment.id);
      setDetail(resp.data.data);
    } catch (e) {
      toast.error("โหลดรายละเอียด Adjustment ไม่สำเร็จ");
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, [adjustment?.id]);

  // reset when open/change doc
  useEffect(() => {
    if (!isOpen) return;

    setScanLocation("");
    setConfirmedLocation(null);
    setImpactLines([]);
    setDetail(null);

    loadDetail();
    setTimeout(() => scanRef.current?.focus(), 120);
  }, [isOpen, adjustment?.id, adjustment?.no, loadDetail]);

  // ESC close
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  // click outside close
  useEffect(() => {
    if (!isOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (modalRef.current && !modalRef.current.contains(target)) onClose();
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [isOpen, onClose]);

  const a = detail ?? adjustment;
  const uiStatus = toUiStatus(a?.status);

  const header = useMemo(() => {
    if (!a) return null;

    const relatedProcess =
      (a as any).related_process || (a as any).process || "Outbound - Picking";
    const reason = (a as any).reason || "-";
    const level = (a as any).level || "-";
    const refDoc = (a as any).origin || (a as any).ref_doc || "-";
    const user = (a as any).user || (a as any).created_by || "-";
    const date =
      (a as any).date || (a as any).created_at || new Date().toISOString();

    return { relatedProcess, reason, level, refDoc, user, date };
  }, [a]);

  const detailLines = useMemo(() => {
    if (!a) return [];
    const lines: AdjustmentItem[] =
      (a as any)?.items || (a as any)?.lines || [];
    return lines.map((x, idx) => ({
      key: String((x as any).id ?? idx),
      code: String((x as any).code ?? ""),
      name: String((x as any).name ?? ""),
      location: String((x as any).location ?? ""),
      lot: String((x as any).lot_serial ?? ""),
      qty: Number((x as any).qty ?? 0),
      unit: String((x as any).unit ?? ""),
    }));
  }, [a]);

  const handleScanLocationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!a?.no) return;

    const loc = scanLocation.trim();
    if (!loc) return;

    try {
      const resp = await adjustmentApi.scanLocation(a.no, {
        location_full_name: loc,
      });

      const payload = resp.data as any;
      const locName =
        payload.location_full_name ||
        payload.location?.full_name ||
        payload.location?.location_name ||
        loc;

      setConfirmedLocation(String(locName));

      // ✅ ให้ input แสดง location ที่ scan จริง (ตามที่คุณต้องการ)
      setScanLocation(loc);

      const impact: any[] =
        payload.impact || payload.impact_lines || payload.lines || [];

      const mapped: ImpactLine[] = impact.map((x, idx) => ({
        key: String(x.id ?? x.key ?? idx),
        code: String(x.code ?? x.product_code ?? ""),
        name: String(x.name ?? x.product_name ?? ""),
        location_full_name: locName,
        lot_serial: String(x.lot_serial ?? x.lot ?? ""),
        qty: Number(x.qty ?? x.quantity ?? 0),
        unit: x.unit ?? x.uom ?? null,

        scanned_location: locName, // ✅ เพิ่ม
      }));

      // ✅ append ต่อท้ายแบบไม่ทับ (merge กันซ้ำ)
      setImpactLines((prev) => mergeImpactLines(prev, mapped));

      Swal.fire({
        icon: "success",
        title: "Location OK",
        text: String(locName),
        timer: 900,
        showConfirmButton: false,
      });
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || "ไม่สามารถ Scan Location ได้",
      );
      // ❗️ไม่ล้าง impactLines แล้ว เพราะคุณต้องการให้สะสมไว้
      setConfirmedLocation(null);
    }
  };

  const updateImpactLine = (key: string, patch: Partial<ImpactLine>) => {
    setImpactLines((prev) =>
      prev.map((x) => (x.key === key ? { ...x, ...patch } : x)),
    );
  };

  const validateBeforeSave = () => {
    if (!a) return { ok: false, msg: "ไม่พบเอกสาร Adjustment" };
    if (uiStatus === "completed")
      return { ok: false, msg: "เอกสาร Completed แล้ว แก้ไขไม่ได้" };
    if (!confirmedLocation)
      return { ok: false, msg: "กรุณา Scan Location ก่อน" };
    if (impactLines.length === 0)
      return { ok: false, msg: "ไม่มี Impact ให้แก้ไข" };

    const invalid = impactLines.find((l) => {
      if (!normalize(l.location_full_name)) return true;
      if (!normalize(l.lot_serial)) return true;
      const q = Number(l.qty);
      if (!Number.isFinite(q) || q <= 0) return true;
      return false;
    });

    if (invalid)
      return {
        ok: false,
        msg: "กรุณากรอก Location / Lot / QTY ให้ถูกต้อง (QTY > 0)",
      };
    return { ok: true, msg: "" };
  };

  const handleSaveDraft = async () => {
    const v = validateBeforeSave();
    if (!v.ok || !a?.no) {
      Swal.fire({ icon: "warning", title: "ตรวจสอบข้อมูล", text: v.msg });
      return;
    }

    const result = await confirmAlert("บันทึกเป็น Draft เพื่อกลับมาแก้ไข?");
    if (!result.isConfirmed) return;

    setIsSaving(true);
    try {
      // ✅ ส่ง status ไปด้วยก็ได้ (ถ้า BE ignore ก็ไม่เป็นไร)
      // BE ของคุณตอนนี้ set เป็น draft อยู่แล้ว -> FE จะ map draft เป็น in-progress
      await adjustmentApi.saveDraft(a.no, {
        status: "draft",
        scan_location: confirmedLocation,
        impact_lines: impactLines.map((x) => ({
          key: x.key,
          location_full_name: x.location_full_name,
          lot_serial: x.lot_serial,
          qty: x.qty,
        })),
      });

      await successAlert("บันทึก Draft สำเร็จ");
      await loadDetail(); // ✅ reload เพื่อให้ status เปลี่ยน
      onUpdated?.(); // ✅ ให้ table เปลี่ยนปุ่มเป็น Continue
    } catch (err: any) {
      Swal.fire({
        icon: "error",
        title: "บันทึก Draft ไม่สำเร็จ",
        text: err?.response?.data?.message || "เกิดข้อผิดพลาด",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirm = async () => {
    const v = validateBeforeSave();
    if (!v.ok || !a?.no) {
      Swal.fire({ icon: "warning", title: "ตรวจสอบข้อมูล", text: v.msg });
      return;
    }

    const result = await confirmAlert(
      "ยืนยัน Adjustment และเปลี่ยนสถานะเป็น Completed?",
    );
    if (!result.isConfirmed) return;

    setIsConfirming(true);
    try {
      await adjustmentApi.confirm(a.no, {
        status: "completed",
        scan_location: confirmedLocation,
        impact_lines: impactLines.map((x) => ({
          key: x.key,
          location_full_name: x.location_full_name,
          lot_serial: x.lot_serial,
          qty: x.qty,
        })),
      });

      await successAlert("Confirm Adjustment สำเร็จ");
      onUpdated?.();
      onClose(); // ✅ confirm ค่อยปิด
    } catch (err: any) {
      Swal.fire({
        icon: "error",
        title: "Confirm ไม่สำเร็จ",
        text: err?.response?.data?.message || "เกิดข้อผิดพลาด",
      });
    } finally {
      setIsConfirming(false);
    }
  };

  if (!isOpen || !adjustment) return null;

  return createPortal(
    <div className="adjustment-detail-overlay" aria-modal="true" role="dialog">
      <div className="adjustment-detail-modal" ref={modalRef}>
        <div className="adjustment-detail-header">
          <div className="adjustment-detail-title">Adjustment Detail</div>
          <button
            type="button"
            className="adjustment-detail-close-btn"
            onClick={onClose}
            disabled={actionLoading}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Header info */}
        <div className="adjustment-detail-meta">
          <div className="adjustment-detail-meta-grid">
            <div className="adjustment-detail-meta-row">
              <div className="adjustment-detail-meta-label">Adjust No :</div>
              <div className="adjustment-detail-meta-value">{a?.no ?? "-"}</div>
            </div>

            <div className="adjustment-detail-meta-row">
              <div className="adjustment-detail-meta-label">Status :</div>
              <div className="adjustment-detail-meta-value">
                {statusLabel(a?.status)}
              </div>
            </div>

            <div className="adjustment-detail-meta-row">
              <div className="adjustment-detail-meta-label">
                Related Process :
              </div>
              <div className="adjustment-detail-meta-value">
                {header?.relatedProcess}
              </div>
            </div>

            <div className="adjustment-detail-meta-row">
              <div className="adjustment-detail-meta-label">Level :</div>
              <div className="adjustment-detail-meta-value">
                {header?.level}
              </div>
            </div>

            <div className="adjustment-detail-meta-row">
              <div className="adjustment-detail-meta-label">Ref Doc :</div>
              <div className="adjustment-detail-meta-value">
                {header?.refDoc}
              </div>
            </div>

            <div className="adjustment-detail-meta-row">
              <div className="adjustment-detail-meta-label">Reason :</div>
              <div className="adjustment-detail-meta-value adjustment-detail-meta-reason">
                {header?.reason}
              </div>
            </div>

            <div className="adjustment-detail-meta-row">
              <div className="adjustment-detail-meta-label">User :</div>
              <div className="adjustment-detail-meta-value">{getUserRef()}</div>
            </div>

            <div className="adjustment-detail-meta-row">
              <div className="adjustment-detail-meta-label">Date/Time :</div>
              <div className="adjustment-detail-meta-value">
                {header?.date
                  ? new Date(header.date).toLocaleString("th-TH")
                  : "-"}
              </div>
            </div>
          </div>
        </div>

        <div className="adjustment-detail-divider" />

        <div className="adjustment-detail-body">
          {/* Detail section */}
          <div className="adjustment-detail-section">
            <div className="adjustment-detail-section-title">Detail</div>

            <form
              className="adjustment-detail-scan-row"
              onSubmit={handleScanLocationSubmit}
            >
              <div className="adjustment-detail-scan-label">Scan Location</div>

              <input
                ref={scanRef}
                className="adjustment-detail-scan-input"
                value={scanLocation}
                onChange={(e) => setScanLocation(e.target.value)}
                placeholder="Scan Location"
                style={{
                  borderColor: confirmedLocation ? "#4CAF50" : undefined,
                }}
                disabled={actionLoading || uiStatus === "completed"}
              />

              <button
                type="submit"
                className="adjustment-detail-scan-btn"
                disabled={actionLoading || uiStatus === "completed"}
              >
                Scan
              </button>

              <div
                className={`adjustment-detail-scan-hint ${confirmedLocation ? "ok" : "wait"}`}
              >
                {confirmedLocation
                  ? "✅ Location OK"
                  : "⏳ ต้อง Scan Location ก่อน"}
              </div>
            </form>

            <div className="adjustment-detail-table-wrap">
              <table className="adjustment-detail-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Location</th>
                    <th>Lot.</th>
                    <th>QTY</th>
                    <th>หน่วย</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingDetail ? (
                    <tr>
                      <td colSpan={6} className="adjustment-detail-empty">
                        กำลังโหลดรายละเอียด...
                      </td>
                    </tr>
                  ) : detailLines.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="adjustment-detail-empty">
                        ไม่พบรายการ Detail
                      </td>
                    </tr>
                  ) : (
                    detailLines.map((x) => (
                      <tr key={x.key}>
                        <td>{x.code}</td>
                        <td>{x.name}</td>
                        <td>{x.location}</td>
                        <td>{x.lot}</td>
                        <td className="adjustment-detail-qty">{x.qty}</td>
                        <td>{x.unit}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Impact section */}
          <div className="adjustment-detail-section">
            <div className="adjustment-detail-section-title">
              Impact
             
            </div>
             <button
                type="button"
                style={{ marginLeft: "auto" }}
                className="adjustment-detail-btn adjustment-detail-btn-cancel"
                onClick={() => setImpactLines([])}
                disabled={actionLoading}
              >
                Clear
              </button>

            <div className="adjustment-detail-table-wrap">
              <table className="adjustment-detail-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Location</th>
                    <th>Lot.</th>
                    <th>QTY</th>
                    <th>หน่วย</th>
                  </tr>
                </thead>
                <tbody>
                  {impactLines.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="adjustment-detail-empty">
                        {confirmedLocation
                          ? "ไม่พบ Impact จาก Location นี้"
                          : "กรุณา Scan Location เพื่อโหลด Impact"}
                      </td>
                    </tr>
                  ) : (
                    impactLines.map((x) => (
                      <tr key={x.key}>
                        <td>{x.code}</td>
                        <td>{x.name}</td>

                        <td>
                          <input
                            className="adjustment-detail-cell-input"
                            value={x.location_full_name}
                            onChange={(e) =>
                              updateImpactLine(x.key, {
                                location_full_name: e.target.value,
                              })
                            }
                            disabled={
                              !confirmedLocation ||
                              actionLoading ||
                              uiStatus === "completed"
                            }
                          />
                        </td>

                        <td>
                          <input
                            className="adjustment-detail-cell-input"
                            value={x.lot_serial}
                            onChange={(e) =>
                              updateImpactLine(x.key, {
                                lot_serial: e.target.value,
                              })
                            }
                            disabled={
                              !confirmedLocation ||
                              actionLoading ||
                              uiStatus === "completed"
                            }
                          />
                        </td>

                        <td>
                          <input
                            className="adjustment-detail-cell-input adjustment-detail-cell-qty"
                            type="number"
                            step="1"
                            value={Number.isFinite(x.qty) ? x.qty : 0}
                            onChange={(e) =>
                              updateImpactLine(x.key, {
                                qty: Number(e.target.value),
                              })
                            }
                            disabled={
                              !confirmedLocation ||
                              actionLoading ||
                              uiStatus === "completed"
                            }
                          />
                        </td>

                        <td>{x.unit ?? "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="adjustment-detail-footer">
              <button
                type="button"
                className="adjustment-detail-btn adjustment-detail-btn-draft"
                onClick={handleSaveDraft}
                disabled={actionLoading || uiStatus === "completed"}
              >
                {isSaving ? "Saving..." : "Save Draft"}
              </button>

              <button
                type="button"
                className="adjustment-detail-btn adjustment-detail-btn-cancel"
                onClick={onClose}
                disabled={actionLoading}
              >
                Cancel
              </button>

              <button
                type="button"
                className="adjustment-detail-btn adjustment-detail-btn-confirm"
                onClick={handleConfirm}
                disabled={actionLoading || uiStatus === "completed"}
              >
                {isConfirming ? "Confirming..." : "Confirm Adjustment"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default AdjustDetailModal;
