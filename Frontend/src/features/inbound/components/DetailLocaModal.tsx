import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Swal from "sweetalert2";
import type { GoodsInType } from "../types/inbound.type";

import "./detailloca.css";

type LocKey = string;
type CountByLoc = Record<LocKey, Record<string, number>>;

type Row = { loc: string; qty: number };

type ActionResult = { ok: boolean; message: string };

type Props = {
  isOpen: boolean;
  onClose: () => void;

  item: GoodsInType | null;
  countByLoc: CountByLoc;

  activeLocKey?: string;

  onSetQty: (loc: string, itemId: string, nextQty: number) => void | Promise<void>;
  onUndo: (loc: string, itemId: string) => Promise<ActionResult>;
  onClear: (loc: string, itemId: string) => Promise<ActionResult>;
};

const DetailLocaModal = ({
  isOpen,
  onClose,
  item,
  countByLoc,
  activeLocKey,
  onSetQty,
  onUndo,
  onClear,
}: Props) => {
  const itemId = String(item?.id ?? "");
  const canEdit = Boolean((item as any)?.input_number);

  const rows: Row[] = useMemo(() => {
    if (!itemId) return [];
    const list = Object.entries(countByLoc || {})
      .map(([loc, map]) => ({ loc, qty: Number(map?.[itemId] ?? 0) }))
      .filter((x) => x.qty > 0);

    list.sort((a, b) => {
      const aActive = a.loc === (activeLocKey || "") ? 0 : 1;
      const bActive = b.loc === (activeLocKey || "") ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return a.loc.localeCompare(b.loc, "th", { numeric: true });
    });

    return list;
  }, [countByLoc, itemId, activeLocKey]);

  const [editingLoc, setEditingLoc] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setEditingLoc(null);
      setEditValue("");
      setBusyKey(null);
    }
  }, [isOpen]);

  if (!isOpen || !item) return null;

  const handleStartEdit = (loc: string, qty: number) => {
    if (!canEdit) return;
    setEditingLoc(loc);
    setEditValue(String(qty));
  };

  const handleCancelEdit = () => {
    setEditingLoc(null);
    setEditValue("");
  };

  const handleSaveEdit = async (loc: string) => {
    const next = parseInt(editValue, 10);
    if (Number.isNaN(next) || next < 0) {
      Swal.fire({ icon: "error", title: "กรุณาใส่ตัวเลขที่ถูกต้อง" });
      return;
    }

    try {
      setBusyKey(`edit:${loc}`);
      await onSetQty(loc, itemId, next);
      setEditingLoc(null);
      setEditValue("");
    } finally {
      setBusyKey(null);
    }
  };

  const handleUndoClick = async (loc: string) => {
    const res = await Swal.fire({
      icon: "question",
      title: "ย้อนกลับ QTY นับ?",
      text: `ต้องการ Undo ที่ Location: ${loc} ใช่ไหม`,
      showCancelButton: true,
      confirmButtonText: "Undo",
      cancelButtonText: "ยกเลิก",
      reverseButtons: true,
    });
    if (!res.isConfirmed) return;

    try {
      setBusyKey(`undo:${loc}`);
      const r = await onUndo(loc, itemId);

      if (!r.ok) {
        Swal.fire({ icon: "warning", title: r.message });
        return;
      }

      Swal.fire({
        icon: "success",
        title: r.message,
        timer: 900,
        showConfirmButton: false,
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleClearClick = async (loc: string) => {
    const res = await Swal.fire({
      icon: "warning",
      title: "เคลียร์ QTY นับ?",
      text: `ต้องการ Clear (ตั้งเป็น 0) ที่ Location: ${loc} ใช่ไหม`,
      showCancelButton: true,
      confirmButtonText: "Clear",
      confirmButtonColor: "#e53935",
      cancelButtonText: "ยกเลิก",
      reverseButtons: true,
    });
    if (!res.isConfirmed) return;

    try {
      setBusyKey(`clear:${loc}`);
      const r = await onClear(loc, itemId);

      if (!r.ok) {
        Swal.fire({ icon: "warning", title: r.message });
        return;
      }

      Swal.fire({
        icon: "success",
        title: r.message,
        timer: 900,
        showConfirmButton: false,
      });
    } finally {
      setBusyKey(null);
    }
  };

  return createPortal(
    <div
      className="detailLoca-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="detailLoca-modal">
        <div className="detailLoca-header">
          <div>
            <div className="detailLoca-title">Detail</div>
            <div className="detailLoca-sub">
              {item.code || "-"} — {item.name || "-"}
              {canEdit ? (
                <span className="detailLoca-badge">input_number</span>
              ) : (
                <span className="detailLoca-badge muted">read-only</span>
              )}
            </div>
          </div>

          <button className="detailLoca-close" onClick={onClose} type="button">
            ✕
          </button>
        </div>

        <div className="detailLoca-body">
          {rows.length === 0 ? (
            <div className="detailLoca-empty">ยังไม่มี QTY นับ</div>
          ) : (
            <table className="detailLoca-table">
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Location</th>
                  <th style={{ width: 140 }}>QTY นับ</th>
                  <th style={{ width: 220 }}>Action</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((r) => {
                  const isActive = r.loc === (activeLocKey || "");
                  const isEditing = editingLoc === r.loc;
                  const isBusy = busyKey?.endsWith(`:${r.loc}`) ?? false;

                  return (
                    <tr key={r.loc} className={isActive ? "active" : ""}>
                      <td style={{ textAlign: "left" }}>
                        {r.loc} {isActive ? <b>(current)</b> : null}
                      </td>

                      <td>
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            className="detailLoca-input"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveEdit(r.loc);
                              if (e.key === "Escape") handleCancelEdit();
                            }}
                            disabled={isBusy}
                          />
                        ) : (
                          <b>{r.qty}</b>
                        )}
                      </td>

                      <td>
                        <div className="detailLoca-actions">
                          {canEdit ? (
                            isEditing ? (
                              <>
                                <button
                                  className="detailLoca-btn"
                                  onClick={() => handleSaveEdit(r.loc)}
                                  type="button"
                                  title="Save"
                                  disabled={isBusy}
                                >
                                  ✓
                                </button>
                                <button
                                  className="detailLoca-btn ghost"
                                  onClick={handleCancelEdit}
                                  type="button"
                                  title="Cancel"
                                  disabled={isBusy}
                                >
                                  ✕
                                </button>
                              </>
                            ) : (
                              <button
                                className="detailLoca-btn edit"
                                onClick={() => handleStartEdit(r.loc, r.qty)}
                                type="button"
                                disabled={isBusy}
                              >
                                Edit
                              </button>
                            )
                          ) : (
                            <button
                              className="detailLoca-btn edit"
                              type="button"
                              disabled
                              title="item นี้แก้จำนวนไม่ได้"
                            >
                              Edit
                            </button>
                          )}

                          <button
                            className="detailLoca-btn undo"
                            onClick={() => handleUndoClick(r.loc)}
                            type="button"
                            disabled={isBusy}
                          >
                            Undo
                          </button>

                          <button
                            className="detailLoca-btn danger"
                            onClick={() => handleClearClick(r.loc)}
                            type="button"
                            disabled={isBusy}
                          >
                            Clear
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="detailLoca-footer">
          <button
            className="detailLoca-btn close"
            onClick={onClose}
            type="button"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default DetailLocaModal;