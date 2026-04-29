import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useNavigate,
  useParams,
  useSearchParams,
  useLocation,
} from "react-router-dom";
import DetailNavigator from "../../../../components/DetailNavigator/DetailNavigator";
import { toast } from "react-toastify";

import type { AdjustmentType } from "../../types/adjustment.type";
import { adjustmentApi } from "../../services/adjustment.api";
import Loading from "../../../../components/Loading/Loading";
import { confirmAlert } from "../../../../utils/alert";
import { formatDateTime } from "../../../../components/Datetime/FormatDateTime";
import { socket } from "../../../../services/socket";

import "./adjustmanual.css";

type AnyItem = any;

type ConfirmedLocation = {
  id: number | null;
  full_name: string;
};

function safeText(v: any) {
  const s = String(v ?? "").trim();
  return s ? s : "-";
}

function normalize(v: unknown) {
  return String(v ?? "")
    .replace(/\s|\r|\n|\t/g, "")
    .trim();
}

function normalizeLocationState(raw: any): ConfirmedLocation | null {
  const fullName = String(
    raw?.full_name ?? raw?.location_full_name ?? raw?.location_name ?? "",
  ).trim();

  if (!fullName) return null;

  const rawId = raw?.id ?? raw?.location_id ?? null;
  const id =
    rawId == null || rawId === "" || Number.isNaN(Number(rawId))
      ? null
      : Number(rawId);

  return { id, full_name: fullName };
}

function lotForDisplay(v: any): string {
  const s = String(v ?? "").trim();
  return s ? s : "-";
}

function expForDisplay(it: AnyItem): string {
  const raw =
    it?.expire_date ?? it?.exp_date ?? it?.expiration ?? it?.exp ?? null;

  if (raw == null || String(raw).trim() === "") return "-";

  const s = String(raw).trim();

  if (/^\d{6}$/.test(s)) {
    const yy = 2000 + Number(s.slice(0, 2));
    const mm = Number(s.slice(2, 4)) - 1;
    const dd = Number(s.slice(4, 6));
    const d = new Date(yy, mm, dd);

    if (Number.isNaN(d.getTime())) return "-";

    return d.toLocaleDateString("th-TH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  return formatDateTime(raw);
}

function normLocDest(v: any) {
  return String(v ?? "")
    .trim()
    .toLowerCase();
}

function impactSignByLocDest(locDest: any): "" | "+" | "-" {
  const s = normLocDest(locDest);
  if (s === "mdt") return "+";
  if (s === "inventory adjustment") return "-";
  return "";
}

function formatImpactQty(locDest: any, qty: any) {
  const sign = impactSignByLocDest(locDest);
  const n = Number(qty);
  const v = Number.isFinite(n) ? Math.floor(n) : 0;
  return `${sign}${Math.abs(v)}`;
}

const detectSrc = (adj: any): "outbound" | "adjust" => {
  if (adj?.is_system_generated === true) return "outbound";
  if (adj?.is_system_generated === false) return "adjust";

  const source = String(adj?.source ?? "").toLowerCase();
  if (source === "outbound" || source === "adjust") return source;

  if (Object.prototype.hasOwnProperty.call(adj ?? {}, "out_type")) {
    return "outbound";
  }

  return "adjust";
};

function getUserRef() {
  const first = (localStorage.getItem("first_name") || "").trim();
  const last = (localStorage.getItem("last_name") || "").trim();
  const username = (localStorage.getItem("username") || "").trim();

  return `${first} ${last}`.trim() || username || "system";
}

const AdjustManual: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams();
  const [sp] = useSearchParams();
  const location = useLocation();

  const navState = (location.state as any) || {};
  const navGroup = navState.navGroup;
  const navLevel = navState.level as "manual" | "auto" | undefined;
  const navStatus = navState.status as "pending" | "completed" | undefined;

  const stateDetailList = Array.isArray(navState.detailList)
    ? navState.detailList
    : [];
  const stateDetailTotal = Number(navState.detailTotal ?? 0);

  const id = Number(params.id);
  const src = (sp.get("src") || "adjust").toLowerCase();

  const locationInputRef = useRef<HTMLInputElement>(null);
  const itemInputRef = useRef<HTMLInputElement>(null);

  const [detailList, setDetailList] = useState<
    Array<{ id: number; src: string }>
  >([]);

  const [loading, setLoading] = useState(false);
  const [doc, setDoc] = useState<AdjustmentType | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  const [scanLocation, setScanLocation] = useState("");
  const [confirmedLocation, setConfirmedLocation] =
    useState<ConfirmedLocation | null>(null);

  const [isLocationScanActive, setIsLocationScanActive] = useState(false);
  const [itemBarcodeInput, setItemBarcodeInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const applyAdjustmentPayload = useCallback((payload: any) => {
    const data = payload?.data ?? payload;
    if (!data) return;

    setDoc(data);

    const nextItems = Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.lines)
        ? data.lines
        : [];

    setItems(nextItems);
  }, []);

  const loadDetail = useCallback(async () => {
    if (!id || Number.isNaN(id)) {
      setErrorMsg("Invalid id");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      let res: any;

      if (src === "outbound") {
        try {
          res = await adjustmentApi.getDetailOutboundById(id);
        } catch (err: any) {
          if (err?.response?.status === 404) {
            res = await adjustmentApi.getDetailById(id);
          } else {
            throw err;
          }
        }
      } else {
        res = await adjustmentApi.getDetailById(id);
      }

      const raw: any = res?.data;
      const data: AdjustmentType | null = raw?.data ?? raw ?? null;

      setDoc(data);

      const nextItems = Array.isArray((data as any)?.items)
        ? (data as any).items
        : Array.isArray((data as any)?.lines)
          ? (data as any).lines
          : [];

      setItems(nextItems);
    } catch (e: any) {
      setDoc(null);
      setItems([]);
      setErrorMsg(e?.response?.data?.message || e?.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, [id, src]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    const no = String((doc as any)?.no ?? "").trim();
    const adjId = Number((doc as any)?.id ?? 0);

    if (!no) return;

    socket.emit("join_room", `adjustment:${no}`);
    if (adjId > 0) socket.emit("join_room", `adjustment-id:${adjId}`);

    const onScanLocation = (payload: any) => {
      applyAdjustmentPayload(payload);

      const loc = normalizeLocationState(payload?.location);
      if (loc?.full_name) {
        setConfirmedLocation(loc);
        setScanLocation(loc.full_name);
        setIsLocationScanActive(false);
        setTimeout(() => itemInputRef.current?.focus(), 100);
      }
    };

    const onScanBarcode = (payload: any) => {
      applyAdjustmentPayload(payload);
      setItemBarcodeInput("");
      setTimeout(() => itemInputRef.current?.focus(), 80);
    };

    const onConfirm = (payload: any) => {
      applyAdjustmentPayload(payload);
    };

    socket.on("adjustment:scan_location", onScanLocation);
    socket.on("adjustment:scan_barcode", onScanBarcode);
    socket.on("adjustment:confirm", onConfirm);

    return () => {
      socket.off("adjustment:scan_location", onScanLocation);
      socket.off("adjustment:scan_barcode", onScanBarcode);
      socket.off("adjustment:confirm", onConfirm);

      socket.emit("leave_room", `adjustment:${no}`);
      if (adjId > 0) socket.emit("leave_room", `adjustment-id:${adjId}`);
    };
  }, [(doc as any)?.no, (doc as any)?.id, applyAdjustmentPayload]);

  useEffect(() => {
    const rows = stateDetailList
      .map((x: any) => ({
        id: Number(x.id),
        src: String(x.src ?? "adjust"),
      }))
      .filter((x: any) => x.id > 0);

    if (rows.length > 0 && rows.length >= stateDetailTotal) {
      setDetailList(rows);
      return;
    }

    const fetchAll = async () => {
      try {
        const limit = 100;
        let page = 1;
        let totalPages = 1;
        const allRows: any[] = [];

        do {
          const resp = await adjustmentApi.getAllPaginated({
            page,
            limit,
            level: navLevel,
            status: navStatus,
          } as any);

          const data = Array.isArray(resp?.data?.data) ? resp.data.data : [];
          const meta = resp?.data?.meta ?? {};

          allRows.push(...data);
          totalPages = Number(meta?.totalPages ?? 1);
          page += 1;
        } while (page <= totalPages);

        setDetailList(
          allRows
            .map((x: any) => ({
              id: Number(x.id),
              src: detectSrc(x),
            }))
            .filter((x: any) => x.id > 0),
        );
      } catch (err) {
        console.error("fetch adjustment nav list error:", err);
        setDetailList(rows);
      }
    };

    fetchAll();
  }, [navGroup, navLevel, navStatus, stateDetailTotal]);

  useEffect(() => {
    if (isLocationScanActive && locationInputRef.current) {
      locationInputRef.current.focus();
    }
  }, [isLocationScanActive]);

  const toggleLocationFocus = useCallback(() => {
    setIsLocationScanActive((prev) => {
      if (!prev) {
        setScanLocation("");
        setConfirmedLocation(null);
        setItemBarcodeInput("");

        setTimeout(() => locationInputRef.current?.focus(), 0);
        return true;
      }

      return false;
    });
  }, []);

  const handleScanLocationKeyDown = async (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key !== "Enter" && e.key !== "Tab") return;
    e.preventDefault();

    const no = String((doc as any)?.no ?? "").trim();
    const fullName = scanLocation.trim();

    if (!no) {
      toast.error("ไม่พบเลขเอกสาร");
      return;
    }

    if (!fullName) return;

    if (confirmedLocation && confirmedLocation.full_name !== fullName) {
      const c = await confirmAlert(
        `ต้องการเปลี่ยน Location จาก "${confirmedLocation.full_name}" เป็น "${fullName}" ใช่ไหม?`,
      );
      if (!c.isConfirmed) {
        setScanLocation(confirmedLocation.full_name);
        return;
      }
    }

    try {
      const resp = await adjustmentApi.scanLocation(no, {
        location_full_name: fullName,
      });

      const payload = resp.data;
      applyAdjustmentPayload(payload);

      const nextLoc =
        normalizeLocationState(payload?.location) ??
        normalizeLocationState({ full_name: fullName });

      if (nextLoc?.full_name) {
        setConfirmedLocation(nextLoc);
        setScanLocation(nextLoc.full_name);
      }

      setIsLocationScanActive(false);

      toast.success(`ยืนยัน Location: ${nextLoc?.full_name ?? fullName}`);
      setTimeout(() => itemInputRef.current?.focus(), 120);
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          "ยืนยัน Location ไม่สำเร็จ",
      );
      setConfirmedLocation(null);
    }
  };

  const handleItemBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const no = String((doc as any)?.no ?? "").trim();
    const raw = normalize(itemBarcodeInput);

    if (!raw) return;

    // ✅ FIX: รองรับ scan จริง (case-insensitive + trim แล้ว)
    if (raw.toLowerCase().includes("changelocation")) {
      // reset state ทั้งหมด
      setItemBarcodeInput("");
      setScanLocation("");
      setConfirmedLocation(null);

      // เปิด mode scan location
      setIsLocationScanActive(true);

      // focus ไป location input
      setTimeout(() => {
        locationInputRef.current?.focus();
        locationInputRef.current?.select?.();
      }, 0);

      toast.info("เปลี่ยน Location → กรุณา Scan Location ใหม่");
      return;
    }

    if (!no) {
      toast.error("ไม่พบเลขเอกสาร");
      setItemBarcodeInput("");
      return;
    }

    if (!confirmedLocation) {
      toast.warning("กรุณา Scan Location ก่อน");
      setItemBarcodeInput("");
      setTimeout(() => locationInputRef.current?.focus(), 120);
      return;
    }

    try {
      const resp = await adjustmentApi.scanBarcode(no, {
        barcode: raw,
        location_full_name: confirmedLocation.full_name,
        user_ref: getUserRef(),
      });

      const payload = resp.data;
      applyAdjustmentPayload(payload);

      const matched =
        payload?.matchedLine ?? payload?.data?.matchedLine ?? null;

      const code = matched?.code ?? "-";
      const name = matched?.name ?? "-";
      const qtyPick = Number(matched?.qty_pick ?? 0);
      const maxQty = Number(matched?.qty ?? 0);

      toast.success(
        `สแกนสินค้า ${code} ${name} จำนวน ${qtyPick}/${maxQty} สำเร็จ`,
      );

      setItemBarcodeInput("");
      setTimeout(() => itemInputRef.current?.focus(), 100);
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || err?.message || "สแกนสินค้าไม่สำเร็จ",
      );
      setItemBarcodeInput("");
      setTimeout(() => itemInputRef.current?.focus(), 100);
    }
  };

  const onConfirm = useCallback(async () => {
    const no = String((doc as any)?.no ?? "").trim();

    if (!no) {
      toast.error("ไม่พบเอกสาร");
      return;
    }

    const hasAnyPick = items.some((it) => Number(it?.qty_pick ?? 0) > 0);

    if (!hasAnyPick) {
      toast.warning("กรุณาสแกนสินค้าอย่างน้อย 1 รายการก่อนยืนยัน");
      return;
    }

    const result = await confirmAlert("ยืนยัน Adjustment ?");
    if (!result?.isConfirmed) return;

    try {
      setIsSubmitting(true);
      setLoading(true);

      const resp = await adjustmentApi.confirm(no, {
        user_ref: getUserRef(),
      });

      applyAdjustmentPayload(resp.data);

      toast.success("ยืนยันสำเร็จ ✅");
      navigate("/adjustment");
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || "Confirm failed");
    } finally {
      setLoading(false);
      setIsSubmitting(false);
    }
  }, [doc, items, navigate, applyAdjustmentPayload]);

  const onCancel = () => navigate("/adjustment");

  const header = useMemo(() => {
    const a: any = doc;
    if (!a) return null;

    return {
      no: a?.no,
      department: a?.department,
      description: a?.description ?? a?.reason ?? a?.out_type ?? a?.type ?? "-",
      user: a?.user ?? a?.ref_login ?? "-",
      refDoc: a?.origin ?? a?.reference ?? "-",
      date: a?.date ?? a?.created_at,
    };
  }, [doc]);

  const currentIndex =
    detailList.findIndex((x) => Number(x.id) === Number(id)) + 1;

  const total = detailList.length;
  const hasNavigator = detailList.length > 0 && currentIndex > 0;

  const handlePrev = () => {
    const idx = detailList.findIndex((x) => Number(x.id) === Number(id));
    if (idx <= 0) return;

    const prev = detailList[idx - 1];

    navigate(`/adjustment/${prev.id}/manual?src=${prev.src}`, {
      state: {
        navGroup,
        level: navLevel,
        status: navStatus,
        detailList,
        detailTotal: total,
      },
    });
  };

  const handleNext = () => {
    const idx = detailList.findIndex((x) => Number(x.id) === Number(id));
    if (idx < 0 || idx >= detailList.length - 1) return;

    const next = detailList[idx + 1];

    navigate(`/adjustment/${next.id}/manual?src=${next.src}`, {
      state: {
        navGroup,
        level: navLevel,
        status: navStatus,
        detailList,
        detailTotal: total,
      },
    });
  };

  return (
    <div className="adj-mn-page">
      <div className="adj-mn-card">
        <div className="adj-mn-header">
          <div className="adj-mn-title">
            <div>
              <span>Adjust No:</span>
              <span className="adj-mn-title-no">{safeText(header?.no)}</span>
            </div>

            {hasNavigator && (
              <DetailNavigator
                currentIndex={currentIndex}
                total={total}
                onPrev={handlePrev}
                onNext={handleNext}
                disablePrev={currentIndex <= 1}
                disableNext={currentIndex >= total}
              />
            )}
          </div>

          <div className="adj-mn-meta-row">
            <div className="adj-mn-meta-col">
              <div className="adj-mn-meta-line">
                <span className="adj-mn-meta-label">Department :</span>
                <span className="adj-mn-meta-value">
                  {safeText(header?.department)}
                </span>
              </div>

              <div className="adj-mn-meta-line">
                <span className="adj-mn-meta-label">Description :</span>
                <span className="adj-mn-meta-value">
                  {safeText(header?.description)}
                </span>
              </div>
            </div>

            <div className="adj-mn-meta-col adj-mn-meta-col-right">
              <div className="adj-mn-meta-line">
                <span className="adj-mn-meta-label">Ref Doc:</span>
                <span className="adj-mn-meta-value">
                  {safeText(header?.refDoc)}
                </span>
              </div>

              <div className="adj-mn-meta-line">
                <span className="adj-mn-meta-label">เวลารับเข้าเอกสาร :</span>
                <span className="adj-mn-meta-value">
                  {formatDateTime(header?.date)}
                </span>
              </div>
            </div>

            <div className="adj-mn-scan-panel">
              <div className="adj-mn-scan-row">
                <label>Scan Location :</label>

                <input
                  ref={locationInputRef}
                  className="adj-mn-scan-input"
                  value={scanLocation}
                  onChange={(e) => setScanLocation(e.target.value)}
                  onKeyDown={handleScanLocationKeyDown}
                  placeholder="Scan Location"
                  disabled={!isLocationScanActive}
                  style={{
                    borderColor: confirmedLocation ? "#4CAF50" : undefined,
                    opacity: isLocationScanActive ? 1 : 0.6,
                  }}
                />

                <button
                  type="button"
                  className={`adj-mn-btn-toggle ${
                    isLocationScanActive ? "active" : ""
                  }`}
                  onClick={toggleLocationFocus}
                  title={
                    isLocationScanActive
                      ? "รีเซ็ต Location"
                      : "เปิดสแกน Location"
                  }
                >
                  {isLocationScanActive ? (
                    <i className="fa-solid fa-xmark"></i>
                  ) : (
                    <i className="fa-solid fa-qrcode"></i>
                  )}
                </button>
              </div>

              <form
                onSubmit={handleItemBarcodeSubmit}
                className="adj-mn-scan-row"
              >
                <label>Scan Barcode/Serial :</label>

                <input
                  ref={itemInputRef}
                  className="adj-mn-scan-input"
                  value={itemBarcodeInput}
                  onChange={(e) => setItemBarcodeInput(e.target.value)}
                  placeholder="สแกน Barcode/Serial"
                  disabled={!confirmedLocation}
                />

                <div className="adj-mn-scan-spacer" />
              </form>

              <div
                className={`scan-hint ${confirmedLocation ? "ok" : ""}`}
                style={{ marginTop: 6 }}
              >
                {confirmedLocation
                  ? `✅ ADJUST MODE : ${confirmedLocation.full_name}`
                  : ""}
              </div>
            </div>
          </div>
        </div>

        <div className="adj-mn-divider" />

        <div className="adj-mn-table-wrap">
          <table className="adj-mn-table">
            <thead>
              <tr>
                <th className="adj-mn-col-no">No</th>
                <th className="adj-mn-col-code">Code</th>
                <th className="adj-mn-col-name">ชื่อ</th>
                <th className="adj-mn-col-impact">Impact</th>
                <th className="adj-mn-col-qty">QTY</th>
                <th className="adj-mn-col-unit">หน่วย</th>
                <th className="adj-mn-col-locdest">Location_dest</th>
                <th className="adj-mn-col-lot">Lot. Serial</th>
                <th className="adj-mn-col-exp">Expire Date</th>
              </tr>
            </thead>

            <tbody>
              {errorMsg ? (
                <tr>
                  <td colSpan={9} className="adj-mn-empty">
                    {errorMsg}
                  </td>
                </tr>
              ) : loading ? (
                <tr>
                  <td colSpan={9} className="adj-mn-empty">
                    Loading...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="adj-mn-empty">
                    No items found.
                  </td>
                </tr>
              ) : (
                items.map((it: AnyItem, idx: number) => {
                  const locDest =
                    (doc as any)?.location_dest ?? it?.location_dest;
                  const impactText = formatImpactQty(locDest, it?.qty);

                  const qty = Number(it?.qty ?? 0);
                  const pick = Number(it?.qty_pick ?? 0);

                  const rowClass =
                    qty > 0 && pick >= qty
                      ? "adj-mn-row-ok"
                      : pick > 0
                        ? "adj-mn-row-progress"
                        : "";

                  return (
                    <tr
                      key={it?.id ? String(it.id) : `row-${idx}`}
                      className={rowClass}
                    >
                      <td className="adj-mn-center">{idx + 1}</td>
                      <td>{safeText(it?.code)}</td>
                      <td>{safeText(it?.name)}</td>
                      <td className="adj-mn-center">{impactText}</td>
                      <td className="adj-mn-center">
                        {safeText(it?.qty_pick)}
                      </td>
                      <td className="adj-mn-center">{safeText(it?.unit)}</td>
                      <td>
                        {safeText(
                          (doc as any)?.location_dest ?? it?.location_dest,
                        )}
                      </td>
                      <td>{lotForDisplay(it?.lot_serial)}</td>
                      <td className="adj-mn-center">{expForDisplay(it)}</td>
                    </tr>
                  );
                })
              )}

              {!loading && !errorMsg && items.length > 0 && (
                <tr>
                  <td colSpan={9} className="adj-mn-action-row">
                    <div className="adj-mn-footer">
                      <button
                        type="button"
                        className="adj-mn-btn adj-mn-btn-cancel"
                        onClick={onCancel}
                        disabled={loading || isSubmitting}
                      >
                        ย้อนกลับ
                      </button>

                      <button
                        type="button"
                        className="adj-mn-btn adj-mn-btn-confirm"
                        onClick={onConfirm}
                        disabled={loading || isSubmitting}
                      >
                        ยืนยัน
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(loading || isSubmitting) && (
        <div className="adj-mn-loading-overlay">
          <Loading />
        </div>
      )}
    </div>
  );
};

export default AdjustManual;
