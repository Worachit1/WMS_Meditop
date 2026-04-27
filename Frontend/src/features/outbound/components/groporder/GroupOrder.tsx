import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import DetailNavigator from "../../../../components/DetailNavigator/DetailNavigator";
import { createPortal } from "react-dom";
import Swal from "sweetalert2";

import {
  batchApi,
  goodsoutApi,
  outboundApi,
} from "../../services/outbound.api";

import type {
  InvoiceData,
  GoodsOutItem,
  BatchItem,
  GoodsOutItemLocationPick,
} from "../../types/outbound.type";

import InvoiceListModal from "../../invoiceslist/InvoiceListModal";

import {
  confirmAlert,
  successAlert,
  warningAlert,
} from "../../../../utils/alert";

import "./grouporder.css";
import { toast } from "react-toastify";

import { socket } from "../../../../services/socket";
import Loading from "../../../../components/Loading/Loading";

type MenuPos = { top: number; left: number };
type ViewMode = "pending" | "done";

type SortKey = "code" | "name" | null;
type SortDir = "asc" | "desc";
type SortState = { key: SortKey; dir: SortDir };

type ConfirmedLocation = { id: number | null; full_name: string };

const getGroupOrderLocStorageKey = (batchName?: string | null) =>
  batchName ? `grouporder_loc_${batchName}` : "";

const normalizeLocationState = (raw: any): ConfirmedLocation | null => {
  const fullName = String(
    raw?.full_name ?? raw?.location_full_name ?? raw?.location_name ?? "",
  ).trim();

  if (!fullName) return null;

  const rawId = raw?.id ?? raw?.location_id ?? null;
  const idNum =
    rawId == null || rawId === "" || Number.isNaN(Number(rawId))
      ? null
      : Number(rawId);

  return {
    id: idNum,
    full_name: fullName,
  };
};

const persistConfirmedLocation = (
  batchName: string | undefined,
  loc: ConfirmedLocation | null,
) => {
  if (!batchName) return;

  const key = getGroupOrderLocStorageKey(batchName);
  if (!key) return;

  if (!loc?.full_name) {
    localStorage.removeItem(key);
    return;
  }

  localStorage.setItem(key, JSON.stringify(loc));
};

const restoreConfirmedLocationFromStorage = (
  batchName: string | undefined,
): ConfirmedLocation | null => {
  if (!batchName) return null;

  const key = getGroupOrderLocStorageKey(batchName);
  if (!key) return null;

  const stored = localStorage.getItem(key);
  if (!stored) return null;

  try {
    return normalizeLocationState(JSON.parse(stored));
  } catch {
    return null;
  }
};

export type LotUpdatedPayload = {
  outbound_no: string;
  goods_out_id: string;
  lot_old: string;
  lot_new: string;
  qty_old: number;
  qty_new: number;
};

type PendingLotAdjustment = {
  outbound_no: string;
  goods_out_id: string;
  adjustment_id: number;
};

type LockLoc = { location_name?: string; qty?: number };

type BatchItemLine = {
  goods_out_item_id: number;
  qty: number;
  pick: number;
  pack: number;
  lot_serial: string | null;
  outbound_no: string;
};

type RtcCandidate = {
  goods_out_item_id: number;
  outbound_no: string;
  code: string;
  name: string;
  lot_serial: string | null;
  qty: number;
  pick: number;
  rtc: number;
  rtc_check: boolean;
};

type RtcModalState = {
  open: boolean;
  item: RtcCandidate | null;
  location_full_name: string;
  barcode_input: string;
  rtc_qty: string;
};

const parseOutboundDate = (value: unknown): Date | null => {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

const getDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const sortInvoicesNewestFirst = (invoices: InvoiceData[]) => {
  return [...invoices].sort((a, b) => {
    const dateA =
      parseOutboundDate(a.created_at) ??
      parseOutboundDate(a.updated_at) ??
      new Date(0);
    const dateB =
      parseOutboundDate(b.created_at) ??
      parseOutboundDate(b.updated_at) ??
      new Date(0);
    return dateB.getTime() - dateA.getTime();
  });
};

const toInvoiceData = (raw: any): InvoiceData | null => {
  const no = String(raw?.no ?? "").trim();
  if (!no) return null;

  return {
    no,
    invoice: String(raw?.invoice ?? "").trim(),
    origin: String(raw?.origin ?? "").trim(),
    outbound_barcode: String(raw?.outbound_barcode ?? ""),
    out_type: String(raw?.out_type ?? ""),
    items: Array.isArray(raw?.items) ? (raw.items as GoodsOutItem[]) : [],
    batch_name: raw?.batch_name ?? null,
    created_at: String(raw?.created_at ?? raw?.date ?? ""),
    updated_at: raw?.updated_at ?? null,
    deleted_at: raw?.deleted_at ?? null,
  };
};

const getBackendPickFromLines = (it: BatchItem) => {
  const lines = Array.isArray((it as any).line_details)
    ? ((it as any).line_details as BatchItemLine[])
    : [];

  if (lines.length === 0) return Number(it.pick ?? 0);

  return lines.reduce((sum, x) => sum + Number(x.pick ?? 0), 0);
};

const GroupOrder = () => {
  const navigate = useNavigate();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const locationInputRef = useRef<HTMLInputElement>(null);
  const itemInputRef = useRef<HTMLInputElement>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<Record<string, HTMLButtonElement | null>>({});

  const [invoiceList, setInvoiceList] = useState<InvoiceData[]>([]);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchTitle, setBatchTitle] = useState<string>("-");
  const [batchRemark, setBatchRemark] = useState<string>("");

  const location = useLocation();

  const [detailList, setDetailList] = useState<Array<{ batch_name: string }>>(
    [],
  );

  const [scanLocation, setScanLocation] = useState("");
  const [confirmedLocation, setConfirmedLocation] =
    useState<ConfirmedLocation | null>(null);

  const [isItemScanActive, setIsItemScanActive] = useState(false);
  const [itemBarcodeInput, setItemBarcodeInput] = useState("");

  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);

  const MENU_WIDTH = 190;
  const MENU_HEIGHT = 90;
  const GAP = 8;

  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [invoiceSearch, setInvoiceSearch] = useState<string>("");
  const [viewMode, _setViewMode] = useState<ViewMode>("pending");

  const [isInvoiceListModalOpen, setIsInvoiceListModalOpen] = useState(false);
  const [_selectedGoodsOutId, setSelectedGoodsOutId] = useState<string | null>(
    null,
  );
  const [selectedItemKey, setSelectedItemKey] = useState<{
    code: string;
    lot_serial: string | null;
  } | null>(null);

  const [lockPickMap, setLockPickMap] = useState<Record<string, number[]>>({});
  const [isLocationScanActive, setIsLocationScanActive] = useState(false);

  const [isInvoicePanelCollapsed, setIsInvoicePanelCollapsed] = useState(() => {
    return localStorage.getItem("grouporder_invoice_panel_collapsed") === "1";
  });

  useEffect(() => {
    localStorage.setItem(
      "grouporder_invoice_panel_collapsed",
      isInvoicePanelCollapsed ? "1" : "0",
    );
  }, [isInvoicePanelCollapsed]);

  const [searchParams] = useSearchParams();
  const batchNameFromUrl = (
    searchParams.get("batchName") ||
    searchParams.get("batch") ||
    ""
  ).trim();
  const isReadOnly = searchParams.get("readonly") === "1";

  const navView =
    (location.state as any)?.view || searchParams.get("view") || "picking";

  const currentBatchKey = useMemo(() => {
    const raw = (
      batchNameFromUrl ||
      batchTitle ||
      resolveLatestBatchNameFrom(invoiceList) ||
      ""
    ).trim();

    return raw || undefined;
  }, [batchNameFromUrl, batchTitle, invoiceList]);

  const [isLockFilterOpen, setIsLockFilterOpen] = useState(false);
  const [lockAll, setLockAll] = useState(true);
  const [selectedLocks, setSelectedLocks] = useState<Set<string>>(new Set());

  const [isReturnMode, _setIsReturnMode] = useState(false);

  const [rtcModal, setRtcModal] = useState<RtcModalState>({
    open: false,
    item: null,
    location_full_name: "",
    barcode_input: "",
    rtc_qty: "",
  });

  const [viewTab, setViewTab] = useState<"pending" | "done" | "rtc">(
    isReadOnly ? "done" : "pending",
  );

  const [selectedReturnTarget, setSelectedReturnTarget] = useState<{
    outbound_no: string;
    goods_out_item_id: number;
    code: string;
    lot_serial: string | null;
    name?: string;
  } | null>(null);

  const normalizeLockNo = (value: string) => {
    return value.replace(/\(จำนวน\s*\d+\)/g, "").trim();
  };

  const normalizeLocName = (value: unknown) => {
    return String(value ?? "")
      .replace(/\(จำนวน\s*\d+\)/g, "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  };

  const toLockList = (v: any): string[] => {
    if (!v) return [];
    if (Array.isArray(v))
      return v.map((x) => String(x ?? "").trim()).filter(Boolean);
    return [String(v).trim()].filter(Boolean);
  };

  const lockOptions = useMemo(() => {
    const set = new Set<string>();
    for (const it of batchItems) {
      const locks = toLockList((it as any).lock_no);
      for (const raw of locks) {
        const clean = normalizeLockNo(raw);
        if (clean) set.add(clean);
      }
    }
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, "th", { numeric: true }),
    );
  }, [batchItems]);

  const [tmpLockAll, setTmpLockAll] = useState(true);
  const [tmpSelectedLocks, setTmpSelectedLocks] = useState<Set<string>>(
    new Set(),
  );

  const openLockFilter = useCallback(() => {
    setTmpLockAll(lockAll);
    setTmpSelectedLocks(new Set(selectedLocks));
    setIsLockFilterOpen(true);
  }, [lockAll, selectedLocks]);

  const closeLockFilter = useCallback(() => {
    setIsLockFilterOpen(false);
  }, []);

  const toggleTmpLock = (lockNo: string) => {
    setTmpSelectedLocks((prev) => {
      const next = new Set(prev);
      if (next.has(lockNo)) next.delete(lockNo);
      else next.add(lockNo);
      return next;
    });
  };

  const applyLockFilter = () => {
    if (tmpLockAll) {
      setLockAll(true);
      setSelectedLocks(new Set());
    } else {
      setLockAll(false);
      setSelectedLocks(new Set(tmpSelectedLocks));
    }
    setIsLockFilterOpen(false);
  };

  const lockFilterLabel = useMemo(() => {
    if (lockAll) return "All";
    const n = selectedLocks.size;
    return n > 0 ? `${n} selected` : "0 selected";
  }, [lockAll, selectedLocks]);

  type LocKey = string;
  type PickByLoc = Record<LocKey, Record<string, number>>;
  const [pickByLoc, setPickByLoc] = useState<PickByLoc>({});

  // const activeLocKey = (confirmedLocation?.full_name || "").trim();

  const getTotalPick = useCallback(
    (rowId: string) => {
      let sum = 0;
      for (const locMap of Object.values(pickByLoc || {})) {
        sum += Number(locMap?.[rowId] ?? 0);
      }
      return sum;
    },
    [pickByLoc],
  );

  const canonicalizeLockTokens = (v: any): string[] => {
    const raw: string[] = Array.isArray(v)
      ? v.map((x) => String(x ?? ""))
      : [String(v ?? "")];

    const tokens = raw
      .flatMap((s) => s.split(/[|,\n]/g))
      .map((s) => normalizeLockNo(String(s).trim()))
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    tokens.sort((a, b) => a.localeCompare(b, "th", { numeric: true }));
    return tokens;
  };

  const stableLockKey = (v: any): string => {
    const tokens = canonicalizeLockTokens(v);
    return tokens.join("|");
  };

  const getRowId = useCallback((it: BatchItem) => {
    const pid = Number(it.product_id ?? 0);
    const lockKey = stableLockKey((it as any).lock_no);
    const lot = String(it.lot_serial ?? "").trim();
    return `${pid}|${lockKey}|${lot}`;
  }, []);

  const getBackendLocationPicks = useCallback((it: BatchItem) => {
    const rows = Array.isArray((it as any).location_picks)
      ? ((it as any).location_picks as GoodsOutItemLocationPick[])
      : [];

    return rows
      .map((x) => ({
        location_id: Number(x.location_id ?? 0),
        location_name: String(x.location_name ?? "").trim(),
        qty_pick: Number(x.qty_pick ?? 0),
      }))
      .filter((x) => x.location_name && x.qty_pick > 0);
  }, []);

  const buildBackendLockPickArray = useCallback(
    (item: BatchItem): number[] => {
      const locks = toLockList((item as any).lock_no);
      if (locks.length === 0) return [];

      const backendLocPicks = getBackendLocationPicks(item);
      const locationPicksTotal = backendLocPicks.reduce(
        (sum, x) => sum + x.qty_pick,
        0,
      );

      const totalPick = Math.max(
        Number(item.pick ?? 0),
        getBackendPickFromLines(item),
        locationPicksTotal,
      );

      if (totalPick === 0) {
        return Array(locks.length).fill(0);
      }
      const arr = Array(locks.length).fill(0);

      for (let i = 0; i < locks.length; i += 1) {
        const lockName = String(locks[i] ?? "").trim();
        const found = backendLocPicks.find(
          (x) =>
            normalizeLocName(x.location_name) === normalizeLocName(lockName),
        );
        arr[i] = Number(found?.qty_pick ?? 0);
      }

      const arrSum = arr.reduce((s: number, v: number) => s + v, 0);
      if (arrSum > totalPick) {
        return Array(locks.length).fill(0);
      }

      // location_picks ไม่มีข้อมูล แต่ item มี pick > 0 → fallback แสดง total
      if (arrSum === 0 && totalPick > 0) {
        // พยายาม match กับ lock_locations เพื่อหา lock ที่น่าจะถูก pick
        const lockLocs = Array.isArray((item as any).lock_locations)
          ? ((item as any).lock_locations as Array<{
              location_name?: string;
              qty?: number;
            }>)
          : [];
        if (lockLocs.length > 0) {
          let remaining = totalPick;
          for (let i = 0; i < locks.length && remaining > 0; i += 1) {
            const lockName = normalizeLocName(locks[i]);
            const loc = lockLocs.find(
              (x) => normalizeLocName(x.location_name) === lockName,
            );
            if (loc) {
              const cap = Math.min(remaining, Number(loc.qty ?? 0));
              if (cap > 0) {
                arr[i] = cap;
                remaining -= cap;
              }
            }
          }
        }
        // ถ้ายัง distribute ไม่หมด → ใส่ที่ lock แรก
        const distributed = arr.reduce((s: number, v: number) => s + v, 0);
        if (distributed < totalPick) {
          arr[0] = totalPick - distributed + arr[0];
        }
      }

      return arr;
    },
    [getBackendLocationPicks],
  );

  const distributeQtyAcrossOutboundLines = (
    item: BatchItem,
    requestedQty: number,
  ) => {
    const lines = getRowLineDetails(item)
      .map((line) => {
        const qty = Math.max(0, Math.floor(Number(line.qty ?? 0)));
        const pick = Math.max(0, Math.floor(Number(line.pick ?? 0)));
        const remaining = Math.max(0, qty - pick);

        return {
          goods_out_item_id: line.goods_out_item_id,
          outbound_no: String(line.outbound_no ?? "").trim(),
          qty,
          pick,
          remaining,
        };
      })
      .filter((line) => line.outbound_no && line.remaining > 0);

    const byOutbound = new Map<
      string,
      Array<{
        goods_out_item_id: number;
        outbound_no: string;
        qty: number;
        pick: number;
        remaining: number;
      }>
    >();

    for (const line of lines) {
      if (!byOutbound.has(line.outbound_no)) {
        byOutbound.set(line.outbound_no, []);
      }
      byOutbound.get(line.outbound_no)!.push(line);
    }

    const outboundRemainings = Array.from(byOutbound.entries()).map(
      ([outbound_no, outboundLines]) => ({
        outbound_no,
        remaining: outboundLines.reduce((sum, x) => sum + x.remaining, 0),
      }),
    );

    let qtyLeft = Math.max(0, Math.floor(Number(requestedQty ?? 0)));
    const result: Array<{ outbound_no: string; qty_input: number }> = [];

    for (const row of outboundRemainings) {
      if (qtyLeft <= 0) break;

      const take = Math.min(qtyLeft, row.remaining);
      if (take > 0) {
        result.push({
          outbound_no: row.outbound_no,
          qty_input: take,
        });
        qtyLeft -= take;
      }
    }

    return {
      requests: result,
      requestedQty: Math.max(0, Math.floor(Number(requestedQty ?? 0))),
      allocatedQty:
        Math.max(0, Math.floor(Number(requestedQty ?? 0))) - qtyLeft,
      unallocatedQty: qtyLeft,
    };
  };

  const getLockPickTotal = useCallback(
    (rowId: string): number => {
      const item = batchItems.find((x) => getRowId(x) === rowId);
      if (!item) return 0;

      const locks = toLockList((item as any).lock_no);
      const arr =
        lockPickMap[rowId] ??
        (locks.length > 1 ? buildBackendLockPickArray(item) : []);

      if (!arr || arr.length === 0) return 0;
      return arr.reduce((acc, v) => acc + Number(v ?? 0), 0);
    },
    [lockPickMap, batchItems, getRowId, buildBackendLockPickArray],
  );

  const getEffectivePick = useCallback(
    (it: BatchItem) => {
      const rowId = getRowId(it);
      const backendPick = getBackendPickFromLines(it);
      const localPick = getTotalPick(rowId);
      const lockPick = getLockPickTotal(rowId);
      return Math.max(backendPick, localPick, lockPick);
    },
    [getTotalPick, getRowId, getLockPickTotal],
  );

  // const getAllLocPicksForRow = useCallback(
  //   (rowId: string) => {
  //     const rows = Object.entries(pickByLoc || {})
  //       .map(([loc, map]) => ({ loc, pick: Number(map?.[rowId] ?? 0) }))
  //       .filter((x) => x.pick > 0);

  //     rows.sort((a, b) => {
  //       const aActive = a.loc === activeLocKey ? 0 : 1;
  //       const bActive = b.loc === activeLocKey ? 0 : 1;
  //       if (aActive !== bActive) return aActive - bActive;
  //       return a.loc.localeCompare(b.loc, "th", { numeric: true });
  //     });

  //     return rows;
  //   },
  //   [pickByLoc, activeLocKey],
  // );

  // const getAllBackendLocPicksForRow = useCallback(
  //   (item: BatchItem) => {
  //     const rows = getBackendLocationPicks(item).map((x) => ({
  //       loc: x.location_name,
  //       pick: x.qty_pick,
  //     }));

  //     rows.sort((a, b) => {
  //       const aActive = a.loc === activeLocKey ? 0 : 1;
  //       const bActive = b.loc === activeLocKey ? 0 : 1;
  //       if (aActive !== bActive) return aActive - bActive;
  //       return a.loc.localeCompare(b.loc, "th", { numeric: true });
  //     });

  //     return rows;
  //   },
  //   [getBackendLocationPicks, activeLocKey],
  // );

  useEffect(() => {
    if (isItemScanActive && itemInputRef.current) itemInputRef.current.focus();
  }, [isItemScanActive]);

  const toTime = (v: any): number => {
    if (!v) return -1;
    const s = String(v).trim();
    if (!s) return -1;

    if (/Z$|[+-]\d{2}:\d{2}$/.test(s)) {
      const t = Date.parse(s);
      return Number.isNaN(t) ? -1 : t;
    }

    const s2 = s.replace(" ", "T") + "+07:00";
    const t2 = Date.parse(s2);
    return Number.isNaN(t2) ? -1 : t2;
  };

  const resolveLatestBatchNameFrom = useCallback(
    (invoices: InvoiceData[]): string | null => {
      if (!invoices?.length) return null;

      let bestName: string | null = null;
      let bestTime = -1;

      for (const inv of invoices) {
        const name = String((inv as any)?.batch_name ?? "").trim();
        if (!name) continue;

        const tCreated = toTime((inv as any)?.created_at);
        const tUpdated = toTime((inv as any)?.updated_at);
        const t = tCreated >= 0 ? tCreated : tUpdated;

        if (t > bestTime) {
          bestTime = t;
          bestName = name;
        }
      }
      return bestName;
    },
    [],
  );

  const loadRecentOutbounds = useCallback(async () => {
    try {
      const response: any = await outboundApi.getOutboundByUser(
        { page: 1, limit: 500 },
        batchNameFromUrl,
      );

      const rows: any[] = Array.isArray(response?.data?.data)
        ? response.data.data
        : [];

      const batchNameFromResponse = String(
        response?.data?.batch_name ?? "",
      ).trim();

      const remarkFromResponse = String(response?.data?.remark ?? "").trim();
      setBatchRemark(remarkFromResponse);

      const withDate = rows
        .map((row) => ({
          row,
          date: parseOutboundDate(
            row?.created_at ?? row?.date ?? row?.updated_at,
          ),
        }))
        .filter((x): x is { row: any; date: Date } => x.date !== null)
        .sort((a, b) => b.date.getTime() - a.date.getTime());

      const latestDateKeys = Array.from(
        new Set(withDate.map((x) => getDateKey(x.date))),
      ).slice(0, 2);

      if (latestDateKeys.length) {
        const recentInvoices = withDate
          .filter((x) => latestDateKeys.includes(getDateKey(x.date)))
          .map((x) => toInvoiceData(x.row))
          .filter((inv): inv is InvoiceData => inv !== null);

        const sorted = sortInvoicesNewestFirst(recentInvoices);
        setInvoiceList(sorted);

        const latestBatch = resolveLatestBatchNameFrom(sorted);
        const initial =
          (
            batchNameFromUrl ||
            batchNameFromResponse ||
            latestBatch ||
            "-"
          ).trim() || "-";
        setBatchTitle(initial);
      } else {
        const initial =
          (batchNameFromUrl || batchNameFromResponse || "-").trim() || "-";
        setBatchTitle(initial);
      }
    } catch (error) {
      console.error("Error loading recent outbound invoices:", error);
    }
  }, [batchNameFromUrl, resolveLatestBatchNameFrom]);

  useEffect(() => {
    loadRecentOutbounds();
  }, [loadRecentOutbounds]);

  useEffect(() => {
    const fetchDetailList = async () => {
      try {
        const resp: any = await batchApi.getBatchByUserPick?.({
          page: 1,
          limit: 5000,
        });

        const rows = Array.isArray(resp?.data?.data)
          ? resp.data.data
          : Array.isArray(resp?.data)
            ? resp.data
            : [];

        const mapped = rows
          .map((x: any) => ({
            batch_name: String(x?.name ?? x?.batch_name ?? "").trim(),
            status: String(x?.status ?? "").trim(),
          }))
          .filter((x: any) => x.batch_name)
          .filter((x: any) => {
            if (isReadOnly) {
              return x.status === "completed";
            }
            return x.status !== "completed";
          })
          .map((x: any) => ({ batch_name: x.batch_name }));

        setDetailList(mapped);
      } catch (error) {
        console.error("Error fetching group order detail list:", error);
        setDetailList([]);
      }
    };

    fetchDetailList();
  }, [isReadOnly]);

  useEffect(() => {
    if (!currentBatchKey) return;
    if (confirmedLocation?.full_name) return;

    const stored = restoreConfirmedLocationFromStorage(currentBatchKey);
    if (!stored?.full_name) return;

    setConfirmedLocation(stored);
    setScanLocation((prev) => prev || stored.full_name);
  }, [currentBatchKey, confirmedLocation]);

  useEffect(() => {
    if (!currentBatchKey) return;
    persistConfirmedLocation(currentBatchKey, confirmedLocation);
  }, [currentBatchKey, confirmedLocation]);

  const onScanLocation = useCallback((_payload: any) => {
    // scan/location ไม่มีการเปลี่ยน DB
    // และ payload เป็นระดับ outbound เดียว
    // ไม่ควรเอามา overwrite batchItems ของทั้ง batch
  }, []);

  useEffect(() => {
    const outboundNos = invoiceList
      .map((x) => String(x?.no ?? "").trim())
      .filter(Boolean);

    if (outboundNos.length === 0) return;

    outboundNos.forEach((no) => {
      socket.emit("join_room", `outbound:${no}`);
    });

    const onScanBarcode = (payload: any) => {
      const lines = Array.isArray(payload?.lines)
        ? payload.lines
        : payload?.matchedLine
          ? [payload.matchedLine]
          : [];

      if (lines.length > 0) {
        setBatchItems((prev) => applyOutboundLinesToBatchRows(prev, lines));
        return;
      }

      loadRecentOutbounds();
    };

    const onConfirmPick = (_payload: any) => {
      loadRecentOutbounds();
    };

    socket.on("outbound:scan_location", onScanLocation);
    socket.on("outbound:scan_pick", onScanBarcode);
    socket.on("outbound:scan_barcode", onScanBarcode);
    socket.on("outbound:scan_return", onScanBarcode);
    socket.on("outbound:confirm_pick", onConfirmPick);
    socket.on("outbound:rtc_adjusted", onConfirmPick);
    socket.on("outbound:rtc_to_inbound", onConfirmPick);
    socket.on("outbound:item_rtc_updated", onConfirmPick);

    return () => {
      socket.off("outbound:scan_location", onScanLocation);
      socket.off("outbound:scan_pick", onScanBarcode);
      socket.off("outbound:scan_barcode", onScanBarcode);
      socket.off("outbound:confirm_pick", onConfirmPick);
      socket.off("outbound:rtc_adjusted", onConfirmPick);
      socket.off("outbound:rtc_to_inbound", onConfirmPick);
      socket.off("outbound:item_rtc_updated", onConfirmPick);
      socket.off("outbound:scan_return", onScanBarcode);

      outboundNos.forEach((no) => {
        socket.emit("leave_room", `outbound:${no}`);
      });
    };
  }, [invoiceList, loadRecentOutbounds, onScanLocation]);

  const normStr = (v: any) => String(v ?? "").trim();
  const normLot = (v: any) => normStr(v);
  const normPid = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const normLockArray = (v: any): string => {
    const tokens = canonicalizeLockTokens(v);
    return tokens.join("|");
  };

  const buildMergeKey = (item: GoodsOutItem) => {
    const pid = normPid(item.product_id);
    const code = normStr(item.code);
    const lot = normLot(item.lot_serial);
    const lock = normLockArray(item.lock_no);
    return `p:${pid}|c:${code}|lot:${lot}|lock:${lock}`;
  };

  const mergeLockLocations = (a: LockLoc[] = [], b: LockLoc[] = []) => {
    const map = new Map<string, { location_name: string; qty: number }>();

    const put = (x: LockLoc) => {
      const nameRaw = String(x?.location_name ?? "").trim();
      if (!nameRaw) return;
      const key = nameRaw.toLowerCase().replace(/\s+/g, " ");
      const prev = map.get(key);
      const addQty = Number(x?.qty ?? 0);
      if (!prev) map.set(key, { location_name: nameRaw, qty: addQty });
      else prev.qty += addQty;
    };

    a.forEach(put);
    b.forEach(put);

    return Array.from(map.values());
  };

  const rebuildBatchItemsFromInvoices = useCallback(
    (invoices: InvoiceData[]) => {
      const mergedMap = new Map<string, any>();

      invoices.forEach((invoice) => {
        invoice.items.forEach((item: GoodsOutItem) => {
          const key = buildMergeKey(item);

          const quantity = Number(item.qty ?? 0);
          const pick = Number(item.pick ?? 0);
          const pack = Number(item.pack ?? 0);

          const incomingLockLocs = Array.isArray((item as any).lock_locations)
            ? ((item as any).lock_locations as LockLoc[])
            : [];

          const lineIdNum = Number(item.id ?? 0);
          const lineId = String(item.id ?? "").trim();

          const lineDetail: BatchItemLine | null =
            lineIdNum > 0
              ? {
                  goods_out_item_id: lineIdNum,
                  qty: quantity,
                  pick,
                  pack,
                  lot_serial: item.lot_serial ?? null,
                  outbound_no: invoice.no,
                }
              : null;

          if (mergedMap.has(key)) {
            const existing = mergedMap.get(key)!;
            existing.quantity += quantity;
            existing.pick = Number(existing.pick ?? 0) + Number(pick ?? 0);
            existing.pack = Number(existing.pack ?? 0) + Number(pack ?? 0);

            const existingLocPicks = Array.isArray(existing.location_picks)
              ? existing.location_picks
              : [];
            const incomingLocPicks = Array.isArray((item as any).location_picks)
              ? (item as any).location_picks
              : [];

            const locMap = new Map<
              string,
              {
                location_id: number;
                location_name: string;
                qty_pick: number;
              }
            >();

            [...existingLocPicks, ...incomingLocPicks].forEach((x: any) => {
              const name = String(x?.location_name ?? "").trim();
              if (!name) return;

              const keyLoc = normalizeLocName(name);
              const prev = locMap.get(keyLoc);

              if (!prev) {
                locMap.set(keyLoc, {
                  location_id: Number(x?.location_id ?? 0),
                  location_name: name,
                  qty_pick: Number(x?.qty_pick ?? 0),
                });
              } else {
                prev.qty_pick += Number(x?.qty_pick ?? 0);
              }
            });

            existing.location_picks = Array.from(locMap.values());

            const ids = new Set<string>(
              Array.isArray(existing.line_ids) ? existing.line_ids : [],
            );
            if (lineId) ids.add(lineId);
            existing.line_ids = Array.from(ids);

            const prevLineDetails: BatchItemLine[] = Array.isArray(
              existing.line_details,
            )
              ? existing.line_details
              : [];

            if (lineDetail) {
              const exists = prevLineDetails.some(
                (x) =>
                  Number(x.goods_out_item_id) === lineDetail.goods_out_item_id,
              );
              if (!exists) prevLineDetails.push(lineDetail);
            }
            existing.line_details = prevLineDetails;

            existing.lock_locations = mergeLockLocations(
              existing.lock_locations || [],
              incomingLockLocs,
            );

            existing.rtc = Math.max(
              Number(existing.rtc ?? 0),
              Number((item as any).rtc ?? 0),
            );
            existing.rtc_check = Boolean(
              existing.rtc_check || (item as any).rtc_check,
            );
          } else {
            mergedMap.set(key, {
              invoice_item_id: Number(item.id),
              outbound_no: invoice.no,
              goods_out_id: String(item.id),

              line_ids: lineId ? [lineId] : [],
              line_details: lineDetail ? [lineDetail] : [],

              product_id: normPid(item.product_id),
              code: normStr(item.code),
              name: item.name,

              lock_no: item.lock_no,
              lock_name: item.lock_name,

              lot_serial: normLot(item.lot_serial),
              lot_no: normLot(item.lot_serial),
              lot_name: normLot(item.lot_serial),

              quantity,
              pick,
              pack,

              batchId: String((item as any).outbound_id ?? ""),

              barcode: item.barcode?.barcode || item.code,
              barcode_text: item.barcode_text ?? item.code,
              sku: item.code,
              input_number: Boolean((item as any).input_number),

              lock_locations: Array.isArray((item as any).lock_locations)
                ? (item as any).lock_locations
                : [],

              location_picks: Array.isArray((item as any).location_picks)
                ? (item as any).location_picks
                : [],

              ...(incomingLockLocs.length
                ? { lock_locations: incomingLockLocs }
                : {}),

              rtc: Number((item as any).rtc ?? 0),
              rtc_check: Boolean((item as any).rtc_check),
            });
          }
        });
      });

      return Array.from(mergedMap.values()) as BatchItem[];
    },
    [],
  );

  const prevBatchKeyRef = useRef<string>("");
  const isLotUpdatingRef = useRef<boolean>(false);
  const prevBatchItemsAllRef = useRef<BatchItem[]>([]);

  const migratePickKeysByRowIdMap = useCallback(
    (oldToNew: Map<string, string>) => {
      if (oldToNew.size === 0) return;

      setPickByLoc((prev) => {
        const next: PickByLoc = { ...prev };

        for (const loc of Object.keys(next)) {
          const locMap = { ...(next[loc] || {}) };

          for (const [oldRowId, newRowId] of oldToNew.entries()) {
            if (!oldRowId || !newRowId || oldRowId === newRowId) continue;

            const v = Number(locMap[oldRowId] ?? 0);
            if (v > 0) {
              locMap[newRowId] = Number(locMap[newRowId] ?? 0) + v;
              delete locMap[oldRowId];
            }
          }

          next[loc] = locMap;
        }

        return next;
      });
    },
    [],
  );

  const getLineIdsOfItem = (it: BatchItem): string[] => {
    const details: BatchItemLine[] = Array.isArray((it as any).line_details)
      ? ((it as any).line_details as BatchItemLine[])
      : [];

    if (details.length > 0) {
      return details
        .map((x) => String(x.goods_out_item_id ?? "").trim())
        .filter(Boolean);
    }

    const ids: string[] = Array.isArray((it as any).line_ids)
      ? (it as any).line_ids
          .map((x: any) => String(x ?? "").trim())
          .filter(Boolean)
      : [String((it as any).goods_out_id ?? "").trim()].filter(Boolean);

    return ids;
  };

  const mergeLocationPicks = (
    rows: Array<{
      location_id?: number | null;
      location_name?: string | null;
      qty_pick?: number | null;
    }>,
  ) => {
    const map = new Map<
      string,
      {
        location_id: number;
        location_name: string;
        qty_pick: number;
      }
    >();

    for (const x of rows || []) {
      const location_name = String(x?.location_name ?? "").trim();
      if (!location_name) continue;

      const key = normalizeLocName(location_name);
      const qty = Number(x?.qty_pick ?? 0);

      if (!map.has(key)) {
        map.set(key, {
          location_id: Number(x?.location_id ?? 0),
          location_name,
          qty_pick: qty,
        });
      } else {
        const prev = map.get(key)!;
        prev.qty_pick += qty;
      }
    }

    return Array.from(map.values());
  };

  const applyOutboundLinesToBatchRows = (
    prev: BatchItem[],
    lines: any[],
  ): BatchItem[] => {
    if (!Array.isArray(lines) || lines.length === 0) return prev;

    return prev.map((row) => {
      const rowLineIds = new Set(getLineIdsOfItem(row));
      const matchedLines = lines.filter((x: any) =>
        rowLineIds.has(String(x?.id ?? "").trim()),
      );

      if (matchedLines.length === 0) return row;

      const aggregatedPick = matchedLines.reduce(
        (sum: number, x: any) => sum + Number(x?.pick ?? 0),
        0,
      );

      const aggregatedLocationPicks = mergeLocationPicks(
        matchedLines.flatMap((x: any) =>
          Array.isArray(x?.location_picks) ? x.location_picks : [],
        ),
      );

      const mergedLocationPicks = mergeLocationPicks([
        ...(((row as any).location_picks ?? []) as any[]),
        ...aggregatedLocationPicks,
      ]);

      return {
        ...row,
        pick: aggregatedPick,
        location_picks: mergedLocationPicks,
        line_details: getRowLineDetails(row).map((detail) => {
          const hit = matchedLines.find(
            (x: any) =>
              Number(x?.id ?? 0) === Number(detail.goods_out_item_id ?? 0),
          );

          if (!hit) return detail;

          return {
            ...detail,
            pick: Math.max(
              0,
              Math.floor(Number(hit?.pick ?? detail.pick ?? 0)),
            ),
          };
        }),
      };
    });
  };

  const getRowLineDetails = (it: BatchItem): BatchItemLine[] => {
    const rows = Array.isArray((it as any).line_details)
      ? ((it as any).line_details as BatchItemLine[])
      : [];

    return rows
      .map((x) => ({
        goods_out_item_id: Number(x.goods_out_item_id ?? 0),
        qty: Math.max(0, Math.floor(Number(x.qty ?? 0))),
        pick: Math.max(0, Math.floor(Number(x.pick ?? 0))),
        pack: Math.max(0, Math.floor(Number(x.pack ?? 0))),
        lot_serial: x.lot_serial ?? null,
        outbound_no: String(x.outbound_no ?? "").trim(),
      }))
      .filter((x) => x.goods_out_item_id > 0);
  };

  // const distributePickAcrossLines = (
  //   item: BatchItem,
  //   totalPick: number,
  // ): Array<{ goods_out_item_id: number; pick: number }> => {
  //   let remaining = Math.max(0, Math.floor(Number(totalPick ?? 0)));
  //   if (remaining <= 0) return [];

  //   const lines = getRowLineDetails(item);
  //   if (lines.length === 0) return [];

  //   const result: Array<{ goods_out_item_id: number; pick: number }> = [];

  //   for (const line of lines) {
  //     if (remaining <= 0) break;

  //     const lineQty = Math.max(0, Math.floor(Number(line.qty ?? 0)));
  //     const linePick = Math.max(0, Math.floor(Number(line.pick ?? 0)));
  //     const lineRemaining = Math.max(0, lineQty - linePick);

  //     if (lineRemaining <= 0) continue;

  //     const applied = Math.min(remaining, lineRemaining);
  //     if (applied > 0) {
  //       result.push({
  //         goods_out_item_id: line.goods_out_item_id,
  //         pick: applied,
  //       });
  //       remaining -= applied;
  //     }
  //   }

  //   return result;
  // };

  // const getLocationPickMapFromLockPick = (
  //   item: BatchItem,
  //   rowId: string,
  // ): Record<string, number> => {
  //   const result: Record<string, number> = {};
  //   const locks = toLockList((item as any).lock_no);
  //   const picks = lockPickMap[rowId] ?? [];

  //   locks.forEach((lockName, idx) => {
  //     const qty = Math.max(0, Math.floor(Number(picks[idx] ?? 0)));
  //     if (qty <= 0) return;

  //     const locName = normalizeLockNo(String(lockName ?? "").trim());
  //     if (!locName) return;

  //     result[locName] = (result[locName] ?? 0) + qty;
  //   });

  //   return result;
  // };

  const buildLineToRowIdMap = (items: BatchItem[]) => {
    const m = new Map<string, string>();
    for (const it of items) {
      const rowId = getRowId(it);
      const ids = getLineIdsOfItem(it);
      for (const id of ids) {
        if (!id) continue;
        if (!m.has(id)) m.set(id, rowId);
      }
    }
    return m;
  };

  useEffect(() => {
    if (!invoiceList.length) {
      setBatchItems([]);
      prevBatchItemsAllRef.current = [];
      return;
    }

    const oldItems = prevBatchItemsAllRef.current || [];
    const rebuilt = rebuildBatchItemsFromInvoices(invoiceList);

    setBatchItems(rebuilt);

    if (oldItems.length > 0) {
      const newlyRtcChecked: string[] = [];
      for (const newItem of rebuilt) {
        if (!Boolean((newItem as any).rtc_check)) continue;
        const oldItem = oldItems.find((o) => getRowId(o) === getRowId(newItem));
        if (oldItem && !Boolean((oldItem as any).rtc_check)) {
          const lines: BatchItemLine[] = Array.isArray(
            (newItem as any).line_details,
          )
            ? (newItem as any).line_details
            : [];
          const nos =
            lines.length > 0
              ? [...new Set(lines.map((l) => l.outbound_no).filter(Boolean))]
              : [(newItem as any).outbound_no ?? ""].filter(Boolean);
          newlyRtcChecked.push(...nos);
        }
      }

      if (newlyRtcChecked.length > 0) {
        const uniqueNos = [...new Set(newlyRtcChecked)];
        Swal.fire({
          icon: "warning",
          title: "มีการ RTC เข้ามาใหม่",
          html: `เลขที่ใบงานต่อไปนี้ถูกเปลี่ยนเป็น RTC แล้ว กรุณากด <b>Return</b>:<br/><br/>${uniqueNos.map((n) => `<b>${n}</b>`).join("<br/>")}`,
          confirmButtonText: "รับทราบ",
        });
      }
    }

    const oldLineToRow = buildLineToRowIdMap(oldItems);
    const newLineToRow = buildLineToRowIdMap(rebuilt);

    const oldToNewRowId = new Map<string, string>();
    for (const [lineId, oldRowId] of oldLineToRow.entries()) {
      const newRowId = newLineToRow.get(lineId);
      if (newRowId && newRowId !== oldRowId) {
        oldToNewRowId.set(oldRowId, newRowId);
      }
    }

    if (oldToNewRowId.size > 0) {
      migratePickKeysByRowIdMap(oldToNewRowId);
    }

    const computedKeyRaw = (
      batchNameFromUrl ||
      resolveLatestBatchNameFrom(invoiceList) ||
      ""
    ).trim();
    const nextBatchKey = computedKeyRaw || prevBatchKeyRef.current || "-";
    const prevBatchKey = prevBatchKeyRef.current || "";

    setBatchTitle(nextBatchKey);

    if (!isLotUpdatingRef.current) {
      if (prevBatchKey && nextBatchKey !== prevBatchKey) {
        setConfirmedLocation(null);
        setScanLocation("");
        setIsLocationScanActive(false);
        setIsItemScanActive(false);
        setPickByLoc({});
        setLockPickMap({});
        setItemBarcodeInput("");
        persistConfirmedLocation(prevBatchKey, null);
      } else {
        setPickByLoc((prev) => {
          let changed = false;
          const next: PickByLoc = {};
          for (const loc of Object.keys(prev)) {
            const locMap = { ...(prev[loc] || {}) };
            for (const rowId of Object.keys(locMap)) {
              const item = rebuilt.find((x) => getRowId(x) === rowId);
              if (!item) continue;
              const backendPick = getBackendPickFromLines(item);
              const localPick = Number(locMap[rowId] ?? 0);
              if (localPick > 0 && backendPick < localPick) {
                delete locMap[rowId];
                changed = true;
              }
            }
            next[loc] = locMap;
          }
          return changed ? next : prev;
        });

        setLockPickMap((prev) => {
          let changed = false;
          const next = { ...prev };

          for (const rowId of Object.keys(next)) {
            const item = rebuilt.find((x) => getRowId(x) === rowId);
            if (!item) continue;

            const backendPick = getBackendPickFromLines(item);
            const localLockTotal = (next[rowId] || []).reduce(
              (sum, v) => sum + Number(v ?? 0),
              0,
            );

            if (localLockTotal > 0 && backendPick < localLockTotal) {
              delete next[rowId];
              changed = true;
            }
          }

          return changed ? next : prev;
        });
      }
    }

    prevBatchKeyRef.current = nextBatchKey;
    prevBatchItemsAllRef.current = rebuilt;
  }, [
    invoiceList,
    rebuildBatchItemsFromInvoices,
    batchNameFromUrl,
    resolveLatestBatchNameFrom,
    migratePickKeysByRowIdMap,
    getRowId,
  ]);

  const pendingLotUpdateRef = useRef<LotUpdatedPayload | null>(null);
  const oldBatchItemsRef = useRef<BatchItem[] | null>(null);

  const migratePickByLocAfterLotChange = useCallback(
    (
      payload: LotUpdatedPayload,
      oldItems: BatchItem[],
      newItems: BatchItem[],
    ) => {
      const lineId = String(payload.goods_out_id || "").trim();
      if (!lineId) return;

      const findRowIdByLine = (items: BatchItem[]) => {
        const hit = items.find((it) => {
          const ids: string[] = Array.isArray((it as any).line_ids)
            ? (it as any).line_ids
            : [String((it as any).goods_out_id ?? "")].filter(Boolean);

          return ids.includes(lineId);
        });

        return hit ? getRowId(hit) : null;
      };

      const oldRowId = findRowIdByLine(oldItems);
      const newRowId = findRowIdByLine(newItems);

      if (!oldRowId || !newRowId || oldRowId === newRowId) return;

      setPickByLoc((prev) => {
        const next: PickByLoc = { ...prev };

        for (const loc of Object.keys(next)) {
          const locMap = { ...(next[loc] || {}) };
          const v = Number(locMap[oldRowId] ?? 0);
          if (v > 0) {
            locMap[newRowId] = Number(locMap[newRowId] ?? 0) + v;
            delete locMap[oldRowId];
            next[loc] = locMap;
          }
        }

        return next;
      });

      setLockPickMap((prev) => {
        const next = { ...prev };
        const oldArr = next[oldRowId];
        if (oldArr && !next[newRowId]) {
          next[newRowId] = oldArr;
          delete next[oldRowId];
        }
        return next;
      });
    },
    [getRowId],
  );

  useEffect(() => {
    const payload = pendingLotUpdateRef.current;
    const oldItems = oldBatchItemsRef.current;

    if (!payload || !oldItems) return;
    if (!batchItems.length) return;

    migratePickByLocAfterLotChange(payload, oldItems, batchItems);

    pendingLotUpdateRef.current = null;
    oldBatchItemsRef.current = null;
    isLotUpdatingRef.current = false;
  }, [batchItems, migratePickByLocAfterLotChange]);

  const toggleSort = (key: Exclude<SortKey, null>) => {
    setSort((prev) => {
      if (prev.key === key)
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      return { key, dir: "asc" };
    });
  };

  const norm = (v: unknown) => (v ?? "").toString().trim().toLowerCase();

  const SortIcon = ({
    active,
    dir,
  }: {
    active: boolean;
    dir: "asc" | "desc";
  }) => {
    if (!active)
      return <i className="fa-solid fa-sort" style={{ opacity: 0.35 }} />;
    return dir === "asc" ? (
      <i className="fa-solid fa-sort-up" />
    ) : (
      <i className="fa-solid fa-sort-down" />
    );
  };

  const toggleLocationFocus = useCallback(() => {
    setIsLocationScanActive((prev) => {
      if (!prev) {
        setScanLocation("");
        setConfirmedLocation(null);
        setIsItemScanActive(false);
        setItemBarcodeInput("");
        persistConfirmedLocation(currentBatchKey, null);

        setTimeout(() => locationInputRef.current?.focus(), 0);
        return true;
      }

      const stored = restoreConfirmedLocationFromStorage(currentBatchKey);
      if (stored?.full_name) {
        setConfirmedLocation(stored);
        setScanLocation(stored.full_name);
      }

      return false;
    });
  }, [currentBatchKey]);

  const closeDropdown = useCallback(() => {
    setOpenDropdownId(null);
    setMenuPos(null);
  }, []);

  const computeAndOpenDropdown = useCallback((rowId: string) => {
    const btn = buttonRef.current[rowId];
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    const menuHeight = dropdownRef.current?.offsetHeight ?? MENU_HEIGHT;
    const menuWidth = dropdownRef.current?.offsetWidth ?? MENU_WIDTH;

    let top = rect.bottom + GAP;
    let left = rect.right - menuWidth;

    if (top + menuHeight > window.innerHeight)
      top = rect.top - menuHeight - GAP;
    if (top < 8) top = 8;

    if (left + menuWidth > window.innerWidth)
      left = window.innerWidth - menuWidth - 8;
    if (left < 8) left = 8;

    setMenuPos({ top, left });
    setOpenDropdownId(rowId);
  }, []);

  const toggleDropdown = useCallback(
    (rowId: string) => {
      if (openDropdownId === rowId) {
        setOpenDropdownId(null);
        setMenuPos(null);
        return;
      }
      computeAndOpenDropdown(rowId);
    },
    [openDropdownId, computeAndOpenDropdown],
  );

  useEffect(() => {
    if (!openDropdownId) return;

    const onMouseDown = (event: MouseEvent) => {
      const menu = dropdownRef.current;
      const btn = buttonRef.current[openDropdownId];
      const target = event.target as Node;

      if (menu && menu.contains(target)) return;
      if (btn && btn.contains(target)) return;

      closeDropdown();
    };

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [openDropdownId, closeDropdown]);

  useEffect(() => {
    if (!openDropdownId) return;
    const onScroll = () => closeDropdown();
    const onResize = () => closeDropdown();

    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [openDropdownId, closeDropdown]);

  useEffect(() => {
    const currentIds = new Set(batchItems.map(getRowId));
    Object.keys(buttonRef.current).forEach((id) => {
      if (!currentIds.has(id)) delete buttonRef.current[id];
    });
  }, [batchItems, getRowId]);

  const handleScanLocationKeyDown = async (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key !== "Enter" && e.key !== "Tab") return;
    e.preventDefault();

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

    const allOutboundNos = [
      ...new Set(
        invoiceList.map((x) => String(x?.no ?? "").trim()).filter(Boolean),
      ),
    ];

    if (allOutboundNos.length === 0) {
      toast.error("ไม่พบรายการ Invoice จาก Batch");
      return;
    }

    // ✅ ยิง scan/location แค่ครั้งเดียว
    // ใช้ใบแรกเป็นตัว validate location ว่ามีอยู่จริงและ backend รับได้
    const targetOutboundNo = allOutboundNos[0];

    try {
      const resp = await goodsoutApi.scanLocation(targetOutboundNo, {
        location_full_name: fullName,
      });

      const locationPayload = resp.data as any;

      const nextLoc =
        normalizeLocationState({
          location_id: locationPayload.location?.location_id,
          location_name: locationPayload.location?.location_name ?? fullName,
        }) ?? normalizeLocationState({ full_name: fullName });

      if (nextLoc?.full_name) {
        setConfirmedLocation(nextLoc);
        setScanLocation(nextLoc.full_name);
        persistConfirmedLocation(currentBatchKey, nextLoc);
      }

      setIsLocationScanActive(false);

      // ✅ สำคัญ: อย่าเอา lines จาก scan/location มา overwrite batchItems
      // เพราะ response นี้เป็นของ outbound เดียว
      // ให้รีโหลด batch เต็มจาก endpoint หลักแทน
      await loadRecentOutbounds();

      toast.success(`ยืนยัน Location: ${nextLoc?.full_name ?? fullName}`);
      setIsItemScanActive(true);
      setTimeout(() => itemInputRef.current?.focus(), 120);
    } catch (err: any) {
      toast.error(err?.message || "ยืนยัน Location ไม่สำเร็จ");
      setConfirmedLocation(null);
      persistConfirmedLocation(currentBatchKey, null);
    }
  };

  const handleDetailClick = (code: string, lot_serial: string | null) => {
    setSelectedItemKey({ code, lot_serial });
    setIsInvoiceListModalOpen(true);
  };

  const handleModalClose = () => {
    setIsInvoiceListModalOpen(false);
    setSelectedGoodsOutId(null);
  };

  const handleInvoiceUpdate = async (payload?: LotUpdatedPayload) => {
    if (payload) {
      pendingLotUpdateRef.current = payload;
      oldBatchItemsRef.current = batchItems;
      isLotUpdatingRef.current = true;
    }

    try {
      await loadRecentOutbounds();
    } catch (err: any) {
      console.error(err);
      isLotUpdatingRef.current = false;
      toast.error(err?.message || "รีเฟรชข้อมูลไม่สำเร็จ");
    }

    // ✅ อัพเดท selectedItemKey หลัง loadRecentOutbounds เสร็จ
    // เพื่อไม่ให้ key ของ InvoiceListModal เปลี่ยนระหว่าง async flow
    if (payload?.lot_new !== undefined) {
      setSelectedItemKey((prev) =>
        prev ? { ...prev, lot_serial: payload.lot_new } : prev,
      );
    }
  };

  const getOutboundIdOfInvoice = (inv: InvoiceData): number => {
    const firstItem: any = Array.isArray(inv?.items) ? inv.items[0] : null;
    const raw = firstItem?.outbound_id ?? firstItem?.outboundId ?? null;

    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  };

  const handleRemoveInvoice = async (inv: InvoiceData) => {
    const outboundId = getOutboundIdOfInvoice(inv);
    if (!outboundId) {
      Swal.fire({
        icon: "warning",
        title: "ลบไม่ได้",
        text: "ไม่พบ outboundId ของ Invoice นี้",
      });
      return;
    }

    const c = await confirmAlert(`ยืนยันลบ Invoice ${inv.no} ?`);
    if (!c.isConfirmed) return;

    try {
      await batchApi.removeByOutboundId(outboundId);
      await successAlert(`ลบ Invoice ${inv.no} สำเร็จ`);
      await loadRecentOutbounds();
    } catch (err: any) {
      toast.error(err?.message || "ลบ Invoice ไม่สำเร็จ");
    }
  };

  const getUserRef = () => {
    const first = (localStorage.getItem("first_name") || "").trim();
    const last = (localStorage.getItem("last_name") || "").trim();
    return `${first} ${last}`.trim();
  };

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

  const getItemLotRule = (it: BatchItem) => {
    const v = (it as any)?.lot_serial;
    const s = v == null ? LOT_NULL_TOKEN : tokenOnly(v);
    return s || LOT_NULL_TOKEN;
  };

  const expToYYMMDD = (d: unknown) => {
    if (!d) return "";
    const dt = new Date(d as any);
    if (Number.isNaN(dt.getTime())) return "";
    const yy = String(dt.getFullYear()).slice(-2);
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${yy}${mm}${dd}`;
  };

  const getItemExpRule = (it: BatchItem) => {
    const v = (it as any)?.exp;
    if (v == null) return EXP_NULL_TOKEN;

    const s = String(v).trim();
    if (/^\d{6}$/.test(s)) return s;

    const yymmdd = expToYYMMDD(v);
    return yymmdd || EXP_NULL_TOKEN;
  };

  const getItemBarcodeDigits = (it: any) =>
    digitsOnly(it?.barcode_text ?? it?.barcode ?? it?.code ?? "");

  type ScanPickResult =
    | { ok: true; item: BatchItem; reason: "OK_STRICT" }
    | {
        ok: false;
        reason: "EMPTY" | "NO_MATCH" | "LOT_EXP_MISMATCH" | "AMBIGUOUS";
        candidates?: Array<{
          code: string;
          lot_serial: any;
          exp: any;
          barcode_digits: string;
          lot_rule: string;
          exp_rule: string;
        }>;
      };

  const pickBatchItemByScan = (scanRaw: string): ScanPickResult => {
    const scanDigits = digitsOnly(scanRaw);
    const scanToken = tokenOnly(scanRaw);

    if (!scanDigits && !scanToken) return { ok: false, reason: "EMPTY" };

    const candidates = batchItems.filter((it: BatchItem) => {
      const b = getItemBarcodeDigits(it);
      return b && scanDigits.includes(b);
    });

    if (candidates.length === 0) return { ok: false, reason: "NO_MATCH" };

    const strictMatched = candidates.filter((it: BatchItem) => {
      const lotRule = getItemLotRule(it);
      const expRule = getItemExpRule(it);
      const lotOk = scanToken.includes(lotRule);
      const expOk = it.exp == null ? true : scanDigits.includes(expRule);

      return lotOk && expOk;
    });

    if (strictMatched.length === 1) {
      return { ok: true, item: strictMatched[0], reason: "OK_STRICT" };
    }

    const info = candidates.map((x) => ({
      code: String(x.code ?? ""),
      lot_serial: (x as any).lot_serial ?? null,
      exp: (x as any).exp ?? null,
      barcode_digits: getItemBarcodeDigits(x),
      lot_rule: getItemLotRule(x),
      exp_rule: getItemExpRule(x),
    }));

    return {
      ok: false,
      reason: strictMatched.length === 0 ? "LOT_EXP_MISMATCH" : "AMBIGUOUS",
      candidates: info,
    };
  };

  const handleItemBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!itemBarcodeInput.trim()) return;

    const raw = normalize(itemBarcodeInput);

    // ถ้าสแกนได้ "ChangeLocation" → เปลี่ยน focus ไป location แทน
    if (raw.toLowerCase() === "changelocation") {
      setItemBarcodeInput("");
      setScanLocation("");
      setConfirmedLocation(null);
      setIsItemScanActive(false);
      setIsLocationScanActive(true);
      persistConfirmedLocation(currentBatchKey, null);
      setTimeout(() => locationInputRef.current?.focus(), 0);
      toast.info("โหมดเปลี่ยน Location: กรุณา Scan Location ใหม่");
      return;
    }

    if (!confirmedLocation) {
      Swal.fire({
        icon: "warning",
        title: "กรุณา Scan Location ก่อน",
        text: "ต้อง Scan Location ก่อนถึงจะสแกนสินค้าได้",
        timer: 1400,
        showConfirmButton: false,
      });
      setItemBarcodeInput("");
      setTimeout(() => locationInputRef.current?.focus(), 120);
      return;
    }

    const allOutboundNos = [
      ...new Set(
        invoiceList.map((x) => String(x?.no ?? "").trim()).filter(Boolean),
      ),
    ];

    if (allOutboundNos.length === 0) {
      toast.error("ไม่พบ outbound สำหรับสแกน");
      setItemBarcodeInput("");
      return;
    }

    const matchResult = pickBatchItemByScan(raw);
    let qtyInput = 1;

    if (matchResult.ok && Boolean((matchResult.item as any).input_number)) {
      const { value: enteredQty, isConfirmed } = await Swal.fire({
        title: "กรอกจำนวน",
        text: `สินค้า: ${matchResult.item.code} - ${matchResult.item.name}`,
        input: "number",
        inputPlaceholder: "กรอกจำนวน",
        inputAttributes: { min: "1", step: "1" },
        showCancelButton: true,
        confirmButtonText: "ยืนยัน",
        cancelButtonText: "ยกเลิก",
        inputValidator: (value) => {
          const n = Number(value);
          if (!value || !Number.isInteger(n) || n <= 0) {
            return "กรุณากรอกจำนวนที่มากกว่า 0";
          }
        },
      });

      if (!isConfirmed || !enteredQty) {
        setItemBarcodeInput("");
        setTimeout(() => itemInputRef.current?.focus(), 120);
        return;
      }

      qtyInput = Number(enteredQty);
    }

    // Determine which outbound to scan: prefer the one that has a matching line with remaining qty
    try {
      if (selectedReturnTarget) {
        await goodsoutApi.scanReturn(selectedReturnTarget.outbound_no, {
          barcode: raw,
          location_full_name: confirmedLocation.full_name,
          qty_input: qtyInput,
        });

        await loadRecentOutbounds();
        setItemBarcodeInput("");
        return;
      }

      if (matchResult.ok) {
        if (isScannedItemLockMismatch(matchResult.item)) {
          await toast.error(
            "สินค้าที่สแกนมี Lock ที่ไม่ตรงกับ Location นี้ อาจทำให้สแกนไม่สำเร็จ",
          );

          setItemBarcodeInput("");
          setTimeout(() => itemInputRef.current?.focus(), 120);
          return;
        }

        const requestedQty = Math.max(1, Math.floor(Number(qtyInput ?? 1)));

        const remainingAtScannedLocation = getScannedLocationRemainingQty(
          matchResult.item,
        );

        if (requestedQty > remainingAtScannedLocation) {
          toast.error(
            `สินค้าใน ${confirmedLocation?.full_name ?? "Location นี้"} มีไม่พอ (เหลือ ${remainingAtScannedLocation})`,
          );
          setItemBarcodeInput("");
          setTimeout(() => itemInputRef.current?.focus(), 120);
          return;
        }

        const split = distributeQtyAcrossOutboundLines(
          matchResult.item,
          requestedQty,
        );

        if (split.requests.length === 0) {
          throw new Error("ไม่พบจำนวนคงเหลือที่สามารถสแกนเพิ่มได้ในทุกใบงาน");
        }

        let lastResp: any = null;

        for (const reqPart of split.requests) {
          lastResp = await goodsoutApi.scanBarcode(reqPart.outbound_no, {
            barcode: raw,
            location_full_name: confirmedLocation.full_name,
            qty_input: reqPart.qty_input,
          });
        }

        if (split.unallocatedQty > 0) {
          toast.warning(
            `ระบบดำเนินการได้ ${split.allocatedQty} จาก ${split.requestedQty} ชิ้น เนื่องจากจำนวนคงเหลือไม่พอ`,
          );
        }

        if (!lastResp) {
          throw new Error("สแกนสินค้าไม่สำเร็จ");
        }
      } else {
        let resp: any = null;
        let lastErr: any = null;

        for (const no of allOutboundNos) {
          try {
            resp = await goodsoutApi.scanBarcode(no, {
              barcode: raw,
              location_full_name: confirmedLocation.full_name,
              qty_input: qtyInput,
            });
            break;
          } catch (err: any) {
            lastErr = err;
          }
        }

        if (!resp) {
          throw lastErr ?? new Error("สแกนสินค้าไม่สำเร็จ");
        }
      }

      await loadRecentOutbounds();
      setItemBarcodeInput("");
    } catch (err: any) {
      toast.error(err?.message || "สแกนสินค้าไม่สำเร็จ");
      setItemBarcodeInput("");
    }
  };

  const isDoneRow = (it: BatchItem) =>
    getEffectivePick(it) >= Number(it.quantity ?? 0);

  const isProgressRow = (it: BatchItem) => {
    const pick = getEffectivePick(it);
    const qty = Number(it.quantity ?? 0);
    return pick > 0 && pick < qty;
  };

  const isScannedItemLockMismatch = useCallback(
    (item: BatchItem) => {
      const scannedLoc = normalizeLocName(
        normalizeLockNo(confirmedLocation?.full_name ?? ""),
      );
      if (!scannedLoc) return false;

      const locks = toLockList((item as any).lock_no)
        .map((x) => normalizeLocName(normalizeLockNo(x)))
        .filter(Boolean);

      // ไม่มี lock ไม่ต้องบล็อกที่ FE
      if (locks.length === 0) return false;

      return !locks.includes(scannedLoc);
    },
    [confirmedLocation],
  );

  const getScannedLocationRemainingQty = useCallback(
    (item: BatchItem) => {
      const scannedLoc = normalizeLocName(
        normalizeLockNo(confirmedLocation?.full_name ?? ""),
      );
      if (!scannedLoc) return 0;

      const lockLocations = Array.isArray((item as any)?.lock_locations)
        ? ((item as any).lock_locations as Array<{
            location_name?: string;
            qty?: number;
          }>)
        : [];

      const matchedLockLoc = lockLocations.find(
        (x) => normalizeLocName(x.location_name) === scannedLoc,
      );

      if (!matchedLockLoc) return 0;

      const totalAtLocation = Math.max(
        0,
        Math.floor(Number(matchedLockLoc.qty ?? 0)),
      );

      const rowId = getRowId(item);
      const locks = toLockList((item as any).lock_no);

      let pickedAtLocation = 0;

      if (locks.length > 1) {
        const pickArr = lockPickMap[rowId] ?? buildBackendLockPickArray(item);
        const lockIdx = locks.findIndex(
          (lockName) =>
            normalizeLocName(normalizeLockNo(lockName)) === scannedLoc,
        );

        pickedAtLocation =
          lockIdx >= 0
            ? Math.max(0, Math.floor(Number(pickArr[lockIdx] ?? 0)))
            : 0;
      } else {
        const backendLocPick = getBackendLocationPicks(item).find(
          (x) => normalizeLocName(x.location_name) === scannedLoc,
        );

        if (backendLocPick) {
          pickedAtLocation = Math.max(
            0,
            Math.floor(Number(backendLocPick.qty_pick ?? 0)),
          );
        } else {
          pickedAtLocation = Math.max(
            0,
            Math.floor(Number(getEffectivePick(item) ?? 0)),
          );
        }
      }

      return Math.max(0, totalAtLocation - pickedAtLocation);
    },
    [
      confirmedLocation,
      getRowId,
      lockPickMap,
      buildBackendLockPickArray,
      getBackendLocationPicks,
      getEffectivePick,
    ],
  );

  const isLockMismatchRow = (it: BatchItem) => {
    const scannedLoc = normalizeLocName(
      normalizeLockNo(confirmedLocation?.full_name ?? ""),
    );
    if (!scannedLoc) return false;

    const lockLocations = Array.isArray((it as any)?.lock_locations)
      ? ((it as any).lock_locations as Array<{
          location_name?: string;
          qty?: number;
        }>)
      : null;

    if (Array.isArray(lockLocations) && lockLocations.length === 0) {
      return true;
    }

    const locks = toLockList((it as any).lock_no)
      .map((x) => normalizeLocName(normalizeLockNo(x)))
      .filter(Boolean);

    if (locks.length === 0) return false;
    return !locks.includes(scannedLoc);
  };

  const filteredRows = useMemo(() => {
    const s = searchFilter.trim().toLowerCase();

    return batchItems.filter((it) => {
      if (!lockAll) {
        const locks = toLockList((it as any).lock_no).map(normalizeLockNo);
        const okLock = locks.some((lk) => selectedLocks.has(lk));
        if (!okLock) return false;
      }

      if (!s) return true;

      const code = (it.code ?? "").toString().toLowerCase();
      const name = (it.name ?? "").toString().toLowerCase();
      const lot = (it.lot_serial ?? it.lot_name ?? "").toString().toLowerCase();
      const lockText = toLockList((it as any).lock_no)
        .join(" ")
        .toLowerCase();

      return (
        code.includes(s) ||
        name.includes(s) ||
        lot.includes(s) ||
        lockText.includes(s)
      );
    });
  }, [batchItems, searchFilter, lockAll, selectedLocks]);

  const pendingCount = filteredRows.filter((x) => !isDoneRow(x)).length;
  const doneCount = filteredRows.filter(isDoneRow).length;

  const rtcCandidates = useMemo<RtcCandidate[]>(() => {
    return batchItems
      .filter((it: any) => Boolean(it?.rtc_check) || Number(it?.rtc ?? 0) > 0)
      .map((it: any) => ({
        goods_out_item_id: Number(it?.invoice_item_id ?? it?.goods_out_id ?? 0),
        outbound_no: String(it?.outbound_no ?? "").trim(),
        code: String(it?.code ?? "").trim(),
        name: String(it?.name ?? "").trim(),
        lot_serial: it?.lot_serial ?? null,
        qty: Number(it?.quantity ?? 0),
        pick: Number(it?.pick ?? 0),
        rtc: Number(it?.rtc ?? 0),
        rtc_check: Boolean(it?.rtc_check),
      }))
      .filter((x) => x.goods_out_item_id > 0 && x.outbound_no);
  }, [batchItems]);

  const rtcRows = useMemo(() => {
    return rtcCandidates.filter((x) => Number(x.rtc ?? 0) > 0);
  }, [rtcCandidates]);

  const viewRows =
    viewTab === "done"
      ? filteredRows.filter(isDoneRow)
      : viewTab === "pending"
        ? filteredRows.filter((x) => !isDoneRow(x))
        : [];

  const sortedBatchItems = useMemo(() => {
    return [...viewRows].sort((a, b) => {
      if (viewMode === "pending") {
        const ra = isProgressRow(a) ? 0 : 1;
        const rb = isProgressRow(b) ? 0 : 1;
        if (ra !== rb) return ra - rb;
      }

      if (!sort.key) return 0;
      const aVal = sort.key === "code" ? norm(a.code) : norm(a.name);
      const bVal = sort.key === "code" ? norm(b.code) : norm(b.name);

      const cmp = aVal.localeCompare(bVal, "th", {
        numeric: true,
        sensitivity: "base",
      });
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [viewRows, viewMode, sort]);

  const pendingLotAdjustments = useMemo<PendingLotAdjustment[]>(() => {
    const map = new Map<number, PendingLotAdjustment>();

    for (const inv of invoiceList) {
      const items = Array.isArray(inv?.items) ? inv.items : [];

      for (const item of items as any[]) {
        const adjustmentId = Number(
          item?.lot_adjustment_id ??
            item?.lotAdjustmentId ??
            item?.lot_adjustment?.id ??
            0,
        );

        const goodsOutId = String(item?.id ?? "").trim();
        const outboundNo = String(inv?.no ?? "").trim();

        const sourceItemId = Number(item?.source_item_id ?? 0);
        const isSplitGenerated = Boolean(item?.is_split_generated ?? false);

        if (!outboundNo || !goodsOutId || !adjustmentId) continue;
        if (isSplitGenerated) continue;
        if (sourceItemId > 0) continue;

        if (!map.has(adjustmentId)) {
          map.set(adjustmentId, {
            outbound_no: outboundNo,
            goods_out_id: goodsOutId,
            adjustment_id: adjustmentId,
          });
        }
      }
    }

    return Array.from(map.values());
  }, [invoiceList]);

  const handleSubmit = async () => {
    if (batchItems.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "แจ้งเตือน",
        text: "ไม่มีรายการสินค้า",
      });
      return;
    }

    const hasAnyBackendPick = batchItems.some(
      (it) => getBackendPickFromLines(it) > 0,
    );

    if (!hasAnyBackendPick) {
      Swal.fire({
        icon: "warning",
        title: "ยังไม่มี pick",
        text: "กรุณาสแกนสินค้าให้มี Pick มากกว่า 0 ก่อน",
      });
      return;
    }

    const result = await confirmAlert("ยืนยันการ Pick ?");
    if (!result.isConfirmed) return;

    try {
      setIsSubmitting(true);

      const user_ref = getUserRef();
      if (!user_ref) {
        warningAlert(
          "ไม่พบชื่อผู้ใช้งาน (first_name/last_name) กรุณา login ใหม่",
        );
        return;
      }

      const byOutbound = new Map<string, BatchItem[]>();

      for (const it of batchItems) {
        const lineDetails = getRowLineDetails(it);
        const outboundNos = [
          ...new Set(
            lineDetails
              .map((d) => String(d.outbound_no ?? "").trim())
              .filter(Boolean),
          ),
        ];

        if (outboundNos.length === 0) {
          const fallbackNo = String(it.outbound_no ?? "").trim();
          if (fallbackNo) outboundNos.push(fallbackNo);
        }

        for (const outboundNo of outboundNos) {
          if (!byOutbound.has(outboundNo)) byOutbound.set(outboundNo, []);
          byOutbound.get(outboundNo)!.push(it);
        }
      }

      for (const [outboundNo, items] of byOutbound.entries()) {
        const locationLineMap = new Map<
          string,
          Array<{ goods_out_item_id: number }>
        >();

        for (const item of items) {
          const backendLocPicks = getBackendLocationPicks(item);
          const lineDetails = getRowLineDetails(item).filter(
            (d) => d.outbound_no === outboundNo,
          );

          for (const locPick of backendLocPicks) {
            const locName = String(locPick.location_name ?? "").trim();
            if (!locName || Number(locPick.qty_pick ?? 0) <= 0) continue;

            const prev = locationLineMap.get(locName) ?? [];

            for (const line of lineDetails) {
              if (Number(line.pick ?? 0) <= 0) continue;

              prev.push({
                goods_out_item_id: line.goods_out_item_id,
              });
            }

            locationLineMap.set(locName, prev);
          }
        }

        const locationsPayload = Array.from(locationLineMap.entries())
          .map(([location_full_name, rawLines]) => {
            const mergedItemIds = new Set<number>();

            for (const line of rawLines) {
              const itemId = Number(line.goods_out_item_id);
              if (itemId) mergedItemIds.add(itemId);
            }

            return {
              location_full_name,
              lines: Array.from(mergedItemIds).map((goods_out_item_id) => ({
                goods_out_item_id: String(goods_out_item_id),
              })),
            };
          })
          .filter((x) => x.lines.length > 0);

        if (locationsPayload.length === 0) continue;

        await goodsoutApi.confirmToStockMulti(outboundNo, {
          user_ref,
          locations: locationsPayload,
        });
      }

      await successAlert("ยืนยันการ Pick สำเร็จ");

      persistConfirmedLocation(currentBatchKey, null);

      const allFullyPicked = batchItems.every((it) => {
        const qty = Number(it.quantity ?? 0);
        if (qty <= 0) return true;
        return getEffectivePick(it) >= qty;
      });

      const currentBatchName =
        batchNameFromUrl ||
        resolveLatestBatchNameFrom(invoiceList) ||
        batchTitle;

      if (allFullyPicked && currentBatchName && currentBatchName !== "-") {
        try {
          await batchApi.updateStatus(currentBatchName, "completed");
        } catch {
          //
        }
      }

      await handleInvoiceUpdate();
      navigate("/outbound");
    } catch (error: any) {
      toast.error(error?.message || "ไม่สามารถยืนยันการ Pick ได้");
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentNavKey = (currentBatchKey || batchNameFromUrl || "").trim();

  const currentIndex =
    detailList.findIndex((x) => x.batch_name === currentNavKey) + 1;

  const total = detailList.length;

  const handlePrev = useCallback(() => {
    const idx = detailList.findIndex((x) => x.batch_name === currentNavKey);
    if (idx <= 0) return;

    const prevItem = detailList[idx - 1];

    navigate(
      `/group-order?batchName=${encodeURIComponent(prevItem.batch_name)}${
        isReadOnly ? "&readonly=1" : ""
      }`,
      {
        state: { view: navView },
      },
    );
  }, [detailList, currentNavKey, navigate, isReadOnly, navView]);

  const handleNext = useCallback(() => {
    const idx = detailList.findIndex((x) => x.batch_name === currentNavKey);
    if (idx < 0 || idx >= detailList.length - 1) return;

    const nextItem = detailList[idx + 1];

    navigate(
      `/group-order?batchName=${encodeURIComponent(nextItem.batch_name)}${
        isReadOnly ? "&readonly=1" : ""
      }`,
      {
        state: { view: navView },
      },
    );
  }, [detailList, currentNavKey, navigate, isReadOnly, navView]);

  return (
    <div className="group-order-container">
      {isSubmitting && <Loading />}
      <div className="groupOrder-topbar">
        <div className="detail-nav-wrap">
          <DetailNavigator
            currentIndex={currentIndex}
            total={total}
            onPrev={handlePrev}
            onNext={handleNext}
            disablePrev={currentIndex <= 1}
            disableNext={currentIndex >= total}
          />
        </div>

        <div className="groupOrder-title-row">
          <div className="groupOrder-topbar-left">
            <div className="groupOrder-title">
              Picking Task : <span className="batch-name">{batchTitle}</span>
            </div>

            <div className="order-meta">
              <div className="meta-item">
                <span className="meta-label">Date :</span>
                <span className="meta-value">
                  {new Date().toLocaleString("th-TH")}
                </span>
              </div>
              <div className="meta-item">
                <span className="meta-label">User :</span>
                <span className="meta-value">{getUserRef() || "-"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className={`content-container ${
          isInvoicePanelCollapsed ? "inv-collapsed" : ""
        }`}
      >
        <div
          className={`invoice-list-panel ${
            isInvoicePanelCollapsed ? "collapsed" : ""
          }`}
        >
          <button
            type="button"
            className="inv-toggle-btn"
            onClick={() => setIsInvoicePanelCollapsed((prev) => !prev)}
            title={
              isInvoicePanelCollapsed
                ? "เปิด Invoice Panel"
                : "ปิด Invoice Panel"
            }
          >
            <i
              className={`fa-solid ${
                isInvoicePanelCollapsed ? "fa-chevron-right" : "fa-chevron-left"
              }`}
            ></i>
          </button>

          <div className="inv-panel-inner">
            <div className="invoice-list-search-wrapper">
              <i className="fa-solid fa-magnifying-glass groupOrder-search-icon"></i>
              <input
                type="text"
                className="groupOrder-search-input"
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                placeholder="Search Doc No. / Invoice / Origin"
              />
            </div>

            <div className="panel-header">
              <span className="panel-title">Doc No. </span>
              <span className="panel-title">Invoice </span>
              <span className="panel-title">Origin </span>
              <span className="total-badge">
                total :{" "}
                {
                  invoiceList.filter((inv) => {
                    const q = invoiceSearch.toLowerCase();
                    return (
                      !q ||
                      (inv.no || "").toLowerCase().includes(q) ||
                      (inv.invoice || "").toLowerCase().includes(q) ||
                      (inv.origin || "").toLowerCase().includes(q)
                    );
                  }).length
                }
              </span>
            </div>

            <div className="list-body">
              {invoiceList
                .filter((inv) => {
                  const q = invoiceSearch.toLowerCase();
                  return (
                    !q ||
                    (inv.no || "").toLowerCase().includes(q) ||
                    (inv.invoice || "").toLowerCase().includes(q) ||
                    (inv.origin || "").toLowerCase().includes(q)
                  );
                })
                .map((inv) => (
                  <div key={inv.no} className="invoice-item">
                    <span>{inv.no}</span>
                    <span>{inv.invoice || "-"}</span>
                    <span>{inv.origin || "-"}</span>

                    {!isReadOnly &&
                      !batchItems.some((it) => getEffectivePick(it) > 0) && (
                        <button
                          type="button"
                          className="invoice-remove-btn"
                          title="ลบ Invoice นี้ออกจาก Batch"
                          onClick={() => handleRemoveInvoice(inv)}
                        >
                          <i className="fa-solid fa-trash"></i>
                        </button>
                      )}
                  </div>
                ))}
            </div>

            {batchRemark && (
              <div
                className="invoice-remark"
                style={{ padding: "8px 12px", fontSize: 13, color: "#555" }}
              >
                <strong>Remark:</strong> {batchRemark}
              </div>
            )}
          </div>
        </div>

        <div className="groupOrder-main-panel">
          {!isReadOnly && (
            <div className="scan-panel-sticky-wrap">
              <div className="scan-panel">
                <div className="scan-row">
                  <div className="scan-label">Scan Location :</div>

                  <input
                    ref={locationInputRef}
                    type="text"
                    className={`scan-input ${confirmedLocation ? "ok" : ""}`}
                    value={scanLocation}
                    onChange={(e) => setScanLocation(e.target.value)}
                    onKeyDown={handleScanLocationKeyDown}
                    placeholder="Scan Location"
                    disabled={!isLocationScanActive}
                  />

                  <button
                    type="button"
                    className={`groupOrder-scan-button ${
                      isLocationScanActive ? "active" : ""
                    }`}
                    title={
                      isLocationScanActive
                        ? "รีเซ็ต Location"
                        : "เปิดสแกน Location"
                    }
                    onClick={toggleLocationFocus}
                  >
                    {isLocationScanActive ? (
                      <i className="fa-solid fa-xmark"></i>
                    ) : (
                      <i className="fa-solid fa-qrcode"></i>
                    )}
                  </button>
                </div>

                <div className="scan-row">
                  <div className="scan-label">
                    {isReturnMode
                      ? "Scan Return Barcode/Serial :"
                      : "Scan Barcode/Serial :"}
                  </div>

                  <form
                    onSubmit={handleItemBarcodeSubmit}
                    className="scan-form"
                    style={{ flex: 1 }}
                  >
                    <input
                      ref={itemInputRef}
                      type="text"
                      className="scan-input"
                      value={itemBarcodeInput}
                      onChange={(e) => setItemBarcodeInput(e.target.value)}
                      placeholder={
                        isReturnMode
                          ? "Scan Barcode/Serial เพื่อคืน Pick"
                          : "Scan Barcode/Serial"
                      }
                      disabled={!confirmedLocation}
                    />
                  </form>
                </div>

                <div
                  className={`scan-hint ${confirmedLocation ? "ok" : ""} ${
                    selectedReturnTarget ? "return-mode" : ""
                  }`}
                >
                  {confirmedLocation
                    ? `${
                        selectedReturnTarget
                          ? `↩️ RETURN: ${selectedReturnTarget.outbound_no}`
                          : "✅ PICK MODE"
                      } : ${confirmedLocation.full_name}`
                    : ""}

                  {selectedReturnTarget && (
                    <button
                      type="button"
                      className="groupOrder-btn-cancel-return"
                      onClick={() => setSelectedReturnTarget(null)}
                    >
                      ยกเลิก Return
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="batch-panel">
            <div
              className="groupOrder-search-wrapper"
              style={{ margin: "10px 0" }}
            >
              <div className="groupOrder-search-input-container">
                <i className="fa-solid fa-magnifying-glass groupOrder-search-icon"></i>
                <input
                  type="text"
                  className="groupOrder-search-input"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Filter Search"
                />
              </div>

              <div className="groupOrder-view-tabs" style={{ marginTop: 10 }}>
                {!isReadOnly && (
                  <button
                    type="button"
                    className={`groupOrder-tab ${viewTab === "pending" ? "active" : ""}`}
                    onClick={() => setViewTab("pending")}
                  >
                    ยังไม่ได้ดำเนินการ{" "}
                    <span className="badge">{pendingCount}</span>
                  </button>
                )}

                <button
                  type="button"
                  className={`groupOrder-tab ${viewTab === "done" ? "active" : ""}`}
                  onClick={() => setViewTab("done")}
                >
                  ดำเนินการเสร็จสิ้นแล้ว{" "}
                  <span className="badge">{doneCount}</span>
                </button>

                {rtcCandidates.length > 0 && (
                  <button
                    type="button"
                    className={`groupOrder-tab ${viewTab === "rtc" ? "active" : ""}`}
                    onClick={() => setViewTab("rtc")}
                  >
                    RTC <span className="badge">{rtcCandidates.length}</span>
                  </button>
                )}
              </div>
            </div>

            {viewTab === "rtc" ? (
              <div className="table-scroll">
                <table className="picking-batch-table">
                  <thead>
                    <tr>
                      <th>No.</th>
                      <th>Outbound</th>
                      <th>สินค้า</th>
                      <th>ชื่อ</th>
                      <th>Lot. Serial</th>
                      <th>QTY</th>
                      <th>RTC</th>
                    </tr>
                  </thead>

                  <tbody>
                    {rtcRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: "center" }}>
                          ไม่มีรายการ RTC
                        </td>
                      </tr>
                    ) : (
                      rtcRows.map((row, index) => (
                        <tr key={`${row.outbound_no}_${row.goods_out_item_id}`}>
                          <td>{index + 1}</td>
                          <td>{row.outbound_no}</td>
                          <td>{row.code}</td>
                          <td>{row.name}</td>
                          <td>{row.lot_serial || "-"}</td>
                          <td>{row.qty}</td>
                          <td>{row.rtc}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="table-scroll">
                <table className="picking-batch-table">
                  <thead>
                    <tr>
                      <th>No.</th>
                      <th>
                        <button
                          type="button"
                          className="th-sort-btn"
                          onClick={() => toggleSort("code")}
                          title="Sort SKU"
                        >
                          สินค้า{" "}
                          <SortIcon
                            active={sort.key === "code"}
                            dir={sort.dir}
                          />
                        </button>
                      </th>
                      <th>
                        <button
                          type="button"
                          className="th-sort-btn"
                          onClick={() => toggleSort("name")}
                          title="Sort ชื่อ"
                        >
                          ชื่อ{" "}
                          <SortIcon
                            active={sort.key === "name"}
                            dir={sort.dir}
                          />
                        </button>
                      </th>
                      <th>QTY</th>
                      <th>Lot. Serial</th>
                      <th>
                        <button
                          type="button"
                          className="th-filter-btn"
                          onClick={openLockFilter}
                          title="Filter Lock No."
                        >
                          Lock No.{" "}
                          <span className="th-filter-badge">
                            {lockFilterLabel}
                          </span>
                          <i
                            className="fa-solid fa-filter"
                            style={{ marginLeft: 6, opacity: 0.7 }}
                          />
                        </button>
                      </th>
                      <th>Pick</th>
                      <th>Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {sortedBatchItems.map((item, index) => {
                      const rowId = getRowId(item);
                      let rowClass = "row-white";
                      if (isLockMismatchRow(item)) rowClass = "row-red";
                      else if (isDoneRow(item)) rowClass = "row-green";
                      else if (isProgressRow(item)) rowClass = "row-yellow";

                      return (
                        <tr key={rowId} className={rowClass}>
                          <td>{index + 1}</td>
                          <td>{item.code}</td>
                          <td>{item.name}</td>

                          <td>{item.quantity}</td>
                          <td>
                            {(item as any).lot_name ?? item.lot_serial ?? "-"}
                          </td>

                          <td>
                            {Array.isArray((item as any).lock_no) ? (
                              (item as any).lock_no.map(
                                (lock: string, idx: number) => (
                                  <div key={idx}>{lock || "-"}</div>
                                ),
                              )
                            ) : (
                              <div>{(item as any).lock_no || "-"}</div>
                            )}
                          </td>

                          <td>
                            {(() => {
                              const locks = toLockList((item as any).lock_no);

                              if (locks.length > 1) {
                                const pickArr =
                                  lockPickMap[rowId] ??
                                  buildBackendLockPickArray(item);

                                // const locBreakdownMulti =
                                //   getAllBackendLocPicksForRow(item);

                                return (
                                  <div>
                                    {locks.map(
                                      (_lock: string, lockIdx: number) => {
                                        const pickVal = Number(
                                          pickArr[lockIdx] ?? 0,
                                        );
                                        return (
                                          <div
                                            key={lockIdx}
                                            className="lock-pick-row"
                                          >
                                            <span className="lock-pick-value">
                                              {pickVal}
                                            </span>
                                          </div>
                                        );
                                      },
                                    )}
                                  </div>
                                );
                              }

                              const singlePick = getEffectivePick(item);
                              return (
                                <div style={{ lineHeight: 1.15 }}>
                                  <span>{singlePick}</span>
                                </div>
                              );
                            })() || "-"}
                          </td>

                          <td className="groupOrder-action-buttons">
                            <div className="grouporder-dropdown-container">
                              <button
                                ref={(el) => {
                                  buttonRef.current[rowId] = el;
                                }}
                                onClick={() => toggleDropdown(rowId)}
                                className="btn-dropdown-toggle"
                                title="เมนูเพิ่มเติม"
                              >
                                <i className="fa-solid fa-ellipsis-vertical"></i>
                              </button>

                              {openDropdownId === rowId &&
                                menuPos &&
                                createPortal(
                                  <div
                                    ref={dropdownRef}
                                    className="grouporder-dropdown-menu"
                                    style={{
                                      top: menuPos.top,
                                      left: menuPos.left,
                                    }}
                                  >
                                    <button
                                      className="grouporder-dropdown-item"
                                      onClick={() => {
                                        handleDetailClick(
                                          String(item.code ?? ""),
                                          item.lot_serial ?? null,
                                        );
                                        closeDropdown();
                                      }}
                                    >
                                      <span className="menu-icon">
                                        <i className="fa-solid fa-circle-info"></i>
                                      </span>
                                      Detail
                                    </button>

                                    {Boolean((item as any).rtc_check) && (
                                      <button
                                        className="grouporder-dropdown-item"
                                        onClick={() => {
                                          setRtcModal({
                                            open: true,
                                            item: {
                                              goods_out_item_id: Number(
                                                (item as any).invoice_item_id ??
                                                  (item as any).goods_out_id ??
                                                  0,
                                              ),
                                              outbound_no: String(
                                                item.outbound_no ?? "",
                                              ).trim(),
                                              code: String(
                                                item.code ?? "",
                                              ).trim(),
                                              name: String(
                                                item.name ?? "",
                                              ).trim(),
                                              lot_serial:
                                                item.lot_serial ?? null,
                                              qty: Number(item.quantity ?? 0),
                                              pick: Number(item.pick ?? 0),
                                              rtc: Number(
                                                (item as any).rtc ?? 0,
                                              ),
                                              rtc_check: Boolean(
                                                (item as any).rtc_check,
                                              ),
                                            },
                                            location_full_name:
                                              confirmedLocation?.full_name ??
                                              "",
                                            barcode_input: "",
                                            rtc_qty: String(
                                              Number((item as any).rtc ?? 0) ||
                                                "",
                                            ),
                                          });
                                          closeDropdown();
                                        }}
                                      >
                                        <span className="menu-icon">
                                          <i className="fa-solid fa-rotate-left"></i>
                                        </span>
                                        Return
                                      </button>
                                    )}
                                  </div>,
                                  document.body,
                                )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="order-footer">
        <button
          className="groupOrder-btn-back"
          onClick={() =>
            navigate(`/outbound?view=${encodeURIComponent(navView)}`)
          }
        >
          กลับหน้า Outbound
        </button>

        {!isReadOnly && !batchItems.some((it) => getEffectivePick(it) > 0) && (
          <button
            className="groupOrder-btn-cancel"
            onClick={async () => {
              const c = await confirmAlert(
                `ยืนยันยกเลิกรายการและทำการลบ ${batchTitle}?`,
              );
              if (!c.isConfirmed) return;

              const bn = (
                resolveLatestBatchNameFrom(invoiceList) ||
                batchTitle ||
                ""
              ).trim();

              if (!bn) {
                warningAlert('ไม่พบ "batch_name" สำหรับลบ batch');
                return;
              }

              try {
                const revertTargets = Array.isArray(pendingLotAdjustments)
                  ? pendingLotAdjustments
                  : [];

                console.log("pendingLotAdjustments =", revertTargets);

                for (const adj of revertTargets) {
                  const outboundNo = String(adj.outbound_no ?? "").trim();
                  const goodsOutId = String(adj.goods_out_id ?? "").trim();
                  const adjustmentId = Number(adj.adjustment_id ?? 0);

                  if (!outboundNo || !goodsOutId || !adjustmentId) continue;

                  console.log("reverting =>", {
                    outboundNo,
                    goodsOutId,
                    adjustmentId,
                  });

                  await goodsoutApi.revertOutboundLotAdjustment(
                    outboundNo,
                    goodsOutId,
                    adjustmentId,
                  );
                }

                await batchApi.remove(bn);

                await successAlert("ยกเลิกรายการและลบ batch สำเร็จ");
                navigate("/batch-inv");
              } catch (err: any) {
                toast.error(err?.message || "ลบ batch ไม่สำเร็จ");
              }
            }}
          >
            ลบ Batch และยกเลิกการ Pick
          </button>
        )}

        {!isReadOnly && (
          <button
            className="groupOrder-btn-submit"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            ยืนยัน
          </button>
        )}
      </div>

      {isLockFilterOpen && (
        <div className="lock-filter-overlay" onMouseDown={closeLockFilter}>
          <div
            className="lock-filter-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="lock-filter-header">
              <div className="lock-filter-title">Filter Lock No.</div>
              <button
                className="lock-filter-x"
                onClick={closeLockFilter}
                type="button"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div className="lock-filter-body">
              <label className="lock-filter-row">
                <input
                  type="checkbox"
                  checked={tmpLockAll}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setTmpLockAll(v);
                    if (v) setTmpSelectedLocks(new Set());
                  }}
                />
                <span>ทั้งหมด (All)</span>
              </label>

              <div
                className={`lock-filter-list ${tmpLockAll ? "disabled" : ""}`}
              >
                {lockOptions.length === 0 ? (
                  <div className="lock-filter-empty">ไม่พบ Lock No.</div>
                ) : (
                  lockOptions.map((lk) => (
                    <label key={lk} className="lock-filter-row">
                      <input
                        type="checkbox"
                        disabled={tmpLockAll}
                        checked={tmpSelectedLocks.has(lk)}
                        onChange={() => toggleTmpLock(lk)}
                      />
                      <span>{lk}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="lock-filter-footer">
              <div style={{ flex: 1 }} />
              <button
                type="button"
                className="lock-filter-btn"
                onClick={applyLockFilter}
              >
                ยืนยัน
              </button>
            </div>
          </div>
        </div>
      )}

      {rtcModal.open && rtcModal.item && (
        <div
          className="lock-filter-overlay"
          onMouseDown={() =>
            setRtcModal((prev) => ({
              ...prev,
              open: false,
            }))
          }
        >
          <div
            className="lock-filter-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="lock-filter-header">
              <div className="lock-filter-title">Return / RTC</div>
              <button
                className="lock-filter-x"
                type="button"
                onClick={() =>
                  setRtcModal((prev) => ({
                    ...prev,
                    open: false,
                  }))
                }
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div className="lock-filter-body">
              <div style={{ marginBottom: 12 }}>
                <strong>{rtcModal.item.code}</strong> - {rtcModal.item.name}
              </div>

              <div style={{ marginBottom: 8 }}>
                Lot: {rtcModal.item.lot_serial || "-"}
              </div>

              <div className="scan-row">
                <div className="scan-label">Scan Location :</div>
                <input
                  type="text"
                  className="scan-input"
                  value={rtcModal.location_full_name}
                  onChange={(e) =>
                    setRtcModal((prev) => ({
                      ...prev,
                      location_full_name: e.target.value,
                    }))
                  }
                  placeholder="Scan Location"
                />
              </div>

              <div className="scan-row">
                <div className="scan-label">Scan Barcode :</div>
                <input
                  type="text"
                  className="scan-input"
                  value={rtcModal.barcode_input}
                  onChange={(e) =>
                    setRtcModal((prev) => ({
                      ...prev,
                      barcode_input: e.target.value,
                    }))
                  }
                  placeholder="Scan Barcode / Serial"
                />
              </div>

              <div className="scan-row">
                <div className="scan-label">RTC Qty :</div>
                <input
                  type="number"
                  min={0}
                  className="scan-input"
                  value={rtcModal.rtc_qty}
                  onChange={(e) =>
                    setRtcModal((prev) => ({
                      ...prev,
                      rtc_qty: e.target.value,
                    }))
                  }
                  placeholder="จำนวน RTC"
                />
              </div>
            </div>

            <div className="lock-filter-footer">
              <div style={{ flex: 1 }} />
              <button
                type="button"
                className="lock-filter-btn"
                onClick={async () => {
                  const target = rtcModal.item;
                  if (!target) return;

                  const locationOk = String(
                    rtcModal.location_full_name || "",
                  ).trim();
                  if (!locationOk) {
                    toast.error("กรุณาสแกน Location");
                    return;
                  }

                  const barcodeScanned = normalize(rtcModal.barcode_input);
                  if (!barcodeScanned) {
                    toast.error("กรุณาสแกนสินค้า");
                    return;
                  }

                  const picked = pickBatchItemByScan(barcodeScanned);
                  if (!picked.ok) {
                    toast.error("ไม่พบสินค้าที่สแกนตรงกับรายการ");
                    return;
                  }

                  const scannedItem = picked.item;
                  const scannedLineIds = getLineIdsOfItem(scannedItem);

                  if (
                    !scannedLineIds.includes(String(target.goods_out_item_id))
                  ) {
                    toast.error("สินค้าที่สแกนไม่ตรงกับรายการที่เลือก Return");
                    return;
                  }

                  const rtcQty = Math.max(
                    0,
                    Math.floor(Number(rtcModal.rtc_qty || 0)),
                  );

                  if (rtcQty <= 0) {
                    toast.error("กรุณาระบุจำนวน RTC มากกว่า 0");
                    return;
                  }

                  await goodsoutApi.updateRtc(target.goods_out_item_id, {
                    rtc: rtcQty,
                  });

                  // อัปเดต invoiceList ทันที ไม่รอ API round-trip
                  setInvoiceList((prev) =>
                    prev.map((inv) => ({
                      ...inv,
                      items: inv.items.map((it: any) =>
                        Number(it.id) === target.goods_out_item_id
                          ? { ...it, rtc: rtcQty, rtc_check: true }
                          : it,
                      ),
                    })),
                  );

                  await successAlert("อัปเดต RTC สำเร็จ");

                  setRtcModal({
                    open: false,
                    item: null,
                    location_full_name: "",
                    barcode_input: "",
                    rtc_qty: "",
                  });

                  await loadRecentOutbounds();
                }}
              >
                ยืนยัน
              </button>
            </div>
          </div>
        </div>
      )}

      <InvoiceListModal
        key={
          selectedItemKey
            ? `${selectedItemKey.code}_${selectedItemKey.lot_serial ?? "no_lot"}`
            : "empty"
        }
        isOpen={isInvoiceListModalOpen}
        onClose={handleModalClose}
        code={selectedItemKey?.code}
        lot_serial={selectedItemKey?.lot_serial}
        onUpdated={(payload?: LotUpdatedPayload) =>
          handleInvoiceUpdate(payload)
        }
        batchName={currentBatchKey ?? ""}
        onChooseReturnTarget={(target) => {
          setSelectedReturnTarget(target);
          setIsInvoiceListModalOpen(false);
          setItemBarcodeInput("");
          setTimeout(() => itemInputRef.current?.focus(), 120);
        }}
      />
    </div>
  );
};

export default GroupOrder;
