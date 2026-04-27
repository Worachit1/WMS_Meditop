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
import {
  adjustmentApi,
  type ConfirmAdjustmentCompleteBody,
} from "../../services/adjustment.api";
import Loading from "../../../../components/Loading/Loading";

import { confirmAlert } from "../../../../utils/alert";

import { formatDateTime } from "../../../../components/Datetime/FormatDateTime";

import "./adjustmanual.css";

type AnyItem = any;

function safeText(v: any) {
  const s = String(v ?? "").trim();
  return s ? s : "-";
}

const normalize = (v: unknown) =>
  (v ?? "")
    .toString()
    .replace(/\s|\r|\n|\t/g, "")
    .trim();

const digitsOnly = (v: unknown) => normalize(v).replace(/\D/g, "");
const tokenOnly = (v: unknown) =>
  (v ?? "")
    .toString()
    .toUpperCase()
    .replace(/\s|\r|\n|\t/g, "")
    .trim();

const LOT_NULL_TOKEN = "XXXXXX";
const EXP_NULL_TOKEN = "999999";

// ✅ lot rule: null/empty => XXXXXX, มีค่า => tokenOnly
const getItemLotRule = (it: AnyItem) => {
  const v = it?.lot_serial ?? it?.lot ?? it?.serial;
  const s = v == null ? LOT_NULL_TOKEN : tokenOnly(v);
  return s || LOT_NULL_TOKEN;
};

// ✅ exp rule: null/empty => 999999, มีค่า => YYMMDD (6 digits)
const expToYYMMDDStrict = (d: unknown) => {
  if (!d) return "";
  const dt = new Date(String(d));
  if (Number.isNaN(dt.getTime())) return "";
  const yy = String(dt.getFullYear()).slice(-2);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
};

const getItemExpRule = (it: AnyItem) => {
  const v =
    it?.expire_date ?? it?.exp_date ?? it?.expiration ?? it?.exp ?? it?.expire;
  if (v == null || String(v).trim() === "") return EXP_NULL_TOKEN;

  const s = String(v).trim();
  if (/^\d{6}$/.test(s)) return s;

  const yymmdd = expToYYMMDDStrict(v);
  return yymmdd || EXP_NULL_TOKEN;
};

// ✅ barcode หลัก: ใช้ barcode_text ก่อน แล้วค่อย fallback (digits)
const getItemBarcodeDigits = (it: AnyItem) =>
  digitsOnly(
    it?.barcode_text ?? it?.barcode ?? it?.barcode_code ?? it?.code ?? "",
  );

type ScanPickResult =
  | { ok: true; item: AnyItem; reason: "OK_STRICT" }
  | {
      ok: false;
      reason: "EMPTY" | "NO_MATCH" | "LOT_EXP_MISMATCH" | "AMBIGUOUS";
      candidates?: Array<{
        code: string;
        barcode_digits: string;
        lot_rule: string;
        exp_rule: string;
      }>;
    };

function pickAdjustItemByScan(
  items: AnyItem[],
  scanRaw: string,
): ScanPickResult {
  const scanDigits = digitsOnly(scanRaw);
  const scanToken = tokenOnly(scanRaw);

  if (!scanDigits && !scanToken) return { ok: false, reason: "EMPTY" };

  // 1) candidate by barcode digits
  const candidates = items.filter((it) => {
    const b = getItemBarcodeDigits(it);
    return b && scanDigits.includes(b);
  });

  if (candidates.length === 0) return { ok: false, reason: "NO_MATCH" };

  // 2) STRICT: lot_rule อยู่ใน scanToken + exp_rule อยู่ใน scanDigits
  const strictMatched = candidates.filter((it) => {
    const lotRule = getItemLotRule(it); // token
    const expRule = getItemExpRule(it); // 6 digits

    const lotOk = scanToken.includes(lotRule);

    // ถ้า exp เป็น null => ไม่ต้องบังคับ exp match (เหมือน GroupOrder)
    const itemExpRaw =
      it?.expire_date ??
      it?.exp_date ??
      it?.expiration ??
      it?.exp ??
      it?.expire;
    const expOk = itemExpRaw == null ? true : scanDigits.includes(expRule);

    return lotOk && expOk;
  });

  if (strictMatched.length === 1) {
    return { ok: true, item: strictMatched[0], reason: "OK_STRICT" };
  }

  const info = candidates.map((x) => ({
    code: String(x?.code ?? ""),
    barcode_digits: getItemBarcodeDigits(x),
    lot_rule: getItemLotRule(x),
    exp_rule: getItemExpRule(x),
  }));

  return {
    ok: false,
    reason: strictMatched.length === 0 ? "LOT_EXP_MISMATCH" : "AMBIGUOUS",
    candidates: info,
  };
}
/** =========================
 * Scan-only normalizers
 * - exp null => "999999" (ใช้แค่ตอน match scan)
 * - lot null => "XXXXXX" (ใช้แค่ตอน match scan)
 * ========================= */

function expToYYMMDDForScan(exp: any): string {
  if (exp == null || String(exp).trim() === "") return "999999";

  const raw = String(exp).trim();
  if (/^\d{6}$/.test(raw)) return raw;

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "999999";

  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

function lotForScan(v: any): string {
  const s = String(v ?? "").trim();
  return s ? s : "XXXXXX";
}

function normBarcodeText(v: any): string {
  return String(v ?? "").trim();
}

function pickItems(adj: any): AnyItem[] {
  const v = adj?.items ?? adj?.lines ?? adj?.details ?? [];
  return Array.isArray(v) ? v : [];
}

type ScanKey = {
  barcode_text: string;
  lot_serial: string; // สำหรับ scan เท่านั้น (null => XXXXXX)
  exp: string; // สำหรับ scan เท่านั้น (null => 999999)
};

function buildScanKeyFromItem(it: AnyItem): ScanKey {
  return {
    barcode_text: normBarcodeText(
      it?.barcode_text ?? it?.barcode ?? it?.barcode_code,
    ),
    lot_serial: lotForScan(it?.lot_serial ?? it?.lot ?? it?.serial),
    exp: expToYYMMDDForScan(
      it?.expire_date ?? it?.exp_date ?? it?.expiration ?? it?.exp,
    ),
  };
}

function lotForDisplay(v: any): string {
  const s = String(v ?? "").trim();
  return s ? s : "-";
}

function expForDisplay(it: AnyItem): string {
  const raw =
    it?.expire_date ?? it?.exp_date ?? it?.expiration ?? it?.exp ?? null;
  if (raw == null || String(raw).trim() === "") return "-";

  // ถ้าเป็น 6 หลัก (YYMMDD) ให้แปลงเป็นวันที่ไทยแบบไม่มีเวลา
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

  // ISO/Date string -> เวลาไทย
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

  const [detailList, setDetailList] = useState<
    Array<{ id: number; src: string }>
  >([]);

  const id = Number(params.id);
  const src = (sp.get("src") || "adjust").toLowerCase(); // adjust | outbound

  const scanRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [doc, setDoc] = useState<AdjustmentType | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const [scanText, setScanText] = useState("");

  const [activeKey, setActiveKey] = useState<string>("");
  const [qtyPickDraftByKey, setQtyPickDraftByKey] = useState<
    Record<string, number>
  >({});

  const [scannedKeys, setScannedKeys] = useState<Record<string, true>>({});

  const items = useMemo(() => pickItems(doc), [doc]);

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
    } catch (e: any) {
      setDoc(null);
      setErrorMsg(e?.response?.data?.message || e?.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, [id, src]);

  useEffect(() => {
    loadDetail();
    const t = setTimeout(() => scanRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, [loadDetail]);

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

  const onScanSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const raw = normalize(scanText);
      if (!raw) return;

      if (!doc) {
        toast.error("ไม่พบเอกสาร");
        return;
      }

      const picked = pickAdjustItemByScan(items, raw);

      if (!picked.ok) {
        if (picked.reason === "NO_MATCH") {
          toast.error("ไม่พบ Barcode ตรงกับสินค้าในเอกสาร");
        } else if (picked.reason === "LOT_EXP_MISMATCH") {
          toast.error("Lot/Exp ไม่ตรงกับรายการในเอกสาร");
          console.log("scanToken=", tokenOnly(raw));
          console.log("scanDigits=", digitsOnly(raw));
          console.log("candidates=", picked.candidates);
        } else if (picked.reason === "AMBIGUOUS") {
          toast.error("ยังแยกรายการไม่ได้ (Lot/Exp อาจไม่พอหรือข้อมูลซ้ำ)");
          console.log("scanToken=", tokenOnly(raw));
          console.log("scanDigits=", digitsOnly(raw));
          console.log("candidates=", picked.candidates);
        }
        setScanText("");
        scanRef.current?.focus();
        return;
      }

      const found = picked.item;

      // ✅ ทำ key สำหรับ row (ใช้ rule เหมือนกัน จะไม่ขึ้นกับ length)
      const barcodeDigits = getItemBarcodeDigits(found);
      const lotRule = getItemLotRule(found);
      const expRule = getItemExpRule(found);
      const mapKey = `${barcodeDigits}|${lotRule}|${expRule}`;

      setScannedKeys((prev) => ({ ...prev, [mapKey]: true }));
      toast.success("Scan ผ่าน ✅");
      setActiveKey(mapKey);

      setQtyPickDraftByKey((prev) => {
        if (prev[mapKey] != null) return prev;
        const cur = Number(found?.qty_pick ?? 0);
        return { ...prev, [mapKey]: Number.isFinite(cur) ? cur : 0 };
      });

      setTimeout(() => {
        const el = document.getElementById(
          `qty-pick-${mapKey}`,
        ) as HTMLInputElement | null;
        el?.focus();
        el?.select?.();
      }, 50);

      setScanText("");
      scanRef.current?.focus();
    },
    [doc, items, scanText],
  );

  // const onSaveDraft = () => toast.info("Save Draft (coming soon)");

  const onConfirm = useCallback(async () => {
    if (loading) return;
    if (!doc) {
      toast.error("ไม่พบเอกสาร");
      return;
    }

    const no = String((doc as any)?.no ?? "").trim();
    if (!no) {
      toast.error("ไม่พบเลขเอกสาร (no)");
      return;
    }

    // ============================
    // build items ตาม ConfirmAdjustmentCompleteBody
    // ============================
    const transferItems = items
      .map((it: AnyItem, index: number) => {
        const sk = buildScanKeyFromItem(it);
        const mapKey = `${sk.barcode_text}|${sk.lot_serial}|${sk.exp}`;

        const qtyPick =
          qtyPickDraftByKey[mapKey] != null
            ? Number(qtyPickDraftByKey[mapKey])
            : Number(it?.qty_pick ?? 0);

        const qty_pick = Math.max(0, Math.floor(qtyPick));
        if (qty_pick <= 0) return null;

        // expire_date => YYYY-MM-DD
        const rawExp =
          it?.expire_date ?? it?.exp_date ?? it?.expiration ?? it?.exp ?? null;

        let expire_date: string | null = null;
        if (rawExp) {
          const d = new Date(String(rawExp));
          if (!Number.isNaN(d.getTime())) {
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            expire_date = `${yyyy}-${mm}-${dd}`;
          }
        }

        // barcodes
        const barcodes = (() => {
          const br = it?.barcode_ref;
          if (br?.barcode_id || br?.barcode) {
            return [
              {
                barcode_id:
                  br?.barcode_id != null ? Number(br.barcode_id) : null,
                barcode: br?.barcode != null ? String(br.barcode).trim() : null,
              },
            ].filter((b) => b.barcode_id || b.barcode);
          }

          if (Array.isArray(it?.barcodes) && it.barcodes.length) {
            return it.barcodes
              .map((b: any) => ({
                barcode_id: b?.barcode_id != null ? Number(b.barcode_id) : null,
                barcode: b?.barcode != null ? String(b.barcode).trim() : null,
              }))
              .filter((b: any) => b.barcode_id || b.barcode);
          }

          return [];
        })();

        return {
          sequence: it?.sequence ?? index + 1,
          product_id: it?.product_id ?? null,
          code: it?.code ?? null,
          name: String(it?.name ?? ""),
          location_id: it?.location_id ?? null,
          location: it?.location ?? null,
          location_dest_id:
            (doc as any)?.location_dest_id ?? it?.location_dest_id ?? null,
          location_dest:
            (doc as any)?.location_dest ?? it?.location_dest ?? null,
          unit: String(it?.unit ?? ""),
          tracking: it?.tracking ?? null,
          lot_id: it?.lot_id ?? null,
          lot_serial: it?.lot_serial ?? null,
          expire_date,
          qty_pick, // ✅ ตรงกับ type
          barcodes: barcodes.length ? barcodes : [],
        };
      })
      .filter(
        Boolean,
      ) as ConfirmAdjustmentCompleteBody["transfers"][0]["items"];

    if (transferItems.length === 0) {
      toast.error("ยังไม่มีการสแกน/กรอก QTY (qty_pick = 0)");
      return;
    }

    // ============================
    // build payload ตาม ConfirmAdjustmentCompleteBody
    // ============================
    const payload: ConfirmAdjustmentCompleteBody = {
      transfers: [
        {
          no,
          department_id: (doc as any)?.department_id ?? null,
          department: (doc as any)?.department ?? null,
          reference: (doc as any)?.reference ?? null,
          origin: (doc as any)?.origin ?? null,
          items: transferItems,
        },
      ],
    };

    const totalPick = transferItems.reduce((sum, x) => sum + x.qty_pick, 0);

    const result = await confirmAlert(
      `ยืนยันการปรับสินค้าทั้งหมด ${totalPick} ชิ้นหรือไม่?`,
    );

    if (!result || !result.isConfirmed) return;

    try {
      setLoading(true);
      await adjustmentApi.confirmCompleteByNo(no, payload);
      toast.success("ยืนยันสำเร็จ ✅");
      await loadDetail();
      navigate("/adjustment");
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || "Confirm failed");
    } finally {
      setLoading(false);
    }
  }, [loading, doc, items, qtyPickDraftByKey, loadDetail]);

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

              <div className="adj-mn-meta-line">
                <span className="adj-mn-meta-label">User :</span>
                <span className="adj-mn-meta-value">
                  {safeText(header?.user)}
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
                <span className="adj-mn-meta-label">Date/Time :</span>
                <span className="adj-mn-meta-value">
                  {formatDateTime(header?.date)}
                </span>
              </div>
            </div>

            <form className="adj-mn-scan" onSubmit={onScanSubmit}>
              <div className="adj-mn-scan-label">Scan Barcode/Serial</div>
              <input
                ref={scanRef}
                className="adj-mn-scan-input"
                value={scanText}
                onChange={(e) => setScanText(e.target.value)}
                placeholder="สแกน Barcode/Serial"
                disabled={loading}
              />
            </form>
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
                  // ✅ ใช้ key สำหรับ scan เท่านั้น (null => XXXXXX / 999999)
                  const sk = buildScanKeyFromItem(it);
                  const mapKey = `${sk.barcode_text}|${sk.lot_serial}|${sk.exp}`;
                  const isOk = Boolean(scannedKeys[mapKey]);

                  const locDest =
                    (doc as any)?.location_dest ?? it?.location_dest;
                  const impactText = formatImpactQty(locDest, it?.qty);

                  const draft =
                    qtyPickDraftByKey[mapKey] ?? Number(it?.qty_pick ?? 0) ?? 0;
                  const canEdit = activeKey === mapKey;

                  return (
                    <tr
                      key={it?.id ? String(it.id) : `row-${idx}`}
                      className={isOk ? "adj-mn-row-ok" : ""}
                    >
                      <td className="adj-mn-center">{idx + 1}</td>
                      <td>{safeText(it?.code)}</td>
                      <td>{safeText(it?.name)}</td>
                      <td className="adj-mn-center">{impactText}</td>

                      <td className="adj-mn-center">
                        {canEdit ? (
                          <input
                            id={`qty-pick-${mapKey}`}
                            className="adj-mn-qtypick-input"
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={String(draft)}
                            onChange={(e) => {
                              let v = Number(e.target.value);

                              if (Number.isNaN(v)) v = 0;
                              if (v < 0) v = 0;

                              const maxQty = Number(it?.qty ?? 0);

                              if (v > maxQty) {
                                v = maxQty; // ✅ บังคับไม่ให้เกิน
                              }

                              setQtyPickDraftByKey((prev) => ({
                                ...prev,
                                [mapKey]: v,
                              }));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter")
                                (e.target as HTMLInputElement).blur();
                            }}
                            onBlur={() => {
                              setDoc((prev: any) => {
                                if (!prev) return prev;
                                const arr = Array.isArray(prev.items)
                                  ? prev.items
                                  : Array.isArray(prev.lines)
                                    ? prev.lines
                                    : [];
                                const nextArr = arr.map((x: any) => {
                                  const xk = buildScanKeyFromItem(x);
                                  const xKey = `${xk.barcode_text}|${xk.lot_serial}|${xk.exp}`;
                                  return xKey === mapKey
                                    ? { ...x, qty_pick: draft }
                                    : x;
                                });
                                if (Array.isArray(prev.items))
                                  return { ...prev, items: nextArr };
                                if (Array.isArray(prev.lines))
                                  return { ...prev, lines: nextArr };
                                return { ...prev, items: nextArr };
                              });
                            }}
                          />
                        ) : (
                          safeText(it?.qty_pick)
                        )}
                      </td>

                      <td className="adj-mn-center">{safeText(it?.unit)}</td>
                      <td>
                        {safeText(
                          (doc as any)?.location_dest ?? it?.location_dest,
                        )}
                      </td>

                      {/* ✅ lot: null แสดง "-" (ไม่โชว์ XXXXXX) */}
                      <td>{lotForDisplay(it?.lot_serial)}</td>

                      {/* ✅ exp: null แสดง "-" และถ้ามีให้แสดงเวลาไทย */}
                      <td className="adj-mn-center">{expForDisplay(it)}</td>
                    </tr>
                  );
                })
              )}

              {!loading && !errorMsg && items.length > 0 && (
                <tr>
                  <td colSpan={9} className="adj-mn-action-row">
                    <div className="adj-mn-footer">
                      {/* <button
                        type="button"
                        className="adj-mn-btn adj-mn-btn-draft"
                        onClick={onSaveDraft}
                        disabled={loading}
                      >
                        save draft
                      </button> */}

                      <button
                        type="button"
                        className="adj-mn-btn adj-mn-btn-cancel"
                        onClick={onCancel}
                        disabled={loading}
                      >
                        ย้อนกลับ
                      </button>

                      <button
                        type="button"
                        className="adj-mn-btn adj-mn-btn-confirm"
                        onClick={onConfirm}
                        disabled={loading}
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

      {loading && (
        <div className="adj-mn-loading-overlay">
          <Loading />
        </div>
      )}
    </div>
  );
};

export default AdjustManual;
