import React, { useEffect, useMemo, useRef, useState } from "react";
import "../user.css";
import { userApi } from "../services/user.api";
import { confirmAlert, successAlert } from "../../../utils/alert";
import { toast } from "react-toastify";

type PinModalProps = {
  isOpen: boolean;
  onClose: () => void;
  user?: {
    id: string | number;
    first_name: string;
    last_name: string;
    pin?: string | null;
  } | null;
  onPinUpdated?: (newPin: string) => void;
};

const normalizePin = (p: unknown) => {
  const s = (p ?? "").toString().trim();
  if (!s || s === "-" || s.toLowerCase() === "null") return null;
  return s;
};

const PIN_LEN = 6;

const PinModal: React.FC<PinModalProps> = ({
  isOpen,
  onClose,
  user,
  onPinUpdated,
}) => {
  const [pin, setPin] = useState<string | null>(null); // pin ที่มีอยู่แล้ว (ถ้ามี)
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(true);

  // โหมดแก้ไข/ตั้งใหม่ (OTP inputs)
  const [isEditing, setIsEditing] = useState(false);
  const [digits, setDigits] = useState<string[]>(Array(PIN_LEN).fill(""));

  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const userId = useMemo(() => {
    const raw = user?.id;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [user?.id]);

  useEffect(() => {
    if (!isOpen) return;

    const existing = normalizePin(user?.pin);
    setPin(existing);
    setReveal(false); // ไม่เปิดเผย PIN เดิมโดยอัตโนมัติ

    // ถ้ายังไม่มี pin -> เปิดโหมดกรอกทันที
    const shouldEdit = !existing;
    setIsEditing(shouldEdit);
    setDigits(Array(PIN_LEN).fill(""));

    // โฟกัสช่องแรกเมื่อเปิด modal
    setTimeout(() => inputRefs.current[0]?.focus(), 0);
  }, [isOpen, user?.pin]);

  // helper
  const getJoinedPin = () => digits.join("");

  const focusIndex = (i: number) => {
    const idx = Math.max(0, Math.min(PIN_LEN - 1, i));
    inputRefs.current[idx]?.focus();
    inputRefs.current[idx]?.select?.();
  };

  const setDigitAt = (idx: number, val: string) => {
    setDigits((prev) => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
  };

  const handleChange = (idx: number, raw: string) => {
    const v = (raw ?? "").replace(/\D/g, ""); // เอาเฉพาะตัวเลข
    if (!v) {
      setDigitAt(idx, "");
      return;
    }

    // ถ้าพิมพ์/สแกน/ใส่ทีเดียวหลายตัว -> กระจายลงช่องถัด ๆ ไป
    const chars = v.slice(0, PIN_LEN - idx).split("");
    setDigits((prev) => {
      const next = [...prev];
      for (let k = 0; k < chars.length; k++) {
        next[idx + k] = chars[k];
      }
      return next;
    });

    const nextFocus = idx + chars.length;
    if (nextFocus < PIN_LEN) focusIndex(nextFocus);
    else inputRefs.current[PIN_LEN - 1]?.blur();
  };

  const handleKeyDown = (
    idx: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    const key = e.key;

    if (key === "Backspace") {
      e.preventDefault();
      if (digits[idx]) {
        setDigitAt(idx, "");
        return;
      }
      if (idx > 0) {
        setDigitAt(idx - 1, "");
        focusIndex(idx - 1);
      }
      return;
    }

    if (key === "ArrowLeft") {
      e.preventDefault();
      if (idx > 0) focusIndex(idx - 1);
      return;
    }

    if (key === "ArrowRight") {
      e.preventDefault();
      if (idx < PIN_LEN - 1) focusIndex(idx + 1);
      return;
    }

    if (key === "Enter") {
      e.preventDefault();
      void handleSavePin();
    }
  };

  const handlePaste = (
    idx: number,
    e: React.ClipboardEvent<HTMLInputElement>,
  ) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text") || "";
    handleChange(idx, text);
  };

  const handleStartEdit = async () => {
    setIsEditing(true);
    setDigits(Array(PIN_LEN).fill(""));
    setTimeout(() => focusIndex(0), 0);
  };

  const handleSavePin = async () => {
    if (!userId) {
      toast.error("ไม่พบ user id");
      return;
    }

    const newPin = getJoinedPin().trim();
    if (!/^\d{6}$/.test(newPin)) {
      toast.error("กรุณากรอก PIN ให้ครบ 6 หลัก");
      return;
    }

    const action = pin ? "รีเซ็ต" : "สร้าง";
    const { isConfirmed } = await confirmAlert(
      `คุณต้องการ ${action} PIN สำหรับผู้ใช้นี้หรือไม่?`,
    );
    if (!isConfirmed) return;

    try {
      setBusy(true);
      await userApi.updatePin(userId, newPin);
      setPin(newPin);
      onPinUpdated?.(newPin);
      successAlert("PIN ถูกอัปเดตสำเร็จ");

      // กลับไปโหมดแสดงผล
      setIsEditing(false);
      setDigits(Array(PIN_LEN).fill(""));
    } catch (e: any) {
      console.error("updatePin error:", e);
      const status = e?.response?.status;
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        "เกิดข้อผิดพลาดในการอัปเดต PIN";
      toast.error(`${status ? `[${status}] ` : ""}${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setDigits(Array(PIN_LEN).fill(""));
    setTimeout(() => focusIndex(0), 0);
  };

  if (!isOpen) return null;

  return (
    <div className="pinmodal-backdrop" onClick={onClose} role="presentation">
      <div
        className="pinmodal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="pinmodal-header">
          <div>
            <div className="pinmodal-title">PIN</div>
            <div className="pinmodal-sub">
              {user ? `${user.first_name} ${user.last_name}` : "User"}
            </div>
          </div>

          <button
            className="pinmodal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="pinmodal-body">
          {/* ===== แสดง PIN เดิม (ถ้ามี) ===== */}
          {pin && !isEditing && (
            <>
              <div className="pinmodal-label">PIN ปัจจุบัน</div>

              <div className="pinmodal-pinbox">
                <div className="pinmodal-pin">{reveal ? pin : "••••••"}</div>

                <button
                  className="pinmodal-btn ghost"
                  onClick={() => setReveal((v) => !v)}
                  type="button"
                >
                  <i
                    className={`fa-solid ${reveal ? "fa-eye-slash" : "fa-eye"}`}
                  />
                  {reveal ? "ซ่อน" : "แสดง"}
                </button>
              </div>

              <div className="pinmodal-actions">
                <button
                  className="pinmodal-btn primary"
                  onClick={handleStartEdit}
                  disabled={busy}
                  type="button"
                >
                  <i className="fa-solid fa-pen" />
                  ตั้ง/รีเซ็ต PIN
                </button>
              </div>
            </>
          )}

          {/* ===== โหมดกรอก PIN (OTP) ===== */}
          {(!pin || isEditing) && (
            <>
              <div className="pinmodal-label">กรอก PIN 6 หลัก</div>

              <div className="pinotp">
                {Array.from({ length: PIN_LEN }).map((_, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      inputRefs.current[idx] = el;
                    }}
                    className="pinotp-input"
                    inputMode="numeric"
                    pattern="\d*"
                    maxLength={PIN_LEN} // ปล่อยให้ change handler จัดการ multi-chars
                    value={digits[idx]}
                    onChange={(e) => handleChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    onPaste={(e) => handlePaste(idx, e)}
                    aria-label={`PIN digit ${idx + 1}`}
                    disabled={busy}
                  />
                ))}
              </div>

              <div className="pinotp-hint">
                * พิมพ์ทีละช่อง หรือวาง/สแกน 6 หลักได้เลย
              </div>

              <div className="pinmodal-actions">
                {pin && isEditing && (
                  <button
                    className="pinmodal-cancel-btn"
                    onClick={handleCancelEdit}
                    disabled={busy}
                    type="button"
                  >
                    ยกเลิก
                  </button>
                )}

                <button
                  className="pinmodal-btn primary"
                  onClick={handleSavePin}
                  disabled={busy}
                  type="button"
                >
                  <i className="fa-solid fa-lock" />
                  {busy
                    ? "กำลังบันทึก..."
                    : pin
                      ? "บันทึก PIN ใหม่"
                      : "บันทึก PIN"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PinModal;
