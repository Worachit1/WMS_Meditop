// tranfers.type.ts (ตามชื่อที่คุณพิมพ์)

export type TransferItemType = {
  id: string;
  sequence: number | null;
  product_id: number | null;
  code: string | null;
  name: string;
  unit: string | null;
  tracking: string | null;
  lot_id: number | null;
  lot: string | null;
  lot_serial: string | null;
  exp: string | null; // ISO
  qty: number | null;
  quantity_receive: number | null;
  quantity_count: number | null;
  quantity_put: number | null;
  barcode_id: number | null;
  lock_no_list: string | null;
};

export type TransferType = {
  id: number;
  picking_id: number | null;
  no: string;

  lot: string | null;
  quantity: number | null;

  location_id: number | null;
  location: string | null;

  location_dest_id: number | null;
  location_dest: string | null;

  department_id: string | null;
  department: string | null;

  reference: string | null;
  origin: string | null;

  date: string; // ISO
  in_type: string;

  created_at: string; // ISO
  updated_at: string | null;

  items: TransferItemType[];
};

export type TransferBarcodeType = {
  barcode: string;
  lot_start?: number | null;
  lot_stop?: number | null;
  exp_start?: number | null;
  exp_stop?: number | null;
  barcode_length?: number | null;
};


export type TransferMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type TransferListResponse = {
  data: TransferType[];
  meta: TransferMeta;
};


// transfer.api.ts
import { http } from "../../../services/http";
import type { TransferListResponse } from "../types/tranfers.type";

export type ConfirmTransferPickBody = {
  user_ref: string;
  locations: {
    location_full_name: string;
    lines: { transfer_item_id: string; status: string }[];
  }[];
};

export type ConfirmTransferPutBody = {
  user_ref: string;
  pin: string;
  locations: {
    location_full_name: string;
    lines: { transfer_item_id: string;  status: string }[];
  }[];
};

export const transferApi = {
  getAll : (params?: any) => http.get("/transfers_movements/getAll", { params }),
  getExpNcrPaginated: (params: {
    page: number;
    limit: number;
    search?: string;
    columns?: string; // comma-separated
  }) => http.get<TransferListResponse>("/transfers_movements/get", { params }),

  getDetailExpNcr: (no: string) =>
    http.get<TransferListResponse>(
      `/transfers_movements/get/${encodeURIComponent(no)}`,
    ),

  scanLocation: (no: string, data: { location_full_name: string }) =>
    http.post(`/transfers_movements/${encodeURIComponent(no)}/scan/location/ncr`, data),

   scanLocationPick: (no: string, data: { location_full_name: string }) =>
    http.post(`/transfers_movements/${encodeURIComponent(no)}/scan/location`, data),


  scanBarcode: (
    no: string,
    data: { barcode: string; location_full_name: string; qty_input?: number },
  ) => http.post(`/transfers_movements/${encodeURIComponent(no)}/scan/barcode`, data),

  // ✅ FIX: ใช้ transfer_item_id ให้ตรง transfer
  confirmToPick: (no: string, data: ConfirmTransferPickBody) =>
    http.post(`/transfers_movements/${encodeURIComponent(no)}/scan/confirm`, data),

   confirmToPut: (no: string, data: ConfirmTransferPutBody) =>
    http.post(`/transfers_movements/${encodeURIComponent(no)}/scan/confirm/put`, data),

   createMovementInvoice: (data: any) =>
  http.post("/transfers_movements/create", data),
};



import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";

import {
  confirmAlert,
  successAlert,
  warningAlert,
} from "../../../../utils/alert";
import { transferApi } from "../../services/transfer.api";
import type { TransferType, TransferItemType } from "../../types/tranfers.type";

import Table from "../../../../components/Table/Table";
import "../../../../components/Button/button.css";
import "../../../../components/Table/table.css";
import "../../../../styles/component.css";
import { formatDateTime } from "../../../../components/Datetime/FormatDateTime";

import Loading from "../../../../components/Loading/Loading";
import "./detailTransfermovement.css";

type ViewMode = "pick" | "put" | "done";
type ConfirmedLocation = { id: number; full_name: string };
type LocKey = string;

// { [location_full_name]: { [transfer_item_id]: true } }
type MarkByLoc = Record<LocKey, Record<string, boolean>>;

// ===== scan normalize =====
const normalize = (v: unknown) =>
  String(v ?? "")
    .replace(/\s|\r|\n|\t/g, "")
    .trim();
const digitsOnly = (v: unknown) => normalize(v).replace(/\D/g, "");
const tokenOnly = (v: unknown) => normalize(v).toUpperCase();

const expToYYMMDD = (d: unknown) => {
  if (!d) return "";
  const dt = new Date(d as any);
  if (Number.isNaN(dt.getTime())) return "";
  const yy = String(dt.getFullYear() % 100).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
};

const getItemBarcodeDigits = (it: any) =>
  digitsOnly(it?.barcode_text ?? it?.barcode?.barcode ?? it?.code ?? "");
const getItemLotSerialToken = (it: any) =>
  tokenOnly(it?.lot_serial ?? it?.lot ?? "");
const getItemExpYYMMDD = (it: any) => expToYYMMDD(it?.exp);

// =========================
// ✅ PICK Location rule (ใช้เฉพาะตอน PICK)
// =========================
const isAllowedAtPickLocation = (it: any, locFullName: string) => {
  const loc = tokenOnly(locFullName);
  const locks = Array.isArray(it?.lock_locations) ? it.lock_locations : [];

  // ถ้า backend ไม่ส่ง lock_locations มา
  if (locks.length === 0) {
    const hinted = String(
      it?.location_full_name ?? it?.location_name ?? "",
    ).trim();
    if (hinted) return tokenOnly(hinted) === loc;

    // ถ้าไม่รู้จริงๆ ให้ผ่านก่อน (อยาก strict เปลี่ยนเป็น false ได้)
    return true;
  }

  return locks.some((x: any) => tokenOnly(x?.location_name ?? "") === loc);
};

// =========================
// ✅ PUT Temp rules (ใช้เฉพาะตอน PUT)
// - item: ดึงจาก lock_no (null => ไม่เช็ค)
// - location: ดึงจากชื่อ location ถ้าไม่มี => NORMAL
// =========================
type TempToken = string | "NORMAL" | null;

const extractTempToken = (s: unknown): TempToken => {
  const raw = String(s ?? "").trim();
  if (!raw) return null;

  // กันเคส "2-\n8C"
  const v = raw.replace(/\s+/g, "");

  // รองรับ: _2-8C, _25C, _-20C, _15-25C
  const m = v.match(/(?:_|-)(-?\d{1,2}(?:-\d{1,2})?C)\b/i);
  if (m?.[1]) return m[1].toUpperCase();

  return "NORMAL";
};

const getItemTempRule = (it: any): TempToken => {
  const lock = it?.lock_no ?? it?.lock_no_list ?? null;
  if (lock === null || lock === undefined || String(lock).trim() === "")
    return null; // ✅ null => ไม่เช็ค
  return extractTempToken(lock);
};

const getLocationTemp = (locFullName: string): TempToken => {
  const t = extractTempToken(locFullName);
  return t ?? "NORMAL";
};

const isTempCompatibleForPut = (it: any, locFullName: string) => {
  const rule = getItemTempRule(it); // null => ไม่เช็ค
  if (rule === null) return true;

  const locTemp = getLocationTemp(locFullName);
  return rule === locTemp;
};

// =========================
// ✅ find item by scan: barcode + lot_serial + exp(YYMMDD)
// =========================
type ScanPickResult =
  | { item: any; reason: "OK_SINGLE" | "OK_LOT_SERIAL" | "OK_EXP" }
  | { item?: undefined; reason: "EMPTY" | "NO_BARCODE_MATCH" | "AMBIGUOUS" };

const findItemByScanSmart = (scanRaw: string, items: any[]): ScanPickResult => {
  const scanDigits = digitsOnly(scanRaw);
  const scanToken = tokenOnly(scanRaw);
  if (!scanDigits && !scanToken) return { reason: "EMPTY" };

  const candidates = items.filter((it) => {
    const b = getItemBarcodeDigits(it);
    return b && scanDigits.includes(b);
  });

  if (candidates.length === 0) return { reason: "NO_BARCODE_MATCH" };
  if (candidates.length === 1)
    return { item: candidates[0], reason: "OK_SINGLE" };

  const lotMatches = candidates.filter((it) => {
    const ls = getItemLotSerialToken(it);
    return ls && scanToken.includes(ls);
  });
  if (lotMatches.length === 1)
    return { item: lotMatches[0], reason: "OK_LOT_SERIAL" };

  const expMatches = candidates.filter((it) => {
    const e6 = getItemExpYYMMDD(it);
    return e6 && scanDigits.includes(e6);
  });
  if (expMatches.length === 1) return { item: expMatches[0], reason: "OK_EXP" };

  return { reason: "AMBIGUOUS" };
};

// ✅ กัน object render ไม่ได้
const asText = (v: any) => {
  if (v === null || v === undefined) return "-";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    return String(v);
  if (typeof v === "object") {
    if (typeof v.short_name === "string" && v.short_name.trim())
      return v.short_name;
    if (typeof v.full_name === "string" && v.full_name.trim())
      return v.full_name;
    if (typeof v.name === "string" && v.name.trim()) return v.name;
  }
  return "-";
};

function getUserLabel(user: any) {
  const fn = String(user?.first_name ?? "").trim();
  const ln = String(user?.last_name ?? "").trim();
  const full = `${fn} ${ln}`.trim();
  return full || "-";
}

export default function DetailTransferMovement() {
  const navigate = useNavigate();
  const params = useParams();

  const [pinOpen, setPinOpen] = useState(false);
  const [pinValue, setPinValue] = useState("");
  const [pinErr, setPinErr] = useState("");

  const no = decodeURIComponent(String(params.no ?? "").trim());

  // refs
  const scanLocationInputRef = useRef<HTMLInputElement>(null);
  const scanBarcodeInputRef = useRef<HTMLInputElement>(null);

  // data
  const [loading, setLoading] = useState(false);
  const [transfer, setTransfer] = useState<TransferType | null>(null);

  // scan states
  const [scanLocation, setScanLocation] = useState("");
  const [confirmedLocation, setConfirmedLocation] =
    useState<ConfirmedLocation | null>(null);
  const [isLocationScanOpen, setIsLocationScanOpen] = useState(false);

  // ui
  const [viewMode, setViewMode] = useState<ViewMode>("pick");
  const [searchFilter, setSearchFilter] = useState("");

  // marks
  const [markByLoc, setMarkByLoc] = useState<MarkByLoc>({});

  // =========================
  // items
  // =========================
  const allItems: TransferItemType[] = useMemo(() => {
    const raw = (transfer as any)?.items;
    return Array.isArray(raw) ? (raw as TransferItemType[]) : [];
  }, [transfer]);

  const pickItems = useMemo(
    () =>
      allItems.filter(
        (x: any) => String(x?.status ?? "").toLowerCase() === "pick",
      ),
    [allItems],
  );
  const putItems = useMemo(
    () =>
      allItems.filter(
        (x: any) => String(x?.status ?? "").toLowerCase() === "put",
      ),
    [allItems],
  );
  const doneItems = useMemo(
    () =>
      allItems.filter(
        (x: any) => String(x?.status ?? "").toLowerCase() === "completed",
      ),
    [allItems],
  );

  const pickCount = pickItems.length;
  const putCount = putItems.length;
  const doneCount = doneItems.length;

  useEffect(() => {
    if (viewMode === "pick" && pickCount === 0) {
      if (putCount > 0) setViewMode("put");
      else if (doneCount > 0) setViewMode("done");
    }
    if (viewMode === "put" && putCount === 0 && doneCount > 0) {
      setViewMode("done");
    }
  }, [viewMode, pickCount, putCount, doneCount]);

  const viewItems = useMemo(() => {
    if (viewMode === "pick") return pickItems;
    if (viewMode === "put") return putItems;
    return doneItems;
  }, [viewMode, pickItems, putItems, doneItems]);

  // =========================
  // search filter
  // =========================
  const filteredItems = useMemo(() => {
    const s = searchFilter.trim().toLowerCase();
    if (!s) return viewItems;

    return viewItems.filter((it: any) => {
      const code = String(it?.code ?? it?.barcode_text ?? "").toLowerCase();
      const name = String(it?.name ?? "").toLowerCase();
      const lot = String(it?.lot_serial ?? it?.lot ?? "").toLowerCase();
      const lock = String(it?.lock_no ?? it?.lock_no_list ?? "").toLowerCase();
      return (
        code.includes(s) ||
        name.includes(s) ||
        lot.includes(s) ||
        lock.includes(s)
      );
    });
  }, [viewItems, searchFilter]);

  const locKey = (confirmedLocation?.full_name || "").trim();
  const sortedItems = useMemo(() => {
    if (!locKey) return filteredItems;
    const marks = markByLoc[locKey] || {};
    return [...filteredItems].sort((a: any, b: any) => {
      const aOk = marks[String(a?.id)] === true ? 1 : 0;
      const bOk = marks[String(b?.id)] === true ? 1 : 0;
      return aOk - bOk;
    });
  }, [filteredItems, locKey, markByLoc]);

  // ✅ PUT ต้องสแกน “ครบทุก item ในแท็บ put” (เพราะปลายทางเดียวกัน)
  const isAllMarkedAtCurrentLoc = useMemo(() => {
    const loc = (confirmedLocation?.full_name || "").trim();
    if (!loc) return false;
    if (viewMode !== "put") return false;

    const marks = markByLoc[loc] || {};
    if (putItems.length === 0) return false;

    return putItems.every((it: any) => marks[String(it?.id)] === true);
  }, [confirmedLocation, viewMode, markByLoc, putItems]);

  // =========================
  // api shape guard
  // =========================
  const pickTransferFromAnyShape = (respData: any) => {
    if (Array.isArray(respData?.data)) return respData.data[0] ?? null;
    if (Array.isArray(respData?.data?.data))
      return respData.data.data[0] ?? null;
    if (respData?.data && typeof respData.data === "object")
      return respData.data;
    if (
      respData &&
      typeof respData === "object" &&
      (respData.no || respData.id)
    )
      return respData;
    return null;
  };

  // =========================
  // fetch detail
  // =========================
  const fetchDetail = useCallback(async () => {
    if (!no) return;
    setLoading(true);
    try {
      const resp = await transferApi.getDetailExpNcr(no);
      const row = pickTransferFromAnyShape(resp.data);
      setTransfer(row);

      setScanLocation("");
      setConfirmedLocation(null);
      setIsLocationScanOpen(false);
      if (scanBarcodeInputRef.current) scanBarcodeInputRef.current.value = "";
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || "Fetch transfer detail ไม่สำเร็จ",
      );
      setTransfer(null);
    } finally {
      setLoading(false);
    }
  }, [no]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // =========================
  // scan toggle
  // =========================
  const toggleLocationScan = useCallback(() => {
    setIsLocationScanOpen((open) => {
      const next = !open;

      if (next) {
        setScanLocation("");
        setConfirmedLocation(null);
        if (scanBarcodeInputRef.current) scanBarcodeInputRef.current.value = "";
        setTimeout(() => scanLocationInputRef.current?.focus(), 0);
        return true;
      }

      setTimeout(() => {
        if (confirmedLocation) scanBarcodeInputRef.current?.focus();
        else scanLocationInputRef.current?.focus();
      }, 0);

      return false;
    });
  }, [confirmedLocation]);

  // =========================
  // Scan Location
  // =========================
  const handleScanLocationKeyDown = async (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key !== "Enter" && e.key !== "Tab") return;
    e.preventDefault();

    if (!no) return;
    const fullName = scanLocation.trim();
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
      setLoading(true);

      const resp = await transferApi.scanLocationPick(no, {
        location_full_name: fullName,
      });

      const payload = resp.data as any;

      const locName =
        payload?.location?.location_name ??
        payload?.location_name ??
        payload?.location_full_name ??
        fullName;

      const locId =
        Number(payload?.location?.location_id ?? payload?.location_id ?? 0) ||
        0;

      setConfirmedLocation({ id: locId, full_name: String(locName) });
      setScanLocation(String(locName));
      setIsLocationScanOpen(false);

      toast.success(`Location OK: ${locName}`);
      setTimeout(() => scanBarcodeInputRef.current?.focus(), 80);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Scan Location ไม่สำเร็จ");
      setConfirmedLocation(null);
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // ✅ Scan Barcode/Serial
  // =========================
  const handleScanBarcodeKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    const isSubmitKey =
      e.key === "Enter" || e.key === "Tab" || e.code === "NumpadEnter";
    if (!isSubmitKey) return;

    e.preventDefault();

    if (!confirmedLocation?.full_name) {
      warningAlert("กรุณา Scan Location ก่อน");
      return;
    }

    setTimeout(() => {
      const raw = scanBarcodeInputRef.current?.value ?? "";
      const scannedRaw = normalize(raw);
      if (!scannedRaw) return;

      if (viewMode === "done") {
        toast.info("รายการเสร็จสิ้นแล้ว");
        if (scanBarcodeInputRef.current) {
          scanBarcodeInputRef.current.value = "";
          scanBarcodeInputRef.current.blur();
        }
        return;
      }

      const base = viewMode === "put" ? putItems : pickItems;

      const picked = findItemByScanSmart(scannedRaw, base as any[]);
      if (!picked.item) {
        if (picked.reason === "AMBIGUOUS")
          toast.error("barcode ซ้ำหลายรายการ แต่ scan ไม่มีข้อมูล lot/exp แยก");
        else toast.error(`ไม่พบสินค้าในแท็บนี้: ${scannedRaw}`);

        if (scanBarcodeInputRef.current) {
          scanBarcodeInputRef.current.value = "";
          scanBarcodeInputRef.current.focus();
        }
        return;
      }

      const item: any = picked.item;
      const itemId = String(item.id);
      const loc = confirmedLocation.full_name;

      // ✅ PICK: location ต้องตรง lock_locations
      if (viewMode === "pick" && !isAllowedAtPickLocation(item, loc)) {
        toast.error("PICK: Location ไม่ตรงกับ Lock Location ของสินค้า");
        if (scanBarcodeInputRef.current) {
          scanBarcodeInputRef.current.value = "";
          scanBarcodeInputRef.current.focus();
        }
        return;
      }

      // ✅ PUT: เช็คเฉพาะ temp (ปลายทางย้ายได้ ยกเว้นอุณหภูมิ)
      if (viewMode === "put" && !isTempCompatibleForPut(item, loc)) {
        const rule = getItemTempRule(item);
        const locTemp = getLocationTemp(loc);
        toast.error(
          `PUT: อุณหภูมิไม่ตรงกัน (สินค้า: ${rule ?? "-"} / Location: ${locTemp ?? "-"})`,
        );
        if (scanBarcodeInputRef.current) {
          scanBarcodeInputRef.current.value = "";
          scanBarcodeInputRef.current.focus();
        }
        return;
      }

      // ✅ ผ่านจริง => mark เขียว
      setMarkByLoc((prev) => {
        const lk = (loc || "").trim();
        const m = prev[lk] || {};
        return { ...prev, [lk]: { ...m, [itemId]: true } };
      });

      toast.success(
        `${viewMode === "put" ? "Put" : "Pick"} OK ✅ : ${
          item?.name || item?.code || ""
        }`,
      );

      if (scanBarcodeInputRef.current) {
        scanBarcodeInputRef.current.value = "";
        scanBarcodeInputRef.current.focus();
      }
    }, 0);
  };

  // =========================
  // Confirm PICK
  // =========================
  const confirmPick = async () => {
    if (!no) return;

    const user_ref = getUserLabel((transfer as any)?.user) || "ref. login";

    const locEntries = Object.entries(markByLoc || {}).filter(([_, map]) =>
      Object.values(map || {}).some((v) => v === true),
    );

    if (locEntries.length === 0) {
      warningAlert("ยังไม่มีรายการที่สแกน (ยังไม่ขึ้นเขียว)");
      return;
    }

    const payloadLocations = locEntries
      .map(([locFullName, map]) => ({
        location_full_name: locFullName,
        lines: Object.entries(map || {})
          .filter(([_, ok]) => ok === true)
          .map(([transfer_item_id]) => ({
            transfer_item_id: String(transfer_item_id),
            status: "put",
          })),
      }))
      .filter((x) => x.lines.length > 0);

    const totalLines = payloadLocations.reduce((s, x) => s + x.lines.length, 0);

    const c = await confirmAlert(
      `ยืนยันเปลี่ยนสถานะ ${totalLines} รายการ เป็น PUT ใช่ไหม?`,
    );
    if (!c.isConfirmed) return;

    try {
      setLoading(true);
      await transferApi.confirmToPick(no, {
        user_ref,
        locations: payloadLocations,
      });

      setMarkByLoc({});
      setLoading(false);

      await successAlert("ยืนยันสำเร็จแล้ว");
      await fetchDetail();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Confirm ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // PUT PIN modal
  // =========================
  const openPinModal = () => {
    setPinErr("");
    setPinValue("");
    setPinOpen(true);
    setTimeout(() => {
      const el = document.getElementById(
        "dt-tf-mv-pin-input",
      ) as HTMLInputElement | null;
      el?.focus();
    }, 50);
  };

  const closePinModal = () => {
    setPinOpen(false);
    setPinValue("");
    setPinErr("");
  };

  const doConfirmPutWithPin = async () => {
    const pin = pinValue.trim();
    if (!/^\d{4,6}$/.test(pin)) {
      setPinErr("กรุณากรอก PIN (4-6 หลัก)");
      return;
    }

    if (!no) return;

    const loc = (confirmedLocation?.full_name || "").trim();
    if (!loc) {
      setPinErr("กรุณา Scan Location ก่อน");
      return;
    }

    const user_ref = getUserLabel((transfer as any)?.user) || "ref. login";

    const marks = markByLoc[loc] || {};
    const markedIds = putItems
      .map((it: any) => String(it?.id))
      .filter((id) => marks[id] === true);

    if (markedIds.length === 0) {
      setPinErr("ยังไม่มีรายการที่สแกนสำหรับ Put");
      return;
    }

    try {
      setLoading(true);

      await transferApi.confirmToPut(no, {
        user_ref,
        pin,
        locations: [
          {
            location_full_name: loc,
            lines: markedIds.map((id) => ({
              transfer_item_id: String(id),
              status: "completed",
            })),
          },
        ],
      });

      setMarkByLoc((prev) => {
        const next = { ...prev };
        delete next[loc];
        return next;
      });

      closePinModal();
      setLoading(false);
      await successAlert("Put สำเร็จแล้ว");
      await fetchDetail();
    } catch (err: any) {
      setPinErr(err?.response?.data?.message || "Confirm Put ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (viewMode === "pick") return confirmPick();

    if (viewMode === "put") {
      if (!confirmedLocation?.full_name) {
        warningAlert("กรุณา Scan Location ก่อน");
        return;
      }
      if (!isAllMarkedAtCurrentLoc) {
        warningAlert("กรุณาสแกนสินค้าให้ครบก่อนยืนยัน Put");
        return;
      }
      return openPinModal();
    }

    return;
  };

  const tableHeaders = [
    "No",
    "Code",
    "ชื่อ",
    "QTY",
    "หน่วย",
    "Lock No.",
    "Lot serial.",
    "Expire Date",
    "เวลาที่ดำเนินการ",
  ];

  if (!transfer && loading) {
    return (
      <div className="dt-tf-mv-container">
        <Loading />
      </div>
    );
  }

  const user = (transfer as any)?.user;
  const userLabel = getUserLabel(user);

  return (
    <div className="dt-tf-mv-container">
      <div className="dt-tf-mv-header">
        <div className="dt-tf-mv-title">
          MOVE : {String((transfer as any)?.no ?? no ?? "M-XXXXXX")}
        </div>
      </div>

      <div className="dt-tf-mv-info">
        <div className="dt-tf-mv-info-left">
          <div className="dt-tf-mv-info-row">
            <div className="dt-tf-mv-info-item">
              <label>Department :</label>
              <span>{asText((transfer as any)?.department)}</span>
            </div>
            <div className="dt-tf-mv-info-item">
              <label>User :</label>
              <span>{userLabel}</span>
            </div>
          </div>
        </div>

        <div className="dt-tf-mv-info-right">
          <div className="dt-tf-mv-scan-row">
            <label>Scan Location</label>
            <div className="dt-tf-mv-scan-wrap">
              <input
                ref={scanLocationInputRef}
                type="text"
                className="dt-tf-mv-scan-input"
                value={scanLocation}
                onChange={(e) => setScanLocation(e.target.value)}
                onKeyDown={handleScanLocationKeyDown}
                placeholder={
                  viewMode === "put"
                    ? "สแกน Location ปลายทาง"
                    : "สแกน Location ต้นทาง"
                }
                disabled={!isLocationScanOpen || viewMode === "done"}
                style={{
                  borderColor: confirmedLocation ? "#4CAF50" : undefined,
                  opacity: isLocationScanOpen && viewMode !== "done" ? 1 : 0.6,
                }}
              />
              <button
                type="button"
                className={`dt-tf-mv-btn-toggle ${
                  isLocationScanOpen ? "active" : ""
                }`}
                onClick={toggleLocationScan}
                disabled={viewMode === "done"}
                title={
                  viewMode === "done"
                    ? "Done แล้ว"
                    : isLocationScanOpen
                      ? "ปิด Location"
                      : "เปิด Location"
                }
              >
                {isLocationScanOpen ? (
                  <i className="fa-solid fa-xmark"></i>
                ) : (
                  <i className="fa-solid fa-qrcode"></i>
                )}
              </button>
            </div>
          </div>

          <div className="dt-tf-mv-scan-row">
            <label>Scan Barcode/Serial</label>
            <input
              ref={scanBarcodeInputRef}
              type="text"
              className="dt-tf-mv-scan-input"
              onKeyDown={handleScanBarcodeKeyDown}
              placeholder="สแกน Barcode/Serial"
              disabled={!confirmedLocation || viewMode === "done"}
            />
          </div>
        </div>
      </div>

      <div className="dt-tf-mv-tabs">
        <button
          type="button"
          className={`dt-tf-mv-tab ${viewMode === "pick" ? "active" : ""}`}
          onClick={() => setViewMode("pick")}
        >
          รายการ Pick <span className="dt-tf-mv-badge">{pickCount}</span>
        </button>

        <button
          type="button"
          className={`dt-tf-mv-tab ${viewMode === "put" ? "active" : ""}`}
          onClick={() => setViewMode("put")}
        >
          รายการ Put <span className="dt-tf-mv-badge">{putCount}</span>
        </button>

        <button
          type="button"
          className={`dt-tf-mv-tab ${viewMode === "done" ? "active" : ""}`}
          onClick={() => setViewMode("done")}
        >
          ดำเนินการเสร็จสิ้น <span className="dt-tf-mv-badge">{doneCount}</span>
        </button>

        <div className="dt-tf-mv-tab-right">
          <div className="dt-tf-mv-search">
            <i className="fa-solid fa-magnifying-glass dt-tf-mv-search-icon"></i>
            <input
              className="dt-tf-mv-search-input"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search"
            />
          </div>

          {confirmedLocation ? (
            <div className="dt-tf-mv-hint">
              Location ปัจจุบัน: <b>{confirmedLocation.full_name}</b>
            </div>
          ) : null}
        </div>
      </div>

      <br />

      <div className="table__wrapper">
        <Table headers={tableHeaders as any}>
          {sortedItems.length === 0 ? (
            <tr>
              <td colSpan={tableHeaders.length} className="no-data">
                No items found.
              </td>
            </tr>
          ) : (
            sortedItems.map((it: any, index) => {
              const id = String(it?.id);
              const loc = (confirmedLocation?.full_name || "").trim();
              const marked = loc ? markByLoc[loc]?.[id] === true : false;

              // ✅ RED logic ตาม requirement ใหม่
              const badPick =
                viewMode === "pick" && loc ? !isAllowedAtPickLocation(it, loc) : false;

              const badPutTemp =
                viewMode === "put" && loc ? !isTempCompatibleForPut(it, loc) : false;

              // ✅ “แดงต้องชนะเขียว”
              const rowClass = [
                badPick || badPutTemp ? "dt-tf-mv-row-bad" : "",
                !badPick && !badPutTemp && marked ? "dt-tf-mv-row-ok" : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <tr key={`${id}-${index}`} className={rowClass}>
                  <td>{index + 1}</td>
                  <td style={{ minWidth: 200 }}>
                    {it.code || it.barcode_text || "--"}
                  </td>
                  <td style={{ minWidth: 200 }}>{it.name || "--"}</td>
                  <td>{it.qty}</td>
                  <td>{it.unit || "--"}</td>
                  <td style={{ minWidth: 220 }}>
                    {it?.lock_no || it?.lock_no_list || "--"}
                  </td>
                  <td>{it.lot_serial ?? it.lot ?? "--"}</td>
                  <td>{it.exp ? formatDateTime(it.exp) : "--"}</td>
                  <td>{it.updated_at ? formatDateTime(it.updated_at) : "--"}</td>
                </tr>
              );
            })
          )}
        </Table>
      </div>

      <div className="dt-tf-mv-footer">
        <button
          className="dt-tf-mv-btn-cancel"
          onClick={() => navigate(-1)}
          disabled={loading}
        >
          ยกเลิก
        </button>

        {viewMode !== "done" && (
          <button
            className="dt-tf-mv-btn-confirm"
            onClick={handleConfirm}
            disabled={
              loading ||
              (viewMode === "put" && (!confirmedLocation || !isAllMarkedAtCurrentLoc))
            }
          >
            {viewMode === "pick" ? "ยืนยันการ Pick" : "ยืนยัน"}
          </button>
        )}
      </div>

      {pinOpen && (
        <div className="dt-tf-mv-pin-backdrop" role="dialog" aria-modal="true">
          <div className="dt-tf-mv-pin-modal">
            <div className="dt-tf-mv-pin-title">End Task</div>

            <div className="dt-tf-mv-pin-body">
              <div className="dt-tf-mv-pin-row">
                <div className="dt-tf-mv-pin-label">PIN</div>
                <div className="dt-tf-mv-pin-input-wrap">
                  <input
                    id="dt-tf-mv-pin-input"
                    className="dt-tf-mv-pin-input"
                    value={pinValue}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d]/g, "");
                      setPinValue(v.slice(0, 6));
                      setPinErr("");
                    }}
                    placeholder="6 digits"
                    inputMode="numeric"
                    maxLength={6}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") doConfirmPutWithPin();
                      if (e.key === "Escape") closePinModal();
                    }}
                  />
                  <div className="dt-tf-mv-pin-hint">กรุณาใส่รหัสของ PIN</div>
                </div>
              </div>

              <div className="dt-tf-mv-pin-row">
                <div className="dt-tf-mv-pin-label">User</div>
                <div className="dt-tf-mv-pin-user">
                  {userLabel || "Supervisor"}
                </div>
              </div>

              {pinErr ? <div className="dt-tf-mv-pin-error">{pinErr}</div> : null}
            </div>

            <div className="dt-tf-mv-pin-actions">
              <button
                className="dt-tf-mv-pin-btn ghost"
                onClick={closePinModal}
                type="button"
              >
                Cancel
              </button>
              <button
                className="dt-tf-mv-pin-btn primary"
                onClick={doConfirmPutWithPin}
                type="button"
                disabled={loading}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="loading-overlay">
          <Loading />
        </div>
      )}
    </div>
  );
}