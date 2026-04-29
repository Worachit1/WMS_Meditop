// src/modules/transfer_movement/pages/detail/DetailTransferMovement.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import DetailNavigator from "../../../../components/DetailNavigator/DetailNavigator";
import { toast } from "react-toastify";

import {
  confirmAlert,
  successAlert,
  warningAlert,
} from "../../../../utils/alert";
import { transferApi } from "../../services/transfer.api";
import type { TransferItemType, TransferType } from "../../types/tranfers.type";

import Table from "../../../../components/Table/Table";
import Loading from "../../../../components/Loading/Loading";
import { formatDateTime } from "../../../../components/Datetime/FormatDateTime";

import "../../../../components/Button/button.css";
import "../../../../components/Table/table.css";
import "../../../../styles/component.css";
import "./detailTransfermovement.css";

import { socket } from "../../../../services/socket";

type ViewMode = "pick" | "put" | "done";
type ConfirmedLocation = { id: number; full_name: string };

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

const n0 = (v: any) => Math.max(0, Math.floor(Number(v ?? 0) || 0));

const getPutLocations = (it: any) =>
  Array.isArray(it?.lock_no_dest_list) ? it.lock_no_dest_list : [];

const getPutQtyAtLocation = (it: any, locFullName: string) => {
  const loc = tokenOnly(locFullName);
  if (!loc) return 0;

  const row = getPutLocations(it).find(
    (x: any) => tokenOnly(x?.location_name ?? "") === loc,
  );

  return n0(row?.confirmed_put);
};

const getPutDestSummary = (it: any) => {
  const rows = getPutLocations(it);
  if (!rows.length) return String(it?.lock_no_dest ?? "").trim() || "--";

  return rows
    .map((x: any) => `${x?.location_name ?? "-"} (${n0(x?.confirmed_put)})`)
    .join(", ");
};

const isItemTargetCurrentPutLocation = (it: any, locFullName: string) => {
  const loc = tokenOnly(locFullName);
  if (!loc) return false;

  const rows = getPutLocations(it);

  if (rows.length > 0) {
    return rows.some((x: any) => tokenOnly(x?.location_name ?? "") === loc);
  }

  return tokenOnly(it?.lock_no_dest ?? "") === loc;
};

const isCompleteAtPutLocation = (it: any, locFullName: string) => {
  const qty = n0(it?.qty);
  const putAtLoc = getPutQtyAtLocation(it, locFullName);
  return qty > 0 && putAtLoc >= qty;
};

const isInProgressAtPutLocation = (it: any, locFullName: string) => {
  const qty = n0(it?.qty);
  const putAtLoc = getPutQtyAtLocation(it, locFullName);
  return putAtLoc > 0 && (qty === 0 || putAtLoc < qty);
};

/**
 * ✅ key ที่ backend match ได้ชัวร์ (ห้ามใช้ barcode_text)
 * - ใช้ตอน mode="set" เพื่อให้ set qty ไปที่ item เดิมแน่นอน
 */
const getItemScanKey = (it: any): string => {
  const bp = String(it?.barcode_payload ?? "").trim();
  if (bp) return bp;

  const lot = String(it?.lot_serial ?? "").trim();
  if (lot) return lot;

  const code = String(it?.code ?? "").trim();
  if (code) return code;

  return "";
};

// =========================
// ✅ PICK Location rule
// =========================
const isAllowedAtPickLocation = (it: any, locFullName: string) => {
  const loc = tokenOnly(locFullName);
  const locks = Array.isArray(it?.lock_locations) ? it.lock_locations : [];

  if (locks.length === 0) {
    const hinted = String(
      it?.location_full_name ?? it?.location_name ?? "",
    ).trim();
    if (hinted) return tokenOnly(hinted) === loc;
    return true; // ไม่รู้จริงๆ ให้ผ่านก่อน
  }

  return locks.some((x: any) => tokenOnly(x?.location_name ?? "") === loc);
};

const splitLockTokens = (v: unknown): string[] => {
  return String(v ?? "")
    .split(/[,\n|;]/g)
    .map((s) => tokenOnly(s))
    .filter(Boolean);
};

const isLockNoMatchedWithLocation = (it: any, locFullName: string) => {
  const loc = tokenOnly(locFullName);
  if (!loc) return true;

  const rawLocks = [
    ...splitLockTokens(it?.lock_no),
    ...splitLockTokens(it?.lock_no_list),
  ];

  const locks = Array.from(new Set(rawLocks));
  if (locks.length === 0) return true;

  return locks.some((lock) => lock === loc);
};

const isPickableAtLocation = (it: any, locFullName: string) => {
  return (
    isAllowedAtPickLocation(it, locFullName) &&
    isLockNoMatchedWithLocation(it, locFullName)
  );
};

// =========================
// ✅ PUT Temp rules
// =========================
type TempToken = string | "NORMAL" | null;

const extractTempToken = (s: unknown): TempToken => {
  const raw = String(s ?? "").trim();
  if (!raw) return null;

  const v = raw.replace(/\s+/g, "");
  const m = v.match(/(?:_|-)(-?\d{1,2}(?:-\d{1,2})?C)\b/i);
  if (m?.[1]) return m[1].toUpperCase();

  return "NORMAL";
};

const getItemTempRule = (it: any): TempToken => {
  const lock = it?.lock_no ?? it?.lock_no_list ?? null;
  if (lock === null || lock === undefined || String(lock).trim() === "")
    return null;
  return extractTempToken(lock);
};

const getLocationTemp = (locFullName: string): TempToken =>
  extractTempToken(locFullName) ?? "NORMAL";

const isTempCompatibleForPut = (it: any, locFullName: string) => {
  const rule = getItemTempRule(it);
  if (rule === null) return true;
  const locTemp = getLocationTemp(locFullName);
  return rule === locTemp;
};

// =========================
// ✅ find item by scan (ใช้เช็ค rule ก่อนยิง API)
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

type ScanWithLocationResult =
  | {
      item: any;
      reason:
        | "OK_SINGLE_IN_LOCATION"
        | "OK_LOT_SERIAL_IN_LOCATION"
        | "OK_EXP_IN_LOCATION";
    }
  | {
      item?: undefined;
      reason:
        | "EMPTY"
        | "NO_BARCODE_MATCH"
        | "FOUND_OTHER_LOCATION"
        | "AMBIGUOUS_IN_LOCATION";
    };

const findPickItemByScanAndLocation = (
  scanRaw: string,
  items: any[],
  locFullName: string,
): ScanWithLocationResult => {
  const scanDigits = digitsOnly(scanRaw);
  const scanToken = tokenOnly(scanRaw);

  if (!scanDigits && !scanToken) return { reason: "EMPTY" };

  const barcodeCandidates = items.filter((it) => {
    const b = getItemBarcodeDigits(it);
    return b && scanDigits.includes(b);
  });

  if (barcodeCandidates.length === 0) {
    return { reason: "NO_BARCODE_MATCH" };
  }

  const inLocation = barcodeCandidates.filter((it) =>
    isPickableAtLocation(it, locFullName),
  );

  if (inLocation.length === 0) {
    return { reason: "FOUND_OTHER_LOCATION" };
  }

  if (inLocation.length === 1) {
    return { item: inLocation[0], reason: "OK_SINGLE_IN_LOCATION" };
  }

  const lotMatches = inLocation.filter((it) => {
    const ls = getItemLotSerialToken(it);
    return ls && scanToken.includes(ls);
  });

  if (lotMatches.length === 1) {
    return { item: lotMatches[0], reason: "OK_LOT_SERIAL_IN_LOCATION" };
  }

  const expMatches = inLocation.filter((it) => {
    const e6 = getItemExpYYMMDD(it);
    return e6 && scanDigits.includes(e6);
  });

  if (expMatches.length === 1) {
    return { item: expMatches[0], reason: "OK_EXP_IN_LOCATION" };
  }

  return { reason: "AMBIGUOUS_IN_LOCATION" };
};

// =========================
// ✅ safe render helpers
// =========================
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

const getUserLabel = (user: any) => {
  const fn = String(user?.first_name ?? "").trim();
  const ln = String(user?.last_name ?? "").trim();
  return `${fn} ${ln}`.trim() || "-";
};

const getProgressQty = (it: any, mode: ViewMode) => {
  if (mode === "pick") return n0(it?.qty_pick);
  if (mode === "put") return n0(it?.qty_put);
  return n0(it?.qty_put);
};

const isComplete = (it: any, mode: ViewMode) => {
  const qty = n0(it?.qty);
  const prog = getProgressQty(it, mode);
  return qty > 0 && prog >= qty;
};

const isInProgress = (it: any, mode: ViewMode) => {
  const qty = n0(it?.qty);
  const prog = getProgressQty(it, mode);
  return prog > 0 && (qty === 0 || prog < qty);
};

// =========================
// main
// =========================
export default function DetailTransferMovement() {
  const navigate = useNavigate();
  const params = useParams();

  const no = decodeURIComponent(String(params.no ?? "").trim());

  const locationRouter = useLocation();

  const navState = useMemo(() => {
    return (locationRouter.state as any) || {};
  }, [locationRouter.state]);

  const navStatus = navState.status as "pick" | "put" | "completed" | undefined;

  const stateDetailList = useMemo(() => {
    return Array.isArray(navState.detailList) ? navState.detailList : [];
  }, [navState.detailList]);

  const stateDetailTotal = Number(navState.detailTotal ?? 0);

  const [detailList, setDetailList] = useState<Array<{ no: string }>>([]);

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

  // realtime scan bookkeeping (for set qty)
  const [scannedIds, setScannedIds] = useState<Set<string>>(() => new Set());
  const [scannedKeyById, setScannedKeyById] = useState<Record<string, string>>(
    {},
  );

  // inline edit qty for input_number items
  const [editQtyById, setEditQtyById] = useState<Record<string, string>>({});
  const [savingQtyById, setSavingQtyById] = useState<Record<string, boolean>>(
    {},
  );

  const [_confirmedLocations, setConfirmedLocations] = useState<
    ConfirmedLocation[]
  >([]);

  // ✅ กัน Enter -> blur ยิงซ้ำ
  const skipBlurCommitRef = useRef<Record<string, boolean>>({});

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
    if (viewMode === "put" && putCount === 0 && doneCount > 0)
      setViewMode("done");
  }, [viewMode, pickCount, putCount, doneCount]);

  const viewItems = useMemo(() => {
    if (viewMode === "pick") return pickItems;
    if (viewMode === "put") return putItems;
    return doneItems;
  }, [viewMode, pickItems, putItems, doneItems]);

  // =========================
  // search filter + sort
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

  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a: any, b: any) => {
      const aDone = isComplete(a, viewMode) ? 1 : 0;
      const bDone = isComplete(b, viewMode) ? 1 : 0;
      return aDone - bDone;
    });
  }, [filteredItems, viewMode]);

  const transferStatus = String((transfer as any)?.status ?? "").toLowerCase();
  const isTransferStatusPut = transferStatus === "put";

  // ✅ PUT ต้องสแกนครบทุก item ของ location ที่เลือก ถึงยืนยันได้
  const isAllCompleteForPutConfirm = useMemo(() => {
    if (!confirmedLocation?.full_name) return false;

    const targetItems = putItems.filter((it: any) =>
      isItemTargetCurrentPutLocation(it, confirmedLocation.full_name),
    );

    if (targetItems.length === 0) return false;

    return targetItems.every((it: any) =>
      isCompleteAtPutLocation(it, confirmedLocation.full_name),
    );
  }, [putItems, confirmedLocation]);

  //  const isAllCompleteInPutTab = useMemo(() => {
  //   if (viewMode !== "put") return false;
  //   if (putItems.length === 0) return false;
  //   if (!confirmedLocation?.full_name) return false;

  //   return putItems.every((it: any) =>
  //     isCompleteAtPutLocation(it, confirmedLocation.full_name),
  //   );
  // }, [viewMode, putItems, confirmedLocation]);

  const isPutConfirmMode =
    viewMode === "put" || (viewMode === "done" && isTransferStatusPut);

  useEffect(() => {
    if (!isPutConfirmMode) return;
    if (!confirmedLocation?.full_name) return;

    console.log("confirmedLocation:", confirmedLocation?.full_name);
    console.log("isAllCompleteForPutConfirm:", isAllCompleteForPutConfirm);

    putItems.forEach((it: any) => {
      console.log({
        id: it?.id,
        qty: n0(it?.qty),
        lock_no_dest: it?.lock_no_dest,
        rows: getPutLocations(it),
        target: isItemTargetCurrentPutLocation(
          it,
          confirmedLocation?.full_name ?? "",
        ),
        putAtLoc: getPutQtyAtLocation(it, confirmedLocation?.full_name ?? ""),
        complete: isCompleteAtPutLocation(
          it,
          confirmedLocation?.full_name ?? "",
        ),
      });
    });
  }, [
    isPutConfirmMode,
    confirmedLocation,
    putItems,
    isAllCompleteForPutConfirm,
  ]);

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

  const mergeRealtimeItem = useCallback(
    (updated: any) => {
      if (!updated?.id) return;

      const updatedId = String(updated.id);

      setTransfer((prev) => {
        if (!prev) return prev as any;

        const items = Array.isArray((prev as any).items)
          ? (prev as any).items
          : [];

        const nextItems = items.map((x: any) =>
          String(x?.id) === updatedId
            ? {
                ...x,
                qty_pick: updated.qty_pick ?? x.qty_pick ?? 0,
                qty_put: updated.qty_put ?? x.qty_put ?? 0,
                qty: updated.qty ?? x.qty,
                status:
                  viewMode === "put" && updated.status === "completed"
                    ? "put"
                    : (updated.status ?? x.status),
                lock_no: updated.lock_no ?? x.lock_no,
                lock_no_dest: updated.lock_no_dest ?? x.lock_no_dest,
                lock_no_dest_list:
                  updated.lock_no_dest_list ?? x.lock_no_dest_list ?? [],
                updated_at: updated.updated_at ?? new Date().toISOString(),
                input_number:
                  updated.input_number !== undefined
                    ? updated.input_number
                    : x.input_number,
              }
            : x,
        );

        return { ...(prev as any), items: nextItems } as any;
      });

      // ให้ถือว่า row นี้เคยถูก scan แล้ว
      setScannedIds((prev) => {
        const nx = new Set(prev);
        nx.add(updatedId);
        return nx;
      });

      // เก็บ key ล่าสุดไว้ใช้กับ mode=set
      setScannedKeyById((prev) => ({
        ...prev,
        [updatedId]: String(
          updated?.barcode_payload ?? prev[updatedId] ?? "",
        ).trim(),
      }));

      // ✅ sync textbox draft ตาม view ปัจจุบัน
      setEditQtyById((prev) => {
        const nextValue =
          viewMode === "pick"
            ? String(n0(updated.qty_pick))
            : viewMode === "put"
              ? String(n0(updated.qty_put))
              : String(n0(updated.qty_put));

        return {
          ...prev,
          [updatedId]: nextValue,
        };
      });
    },
    [viewMode],
  );

  // =========================
  // fetch detail
  // =========================
  const fetchDetail = useCallback(
    async (withLoading = true) => {
      if (!no) return;

      if (withLoading) setLoading(true);

      try {
        const resp = await transferApi.getDetailExpNcr(no);
        const row = pickTransferFromAnyShape(resp.data);
        setTransfer(row);

        setScannedIds(new Set());
        setScannedKeyById({});
        setEditQtyById({});
        setSavingQtyById({});

        setScanLocation("");
        setConfirmedLocation(null);
        setIsLocationScanOpen(false);

        if (scanBarcodeInputRef.current) {
          scanBarcodeInputRef.current.value = "";
        }
      } catch (err: any) {
        toast.error(
          err?.response?.data?.message || "Fetch transfer detail ไม่สำเร็จ",
        );
        setTransfer(null);
      } finally {
        if (withLoading) setLoading(false);
      }
    },
    [no],
  );

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // =========================
  // ✅ socket connect + join room (single effect)
  // =========================
  useEffect(() => {
    if (!no) return;

    const join = () => socket.emit("join_transfer_movement", no);

    socket.connect();
    if (socket.connected) join();
    socket.on("connect", join);

    return () => {
      socket.emit("leave_transfer_movement", no);
      socket.off("connect", join);
      socket.disconnect();
    };
  }, [no]);

  // =========================
  // ✅ realtime handlers
  // =========================
  useEffect(() => {
    if (!no) return;

    const onScanLocation = (payload: any) => {
      const locName =
        payload?.location?.location_name ??
        payload?.location?.location_full_name ??
        "";
      // ถ้าอยาก sync location จริงค่อยเปิดบรรทัดล่าง
      // const locId = Number(payload?.location?.location_id ?? 0) || 0;
      // setConfirmedLocation({ id: locId, full_name: String(locName || "") });

      if (locName) toast.info(`📡 Realtime: scan location ${String(locName)}`);
    };

    const onScanBarcode = (payload: any) => {
      if (String(payload?.transfer_movement_no ?? "").trim() !== no) return;

      const updated = payload?.matched_item;
      if (!updated?.id) return;

      mergeRealtimeItem(updated);
    };

    socket.on("tm:scan_location", onScanLocation);
    socket.on("tm:scan_barcode", onScanBarcode);

    return () => {
      socket.off("tm:scan_location", onScanLocation);
      socket.off("tm:scan_barcode", onScanBarcode);
    };
  }, [no, mergeRealtimeItem]);

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

  useEffect(() => {
    const stateRows = stateDetailList
      .map((x: any) => ({
        no: String(x?.no ?? "").trim(),
      }))
      .filter((x: { no: string }) => x.no);

    const shouldFetchAll =
      stateRows.length === 0 ||
      (stateDetailTotal > 0 && stateRows.length < stateDetailTotal);

    if (!shouldFetchAll) {
      setDetailList(stateRows);
      return;
    }

    const fetchDetailList = async () => {
      try {
        const limit = 100;
        let page = 1;
        let totalPages = 1;
        const allRows: any[] = [];

        do {
          const resp = await transferApi.getMovementPaginated({
            page,
            limit,
            ...(navStatus ? { status: navStatus } : {}),
          } as any);

          const rows = Array.isArray(resp?.data?.data) ? resp.data.data : [];
          const meta = resp?.data?.meta ?? {};

          allRows.push(...rows);
          totalPages = Number(meta?.totalPages ?? 1);
          page += 1;
        } while (page <= totalPages);

        const mapped = allRows
          .map((x: any) => ({
            no: String(x?.no ?? "").trim(),
          }))
          .filter((x: { no: string }) => x.no);

        setDetailList(mapped);
      } catch (error) {
        console.error("Error fetching transfer movement detail list:", error);
        setDetailList(stateRows);
      }
    };

    fetchDetailList();
  }, [navStatus, stateDetailList, stateDetailTotal]);

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

      const resp =
        viewMode === "put"
          ? await transferApi.scanLocationPut(no, {
              location_full_name: fullName,
            })
          : await transferApi.scanLocationPick(no, {
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
      const nextLoc = { id: locId, full_name: String(locName) };

      setConfirmedLocation(nextLoc);
      setConfirmedLocations((prev) => {
        const exists = prev.some(
          (x) => tokenOnly(x.full_name) === tokenOnly(nextLoc.full_name),
        );
        return exists ? prev : [...prev, nextLoc];
      });

      setScanLocation(String(locName));
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
  // Scan Barcode/Serial (backend คือ source of truth)
  // =========================
  const handleScanBarcodeKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    const isSubmitKey =
      e.key === "Enter" || e.key === "Tab" || e.code === "NumpadEnter";
    if (!isSubmitKey) return;

    e.preventDefault();

    // อ่านค่าจาก ref ก่อน เพื่อเช็ค ChangeLocation
    const rawImmediate = String(
      scanBarcodeInputRef.current?.value ?? "",
    ).trim();
    if (rawImmediate.toLowerCase().replace(/\s/g, "") === "changelocation") {
      if (scanBarcodeInputRef.current) {
        scanBarcodeInputRef.current.value = "";
      }
      setScanLocation("");
      setConfirmedLocation(null);
      setIsLocationScanOpen(true);
      setTimeout(() => scanLocationInputRef.current?.focus(), 0);
      toast.info("โหมดเปลี่ยน Location: กรุณา Scan Location ใหม่");
      return;
    }

    if (!confirmedLocation?.full_name) {
      warningAlert("กรุณา Scan Location ก่อน");
      return;
    }

    // ✅ อ่านค่าหลัง keydown 1 tick กัน IME/DOM sync
    setTimeout(() => {
      const raw = scanBarcodeInputRef.current?.value ?? "";
      const scannedRaw = String(raw ?? "").trim();
      if (!scannedRaw) return;

      if (viewMode === "done") {
        toast.info("รายการเสร็จสิ้นแล้ว");
        if (scanBarcodeInputRef.current) {
          scanBarcodeInputRef.current.value = "";
          scanBarcodeInputRef.current.blur();
        }
        return;
      }

      const loc = confirmedLocation.full_name;

      // ✅ FE หา item เพื่อเช็ค rule ก่อนยิง API (ถ้าไม่เจอ ยังยิง backend ได้)
      let item: any = null;

      if (viewMode === "pick") {
        const picked = findPickItemByScanAndLocation(
          scannedRaw,
          pickItems as any[],
          loc,
        );

        if (picked.reason === "FOUND_OTHER_LOCATION") {
          toast.error(
            "PICK: Location ที่สแกนไม่ตรงกับ Lock Location / Lock No. ของสินค้า",
          );
          if (scanBarcodeInputRef.current) {
            scanBarcodeInputRef.current.value = "";
            scanBarcodeInputRef.current.focus();
          }
          return;
        }

        if (picked.reason === "AMBIGUOUS_IN_LOCATION") {
          toast.error(
            "PICK: พบสินค้าซ้ำใน Location นี้ กรุณาสแกนที่มี Lot/Expire ให้ครบ",
          );
          if (scanBarcodeInputRef.current) {
            scanBarcodeInputRef.current.value = "";
            scanBarcodeInputRef.current.focus();
          }
          return;
        }

        if (picked.reason === "EMPTY") {
          return;
        }

        // สำคัญ: ถ้า FE หาไม่เจอ อย่าให้ยิง API ใน mode pick
        if (picked.reason === "NO_BARCODE_MATCH") {
          toast.error("PICK: ไม่พบสินค้านี้ใน Location ที่สแกนอยู่");
          if (scanBarcodeInputRef.current) {
            scanBarcodeInputRef.current.value = "";
            scanBarcodeInputRef.current.focus();
          }
          return;
        }

        item = picked.item ?? null;

        // กันซ้ำอีกชั้นก่อนเรียก API
        if (!item || !isPickableAtLocation(item, loc)) {
          toast.error(
            "PICK: Location ที่สแกนไม่ตรงกับ Lock Location / Lock No. ของสินค้า",
          );
          if (scanBarcodeInputRef.current) {
            scanBarcodeInputRef.current.value = "";
            scanBarcodeInputRef.current.focus();
          }
          return;
        }
      } else {
        const picked = findItemByScanSmart(scannedRaw, putItems as any[]);
        item = picked.item ?? null;
      }

      // ✅ PUT: เช็คเฉพาะ temp
      if (item && viewMode === "put" && !isTempCompatibleForPut(item, loc)) {
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

      // ✅ rule: put ห้ามนำหน้า pick และห้ามเกิน qty
      if (item && viewMode === "put") {
        const qty = n0(item?.qty);
        const qp = n0(item?.qty_pick);

        // ✅ เช็คเฉพาะ location ปัจจุบัน
        const qputAtLoc = getPutQtyAtLocation(item, loc);

        if (qty > 0 && qp > qty) {
          toast.error(`PUT ไม่ได้: qty_pick (${qp}) มากกว่า qty (${qty})`);
          if (scanBarcodeInputRef.current) {
            scanBarcodeInputRef.current.value = "";
            scanBarcodeInputRef.current.focus();
          }
          return;
        }

        // ✅ ห้าม put เกิน pick ของ item ทั้งใบ
        const totalPut = n0(item?.qty_put);
        if (qp <= totalPut) {
          toast.error(
            "PUT ไม่ได้: ต้อง Pick ก่อน (qty_pick ต้องมากกว่า qty_put)",
          );
          if (scanBarcodeInputRef.current) {
            scanBarcodeInputRef.current.value = "";
            scanBarcodeInputRef.current.focus();
          }
          return;
        }

        // ✅ ถ้า location นี้ครบแล้ว ก็ไม่ต้องยิงต่อ
        if (qty > 0 && qputAtLoc >= qty) {
          toast.info("Location นี้สแกนครบแล้ว");
          if (scanBarcodeInputRef.current) {
            scanBarcodeInputRef.current.value = "";
            scanBarcodeInputRef.current.focus();
          }
          return;
        }
      }

      (async () => {
        try {
          setLoading(true);

          const resp = await transferApi.scanBarcode(no, {
            barcode: scannedRaw,
            location_full_name: loc,
            mode: "inc",
          });

          const updated = resp?.data?.matched_item;
          if (!updated?.id)
            throw new Error("scan response missing matched_item");

          // if (item && viewMode === "pick") {
          //   const badPickLocation = !isAllowedAtPickLocation(item, loc);
          //   const badPickLockNo = !isLockNoMatchedWithLocation(item, loc);

          //   if (badPickLocation || badPickLockNo) {
          //     toast.error(
          //       "PICK: Location ที่สแกนไม่ตรงกับ Lock Location / Lock No. ของสินค้า",
          //     );
          //     if (scanBarcodeInputRef.current) {
          //       scanBarcodeInputRef.current.value = "";
          //       scanBarcodeInputRef.current.focus();
          //     }
          //     return;
          //   }
          // }
          mergeRealtimeItem({
            ...updated,
            barcode_payload: updated?.barcode_payload ?? scannedRaw,
          });

          if (viewMode === "pick") {
            toast.success(
              `Pick +1 ✅ : ${updated?.name || updated?.code || ""} (${n0(updated?.qty_pick)}/${n0(updated?.qty)})`,
            );
          } else {
            toast.success(
              `Put +1 ✅ : ${updated?.name || updated?.code || ""} (${n0(updated?.qty_put)}/${n0(updated?.qty)})`,
            );
          }
        } catch (err: any) {
          toast.error(
            err?.response?.data?.message ||
              err?.message ||
              "Scan Barcode ไม่สำเร็จ",
          );
        } finally {
          setLoading(false);
          if (scanBarcodeInputRef.current) {
            scanBarcodeInputRef.current.value = "";
            scanBarcodeInputRef.current.focus();
          }
        }
      })();
    }, 0);
  };

  // =========================
  // commit set qty (mode="set")
  // =========================
  const commitSetQty = useCallback(
    async (it: any, nextQty: number) => {
      if (!no) return;

      const id = String(it?.id);

      if (!scannedIds.has(id)) {
        toast.warning(
          "ต้องสแกนรายการนี้อย่างน้อย 1 ครั้งก่อน ถึงจะแก้จำนวนได้",
        );
        return;
      }

      const loc = String(confirmedLocation?.full_name ?? "").trim();
      if (!loc) {
        warningAlert("กรุณา Scan Location ก่อน");
        return;
      }

      const scanKey =
        String(scannedKeyById[id] ?? "").trim() ||
        String(getItemScanKey(it)).trim();
      if (!scanKey) {
        toast.error("ไม่พบ scan key สำหรับรายการนี้ (ต้องสแกนก่อน)");
        return;
      }

      const maxQty = n0(it?.qty);
      let safe = Math.max(0, Math.floor(Number(nextQty) || 0));
      if (maxQty > 0 && safe > maxQty) safe = maxQty;

      if (viewMode === "put") {
        const pick = n0(it?.qty_pick);
        const totalPut = n0(it?.qty_put);
        const currentAtLoc = getPutQtyAtLocation(it, loc);
        const otherLocPut = Math.max(0, totalPut - currentAtLoc);

        if (maxQty > 0 && pick > maxQty) safe = Math.min(safe, maxQty);

        // ✅ ยอดที่ set สำหรับ location นี้ + location อื่น ต้องไม่เกิน pick
        const maxAllowedAtThisLoc = Math.max(0, pick - otherLocPut);
        if (safe > maxAllowedAtThisLoc) safe = maxAllowedAtThisLoc;
      }

      if (savingQtyById[id]) return;

      try {
        setSavingQtyById((p) => ({ ...p, [id]: true }));

        const resp = await transferApi.scanBarcode(no, {
          barcode: scanKey,
          location_full_name: loc,
          mode: "set",
          value: safe,
        });

        const updated = resp?.data?.matched_item;
        if (!updated?.id) throw new Error("scan response missing matched_item");

        mergeRealtimeItem(updated);

        toast.success(
          viewMode === "pick"
            ? `Set PICK = ${n0(updated.qty_pick)}`
            : `Set PUT = ${n0(updated.qty_put)}`,
        );
      } catch (err: any) {
        toast.error(
          err?.response?.data?.message || err?.message || "Set จำนวนไม่สำเร็จ",
        );
      } finally {
        setSavingQtyById((p) => ({ ...p, [id]: false }));
      }
    },
    [
      no,
      confirmedLocation,
      viewMode,
      scannedIds,
      scannedKeyById,
      savingQtyById,
    ],
  );

  // =========================
  // Confirm PICK
  // =========================
  const confirmPick = async () => {
    if (!no) return;

    const user_ref = getUserLabel((transfer as any)?.user) || "ref. login";

    // ✅ ใช้เฉพาะ item ที่ pick แล้ว
    const completedItems = pickItems.filter((it: any) =>
      isComplete(it, "pick"),
    );

    if (completedItems.length === 0) {
      warningAlert("ยังไม่มีรายการที่ Pick ครบ");
      return;
    }

    // ✅ group ตาม location จริงของ item
    const groups = new Map<string, string[]>();

    for (const it of completedItems) {
      const locName = String(
        it?.location_full_name ??
          it?.location_name ??
          it?.lock_no ??
          it?.lock_no_list ??
          "",
      ).trim();

      if (!locName) continue;

      const arr = groups.get(locName) ?? [];
      arr.push(String(it.id));
      groups.set(locName, arr);
    }

    const locations = Array.from(groups.entries()).map(
      ([location_full_name, ids]) => ({
        location_full_name,
        lines: ids.map((id) => ({
          transfer_item_id: id,
          status: "put",
        })),
      }),
    );

    if (locations.length === 0) {
      warningAlert("ไม่พบ Location สำหรับยืนยัน");
      return;
    }

    const totalLines = locations.reduce((s, x) => s + x.lines.length, 0);

    const c = await confirmAlert(
      `ยืนยันเปลี่ยนสถานะ ${totalLines} รายการ เป็น PUT ใช่ไหม?`,
    );
    if (!c.isConfirmed) return;

    try {
      setLoading(true);

      await transferApi.confirmToPick(no, {
        user_ref,
        locations,
      });

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
  const [pinOpen, setPinOpen] = useState(false);
  const [pinValue, setPinValue] = useState("");
  const [pinErr, setPinErr] = useState("");

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
      setPinValue(""); // ✅ clear
      setTimeout(() => {
        document.getElementById("dt-tf-mv-pin-input")?.focus();
      }, 0);
      return;
    }

    if (!no) return;

    const loc = (confirmedLocation?.full_name || "").trim();
    if (!loc) {
      setPinErr("กรุณา Scan Location ก่อน");
      return;
    }

    const user_ref = getUserLabel((transfer as any)?.user) || "ref. login";

    const completedPutIds = putItems
      .filter((it: any) => isItemTargetCurrentPutLocation(it, loc))
      .filter((it: any) => isCompleteAtPutLocation(it, loc))
      .map((it: any) => String(it?.id));

    if (completedPutIds.length === 0) {
      setPinErr("ยังไม่มีรายการที่ Put ครบใน Location นี้");
      setPinValue(""); // ✅ clear
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
            lines: completedPutIds.map((id) => ({
              transfer_item_id: String(id),
            })),
          },
        ],
      });

      // ✅ success → reset ทุกอย่าง
      closePinModal();
      setPinValue("");
      setPinErr("");

      await successAlert("Put สำเร็จแล้ว");
      await fetchDetail(false);
    } catch (err: any) {
      // ❌ fail → clear แล้ว focus ใหม่
      setPinErr(err?.response?.data?.message || "Confirm Put ไม่สำเร็จ");
      setPinValue("");

      setTimeout(() => {
        document.getElementById("dt-tf-mv-pin-input")?.focus();
      }, 0);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (viewMode === "pick") return confirmPick();

    if (isPutConfirmMode) {
      if (!isAllCompleteForPutConfirm)
        return warningAlert("กรุณาสแกนสินค้าให้ครบก่อนยืนยัน Put");
      return openPinModal();
    }
  };

  // =========================
  // table headers
  // =========================
  const tableHeaders = useMemo(() => {
    const mid =
      viewMode === "pick"
        ? ["QTY", "QTY_PICK"]
        : viewMode === "put"
          ? ["QTY", "QTY_PUT"]
          : ["QTY", "QTY_PICK", "QTY_PUT"];

    const lockDestCol =
      viewMode === "put" || viewMode === "done" ? ["Lock No. Dest"] : [];

    return [
      "No",
      "สินค้า",
      "ชื่อ",
      "หน่วย",
      ...mid,
      "Lot serial.",
      "Expire Date",
      "Lock No.",
      ...lockDestCol,
    ];
  }, [viewMode]);

  if (!transfer && loading) {
    return (
      <div className="dt-tf-mv-container">
        <Loading />
      </div>
    );
  }

  const user = (transfer as any)?.user;
  const userLabel = getUserLabel(user);

  const currentIndex =
    detailList.findIndex((x) => String(x.no) === String(no)) + 1;

  const total = detailList.length;

  const hasNavigator = detailList.length > 0 && currentIndex > 0;

  const handlePrev = () => {
    const idx = detailList.findIndex((x) => String(x.no) === String(no));
    if (idx <= 0) return;

    const prevItem = detailList[idx - 1];

    navigate(`/detail-transfer-movement/${encodeURIComponent(prevItem.no)}`, {
      state: {
        view: "transfer-movement",
        status: navStatus,
        detailList,
        detailTotal: total,
      },
    });
  };

  const handleNext = () => {
    const idx = detailList.findIndex((x) => String(x.no) === String(no));
    if (idx < 0 || idx >= detailList.length - 1) return;

    const nextItem = detailList[idx + 1];

    navigate(`/detail-transfer-movement/${encodeURIComponent(nextItem.no)}`, {
      state: {
        view: "transfer-movement",
        status: navStatus,
        detailList,
        detailTotal: total,
      },
    });
  };

  return (
    <div className="dt-tf-mv-container">
      <div className="dt-tf-mv-header dt-tf-mv-header-with-nav">
        <div className="dt-tf-mv-title">
          MOVE : {String((transfer as any)?.no ?? no ?? "M-XXXXXX")}
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

      <div className="dt-tf-mv-main-layout">
        <div className="dt-tf-mv-meta-panel">
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

          <div className="dt-tf-mv-info-row">
            <div className="dt-tf-mv-info-item">
              <label>เวลาสร้างเอกสาร :</label>
              <span>
                {formatDateTime(asText((transfer as any)?.created_at))}
              </span>
            </div>
          </div>
        </div>

        <div
          className={`dt-tf-mv-scan-sticky-wrap ${
            viewMode === "done" ? "no-sticky" : ""
          }`}
        >
          <div className="dt-tf-mv-scan-panel">
            <div className="dt-tf-mv-scan-row">
  <label>Scan Location</label>

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
      opacity:
        isLocationScanOpen && viewMode !== "done" ? 1 : 0.6,
    }}
  />

  <button
    type="button"
    className={`dt-tf-mv-btn-toggle ${
      isLocationScanOpen ? "active" : ""
    }`}
    onClick={toggleLocationScan}
    disabled={viewMode === "done"}
  >
    {isLocationScanOpen ? (
      <i className="fa-solid fa-xmark" />
    ) : (
      <i className="fa-solid fa-qrcode" />
    )}
  </button>
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
              <div className="dt-tf-mv-scan-spacer" />
            </div>
          </div>
        </div>

        <div className="dt-tf-mv-tabs-section">
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
              ดำเนินการเสร็จสิ้น{" "}
              <span className="dt-tf-mv-badge">{doneCount}</span>
            </button>

            <div className="dt-tf-mv-tab-right">
              <div className="dt-tf-mv-search">
                <i className="fa-solid fa-magnifying-glass dt-tf-mv-search-icon" />
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
        </div>
      </div>

      <br />

      <div className="table__wrapper dt-tf-mv-table-section">
        <Table headers={tableHeaders as any}>
          {sortedItems.length === 0 ? (
            <tr>
              <td colSpan={tableHeaders.length} className="no-data">
                No items found.
              </td>
            </tr>
          ) : (
            sortedItems.map((it: any, index) => {
              const loc = (confirmedLocation?.full_name || "").trim();

              const badPick =
                viewMode === "pick" && loc
                  ? !isAllowedAtPickLocation(it, loc)
                  : false;

              const badPickLockNo =
                viewMode === "pick" && loc
                  ? !isLockNoMatchedWithLocation(it, loc)
                  : false;

              const badPutTemp =
                viewMode === "put" && loc
                  ? !isTempCompatibleForPut(it, loc)
                  : false;

              const complete =
                viewMode === "put" && loc
                  ? isCompleteAtPutLocation(it, loc)
                  : isComplete(it, viewMode);

              const progress =
                viewMode === "put" && loc
                  ? isInProgressAtPutLocation(it, loc)
                  : isInProgress(it, viewMode);

              const isBadRow = badPick || badPickLockNo || badPutTemp;

              const rowClass = [
                isBadRow ? "dt-tf-mv-row-bad" : "",
                !isBadRow && complete ? "dt-tf-mv-row-ok" : "",
                !isBadRow && !complete && progress ? "dt-tf-mv-row-warn" : "",
              ]
                .filter(Boolean)
                .join(" ");

              const qty = n0(it?.qty);
              const qtyPick = n0(it?.qty_pick);
              const qtyPut = n0(it?.qty_put);

              const id = String(it?.id);
              const inputNumber = Boolean(it?.input_number);

              const scannedOnce = scannedIds.has(id);
              const canEditQty =
                inputNumber &&
                viewMode !== "done" &&
                scannedOnce &&
                !badPick &&
                !badPickLockNo &&
                !badPutTemp &&
                Boolean(confirmedLocation?.full_name);

              const qtyPutAtCurrentLocation =
                viewMode === "put" && confirmedLocation?.full_name
                  ? getPutQtyAtLocation(it, confirmedLocation.full_name)
                  : qtyPut;

              const editVal =
                editQtyById[id] ??
                String(
                  viewMode === "pick"
                    ? qtyPick
                    : viewMode === "put"
                      ? qtyPutAtCurrentLocation
                      : qtyPut,
                );

              const saving = savingQtyById[id] === true;

              const QtyCellInput = (
                currentQty: number,
                mode: "pick" | "put",
              ) => {
                if (!inputNumber) return <>{currentQty}</>;

                if (!canEditQty) {
                  return (
                    <input
                      className="dt-tf-mv-qty-input dt-tf-mv-qty-input--locked"
                      value={String(currentQty)}
                      disabled
                      readOnly
                      title={
                        !scannedOnce
                          ? "ต้องสแกนรายการนี้อย่างน้อย 1 ครั้งก่อน ถึงจะแก้จำนวนได้"
                          : badPick || badPickLockNo
                            ? "Location ที่สแกนไม่ตรงกับ Lock Location / Lock No. ของสินค้า"
                            : badPutTemp
                              ? "อุณหภูมิของ Location ไม่ตรงกับสินค้า"
                              : "ไม่สามารถแก้จำนวนได้"
                      }
                    />
                  );
                }

                return (
                  <input
                    className="dt-tf-mv-qty-input"
                    value={editVal}
                    inputMode="numeric"
                    disabled={saving || loading}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d]/g, "");
                      setEditQtyById((p) => ({ ...p, [id]: v }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.stopPropagation();

                        // ✅ กัน blur ยิงซ้ำ
                        skipBlurCommitRef.current[id] = true;

                        commitSetQty(it, n0(editVal));
                        (e.currentTarget as HTMLInputElement).blur();
                        return;
                      }

                      if (e.key === "Escape") {
                        e.preventDefault();
                        e.stopPropagation();

                        skipBlurCommitRef.current[id] = true;
                        setEditQtyById((p) => ({
                          ...p,
                          [id]: String(
                            mode === "pick" ? qtyPick : qtyPutAtCurrentLocation,
                          ),
                        }));
                        (e.currentTarget as HTMLInputElement).blur();
                      }
                    }}
                    onBlur={() => {
                      if (skipBlurCommitRef.current[id]) {
                        skipBlurCommitRef.current[id] = false;
                        return;
                      }

                      const next = n0(editVal);
                      const base =
                        mode === "pick" ? qtyPick : qtyPutAtCurrentLocation;
                      if (next === base) return;

                      commitSetQty(it, next);
                    }}
                  />
                );
              };

              return (
                <tr key={`${String(it?.id)}-${index}`} className={rowClass}>
                  <td>{index + 1}</td>
                  <td style={{ minWidth: 200 }}>{it.code || "--"}</td>
                  <td style={{ minWidth: 200 }}>{it.name || "--"}</td>
                  <td>{it.unit || "--"}</td>

                  {viewMode === "pick" ? (
                    <>
                      <td>{qty}</td>
                      <td>{QtyCellInput(qtyPick, "pick")}</td>
                    </>
                  ) : viewMode === "put" ? (
                    <>
                      <td>{qtyPick}</td>
                      <td>{QtyCellInput(qtyPutAtCurrentLocation, "put")}</td>
                    </>
                  ) : (
                    <>
                      <td>{qty}</td>
                      <td>{qtyPick}</td>
                      <td>{qtyPut}</td>
                    </>
                  )}

                  <td>{it.lot_serial ?? it.lot ?? "--"}</td>
                  <td>{it.exp ? formatDateTime(it.exp) : "--"}</td>

                  <td style={{ minWidth: 220 }}>
                    {it?.lock_no || it?.lock_no_list || "--"}
                  </td>

                  {(viewMode === "put" || viewMode === "done") && (
                    <td style={{ minWidth: 260 }}>
                      {Array.isArray(it?.lock_no_dest_list) &&
                      it.lock_no_dest_list.length > 0 ? (
                        <div className="dt-tf-mv-dest-list">
                          {it.lock_no_dest_list.map((dest: any) => {
                            const isCurrent =
                              confirmedLocation?.full_name &&
                              tokenOnly(dest?.location_name ?? "") ===
                                tokenOnly(confirmedLocation.full_name);

                            return (
                              <div
                                key={`${it.id}-${dest.location_id}`}
                                className={`dt-tf-mv-dest-chip ${isCurrent ? "current" : ""}`}
                              >
                                <span className="dt-tf-mv-dest-name">
                                  {dest?.location_name ?? "-"}
                                </span>
                                <span className="dt-tf-mv-dest-qty">
                                  {n0(dest?.confirmed_put)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        getPutDestSummary(it)
                      )}
                    </td>
                  )}
                </tr>
              );
            })
          )}
        </Table>
      </div>

      <div className="dt-tf-mv-footer">
        <button
          className="dt-tf-mv-btn-cancel"
          onClick={() => navigate("/tf-movement")}
          disabled={loading}
        >
          ย้อนกลับ
        </button>

        {(viewMode !== "done" || isTransferStatusPut) && (
          <button
            className="dt-tf-mv-btn-confirm"
            onClick={handleConfirm}
            disabled={
              loading ||
              (isPutConfirmMode &&
                (!confirmedLocation || !isAllCompleteForPutConfirm))
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

              {pinErr ? (
                <div className="dt-tf-mv-pin-error">{pinErr}</div>
              ) : null}
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
