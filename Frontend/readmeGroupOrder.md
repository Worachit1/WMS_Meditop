import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
} from "../../types/outbound.type";

import InvoiceListModal from "../../invoiceslist/InvoiceListModal";

import {
  confirmAlert,
  successAlert,
  warningAlert,
} from "../../../../utils/alert";

import "./grouporder.css";
import { toast } from "react-toastify";

type MenuPos = { top: number; left: number };
type ViewMode = "pending" | "done";

type SortKey = "code" | "name" | null;
type SortDir = "asc" | "desc";
type SortState = { key: SortKey; dir: SortDir };

type ConfirmedLocation = { id: number; full_name: string };

// ✅ payload ที่จะถูกส่งกลับมาหลัง “เปลี่ยน Lot”
export type LotUpdatedPayload = {
  outbound_no: string;
  goods_out_id: string; // line id
  lot_old: string;
  lot_new: string;
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
    outbound_barcode: String(raw?.outbound_barcode ?? ""),
    out_type: String(raw?.out_type ?? ""),
    items: Array.isArray(raw?.items) ? (raw.items as GoodsOutItem[]) : [],
    batch_name: raw?.batch_name ?? null,
    created_at: String(raw?.created_at ?? raw?.date ?? ""),
    updated_at: raw?.updated_at ?? null,
    deleted_at: raw?.deleted_at ?? null,
  };
};

const GroupOrder = () => {
  const navigate = useNavigate();

  // ===== Refs =====
  const locationInputRef = useRef<HTMLInputElement>(null);
  const itemInputRef = useRef<HTMLInputElement>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<Record<string, HTMLButtonElement | null>>({});

  // ===== Invoice list =====
  const [invoiceList, setInvoiceList] = useState<InvoiceData[]>([]);

  // ===== Batch items (merged) =====
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchTitle, setBatchTitle] = useState<string>("-");

  // ===== Scan location =====
  const [scanLocation, setScanLocation] = useState("");
  const [confirmedLocation, setConfirmedLocation] =
    useState<ConfirmedLocation | null>(null);

  // ===== Item scan =====
  const [isItemScanActive, setIsItemScanActive] = useState(false);
  const [itemBarcodeInput, setItemBarcodeInput] = useState("");

  // ===== Dropdown =====
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);

  const MENU_WIDTH = 190;
  const MENU_HEIGHT = 90;
  const GAP = 8;

  // ===== Sort/Search/View =====
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("pending");

  // ===== Modal =====
  const [isInvoiceListModalOpen, setIsInvoiceListModalOpen] = useState(false);
  const [_selectedGoodsOutId, setSelectedGoodsOutId] = useState<string | null>(
    null,
  );
  const [selectedItemKey, setSelectedItemKey] = useState<{
    code: string;
    lot_serial: string | null;
  } | null>(null);

  // ===== Edit pick (inline) =====
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editPickValue, setEditPickValue] = useState<string>("");
  const editPickInputRef = useRef<Record<string, HTMLInputElement | null>>({});

  // ===== Scan Location button mode =====
  const [isLocationScanActive, setIsLocationScanActive] = useState(false);

  const [searchParams] = useSearchParams();
  const batchNameFromUrl = (
    searchParams.get("batchName") ||
    searchParams.get("batch") ||
    ""
  ).trim();

  // ===== Lock filter popup =====
  const [isLockFilterOpen, setIsLockFilterOpen] = useState(false);
  const [lockAll, setLockAll] = useState(true);
  const [selectedLocks, setSelectedLocks] = useState<Set<string>>(new Set());

  const normalizeLockNo = (value: string) => {
    return value.replace(/\(จำนวน\s*\d+\)/g, "").trim();
  };
  const toLockList = (v: any): string[] => {
    if (!v) return [];
    if (Array.isArray(v))
      return v.map((x) => String(x ?? "").trim()).filter(Boolean);
    return [String(v).trim()].filter(Boolean);
  };

  // ✅ options จาก batchItems
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

  // temp state popup
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

  // ✅ Multi-location pick store: location_full_name -> rowId -> pick
  type LocKey = string;
  type PickByLoc = Record<LocKey, Record<string, number>>;
  const [pickByLoc, setPickByLoc] = useState<PickByLoc>({});

  const activeLocKey = (confirmedLocation?.full_name || "").trim();

  const getPickAtActiveLoc = useCallback(
    (rowId: string) => {
      if (!activeLocKey) return 0;
      return Number(pickByLoc[activeLocKey]?.[rowId] ?? 0);
    },
    [pickByLoc, activeLocKey],
  );

  const setPickAtActiveLoc = useCallback(
    (rowId: string, nextPick: number) => {
      if (!activeLocKey) return;
      setPickByLoc((prev) => {
        const curr = prev[activeLocKey] || {};
        return { ...prev, [activeLocKey]: { ...curr, [rowId]: nextPick } };
      });
    },
    [activeLocKey],
  );

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

  /* =========================
   * ✅ stable lock key
   * ========================= */
  const canonicalizeLockTokens = (v: any): string[] => {
    const raw: string[] = Array.isArray(v)
      ? v.map((x) => String(x ?? ""))
      : [String(v ?? "")];

    // รองรับ string ที่อาจมี | หรือ , หรือขึ้นบรรทัดใหม่
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
    return tokens.join("|"); // canonical key
  };

  /* =========================
   * Row ID (ยังใช้ lot_serial เพื่อแยก lot)
   * ========================= */
  const getRowId = useCallback((it: BatchItem) => {
    const pid = Number(it.product_id ?? 0);
    const lockKey = stableLockKey((it as any).lock_no);
    const lot = String(it.lot_serial ?? "").trim();
    return `${pid}|${lockKey}|${lot}`;
  }, []);

  const getEffectivePick = useCallback(
    (it: BatchItem) => {
      const rowId = getRowId(it);
      const backendPick = Number(it.pick ?? 0);
      const localPick = getTotalPick(rowId);
      return Math.max(backendPick, localPick);
    },
    [getTotalPick, getRowId],
  );

  const getAllLocPicksForRow = useCallback(
    (rowId: string) => {
      const rows = Object.entries(pickByLoc || {})
        .map(([loc, map]) => ({ loc, pick: Number(map?.[rowId] ?? 0) }))
        .filter((x) => x.pick > 0);

      rows.sort((a, b) => {
        const aActive = a.loc === activeLocKey ? 0 : 1;
        const bActive = b.loc === activeLocKey ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        return a.loc.localeCompare(b.loc, "th", { numeric: true });
      });

      return rows;
    },
    [pickByLoc, activeLocKey],
  );

  /* =========================
   * Focus inputs
   * ========================= */
  useEffect(() => {
    if (isItemScanActive && itemInputRef.current) itemInputRef.current.focus();
  }, [isItemScanActive]);

  /* =========================
   * เวลา + เลือก batch ล่าสุด
   * ========================= */
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
      if (!latestDateKeys.length) return;

      const recentInvoices = withDate
        .filter((x) => latestDateKeys.includes(getDateKey(x.date)))
        .map((x) => toInvoiceData(x.row))
        .filter((inv): inv is InvoiceData => inv !== null);

      const sorted = sortInvoicesNewestFirst(recentInvoices);
      setInvoiceList(sorted);

      const latestBatch = resolveLatestBatchNameFrom(sorted);
      const initial = (batchNameFromUrl || latestBatch || "-").trim() || "-";
      setBatchTitle(initial);
    } catch (error) {
      console.error("Error loading recent outbound invoices:", error);
    }
  }, [batchNameFromUrl, resolveLatestBatchNameFrom]);

  /* =========================
   * ✅ load invoices ตาม batchNameFromUrl
   * ========================= */
  useEffect(() => {
    loadRecentOutbounds();
  }, [loadRecentOutbounds]);

  /* =========================
   * ✅ rebuild batchItems จาก invoiceList (เก็บ line_ids เพื่อ migrate pick)
   * ========================= */
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

  type LockLoc = { location_name?: string; qty?: number };

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

          const incomingLockLocs = Array.isArray((item as any).lock_locations)
            ? ((item as any).lock_locations as LockLoc[])
            : [];

          const lineId = String(item.id ?? "").trim();

          if (mergedMap.has(key)) {
            const existing = mergedMap.get(key)!;
            existing.quantity += quantity;
            existing.pick += pick;

            // ✅ เก็บ line_ids (สำคัญมากเพื่อ migrate pick หลังเปลี่ยน lot)
            const ids = new Set<string>(
              Array.isArray(existing.line_ids) ? existing.line_ids : [],
            );
            if (lineId) ids.add(lineId);
            existing.line_ids = Array.from(ids);

            existing.lock_locations = mergeLockLocations(
              existing.lock_locations || [],
              incomingLockLocs,
            );
          } else {
            mergedMap.set(key, {
              invoice_item_id: Number(item.id),
              outbound_no: invoice.no,
              goods_out_id: String(item.id),

              // ✅ NEW
              line_ids: lineId ? [lineId] : [],

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
              pack: Number(item.pack ?? 0),

              batchId: String((item as any).outbound_id ?? ""),

              barcode: item.barcode?.barcode || item.code,
              barcode_text: item.barcode_text ?? item.code,
              sku: item.code,
              input_number: Boolean((item as any).input_number),

              ...(incomingLockLocs.length
                ? { lock_locations: incomingLockLocs }
                : {}),
            });
          }
        });
      });

      return Array.from(mergedMap.values()) as BatchItem[];
    },
    [],
  );

  /* =========================
   * ✅ กัน reset ตอนเปลี่ยน lot (FIX)
   * ========================= */
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
    const ids: string[] = Array.isArray((it as any).line_ids)
      ? (it as any).line_ids
          .map((x: any) => String(x ?? "").trim())
          .filter(Boolean)
      : [String((it as any).goods_out_id ?? "").trim()].filter(Boolean);

    return ids;
  };

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

    // ✅ re-key pickByLoc หาก rowId ของรายการเดิมเปลี่ยน
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
        setItemBarcodeInput("");
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
  ]);

  /* =========================
   * ✅ Migrate pickByLoc หลัง “เปลี่ยน lot”
   * ========================= */
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

  /* =========================
   * Sort helpers
   * ========================= */
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

        setTimeout(() => locationInputRef.current?.focus(), 0);
        return true;
      }
      return false;
    });
  }, []);

  /* =========================
   * Dropdown helpers
   * ========================= */
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

  /* =========================
   * Scan Location
   * ========================= */
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

    const firstOutboundNo = invoiceList[0]?.no;
    if (!firstOutboundNo) {
      toast.error("ไม่พบรายการ Invoice จาก Batch");
      return;
    }

    try {
      const resp = await goodsoutApi.scanLocation(firstOutboundNo, {
        location_full_name: fullName,
      });
      const payload = resp.data as any;

      const locName = payload.location?.location_name ?? fullName;
      const locId = payload.location?.location_id ?? 0;

      setConfirmedLocation({ id: locId, full_name: locName });
      setScanLocation(locName);

      setIsLocationScanActive(false);

      toast.success(`ยืนยัน Location: ${locName}`);

      setIsItemScanActive(true);
      setTimeout(() => itemInputRef.current?.focus(), 120);
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || "ยืนยัน Location ไม่สำเร็จ",
      );
      setConfirmedLocation(null);
    }
  };

  /* =========================
   * Detail modal
   * ========================= */
  const handleDetailClick = (code: string, lot_serial: string | null) => {
    setSelectedItemKey({ code, lot_serial });
    setIsInvoiceListModalOpen(true);
  };

  const handleModalClose = () => {
    setIsInvoiceListModalOpen(false);
    setSelectedGoodsOutId(null);
  };

  /* =========================
   * ✅ Refresh invoice list (หลังแก้ lot)
   * ========================= */
  const handleInvoiceUpdate = async (payload?: LotUpdatedPayload) => {
    if (payload) {
      // ✅ อัปเดต selectedItemKey ให้ใช้ lot ใหม่
      // เพื่อให้ InvoiceListModal re-fetch ด้วย lot ที่ถูกต้องหลังเปลี่ยน
      if (payload.lot_new !== undefined) {
        setSelectedItemKey((prev) =>
          prev ? { ...prev, lot_serial: payload.lot_new } : prev,
        );
      }
      pendingLotUpdateRef.current = payload;
      oldBatchItemsRef.current = batchItems;
      isLotUpdatingRef.current = true;
    }
    try {
      // ✅ ใช้ loadRecentOutbounds แทน getInvoiceByBarcode เพื่อให้ข้อมูล
      // ผ่าน toInvoiceData normalize อย่างถูกต้อง (เหมือน refresh page)
      // และให้ lock_no / lot_serial ของ item ที่เปลี่ยนแสดงค่าใหม่
      await loadRecentOutbounds();
    } catch (err) {
      console.error(err);
      isLotUpdatingRef.current = false;
      Swal.fire({ icon: "error", title: "รีเฟรชข้อมูลไม่สำเร็จ" });
    }
  };

  const getOutboundIdOfInvoice = (inv: InvoiceData): number => {
    // โดยทั่วไป outbound_id จะอยู่ใน item
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

      // ✅ รีโหลดจาก server ให้ invoice หายจาก list ทันที
      await loadRecentOutbounds();
    } catch (err: any) {
      Swal.fire({
        icon: "error",
        title: "ลบ Invoice ไม่สำเร็จ",
        text: err?.response?.data?.message || "เกิดข้อผิดพลาด",
      });
    }
  };

  const getUserRef = () => {
    const first = (localStorage.getItem("first_name") || "").trim();
    const last = (localStorage.getItem("last_name") || "").trim();
    return `${first} ${last}`.trim();
  };

  /* =========================
   * Inline edit pick
   * ========================= */
  const openInlinePickEdit = useCallback(
    (rowId: string, currentPick: number) => {
      setEditingRowId(rowId);
      setEditPickValue(String(currentPick));

      setTimeout(() => {
        const el = editPickInputRef.current[rowId];
        el?.focus();
        el?.select();
      }, 0);
    },
    [],
  );

  const handlePickEditCancel = () => {
    setEditingRowId(null);
    setEditPickValue("");
  };

  /* =========================
   * จำกัดเพดานตาม lock filter + lock_locations
   * ========================= */
  const getMaxPickLimit = useCallback(
    (it: BatchItem) => {
      const baseQty = Number(it.quantity ?? 0);

      if (lockAll) return baseQty;
      if (!selectedLocks || selectedLocks.size === 0) return 0;

      const lockLocs = Array.isArray((it as any).lock_locations)
        ? ((it as any).lock_locations as Array<{
            location_name?: string;
            qty?: number;
          }>)
        : [];

      if (lockLocs.length === 0) return baseQty;

      const sum = lockLocs.reduce((acc, x) => {
        const name = normalizeLockNo(String(x?.location_name ?? ""));
        if (!name) return acc;
        if (!selectedLocks.has(name)) return acc;
        return acc + Number(x?.qty ?? 0);
      }, 0);

      return Math.min(baseQty, sum);
    },
    [lockAll, selectedLocks],
  );

  const normalizeLocName = (value: unknown) => {
    return String(value ?? "")
      .replace(/\(จำนวน\s*\d+\)/g, "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  };

  const getMaxPickAtLocation = useCallback(
    (it: BatchItem, locFullName: string) => {
      const locKey = normalizeLocName(locFullName);
      if (!locKey) return 0;

      const lockLocs = Array.isArray((it as any).lock_locations)
        ? ((it as any).lock_locations as Array<{
            location_name?: string;
            qty?: number;
          }>)
        : [];

      if (lockLocs.length === 0) return Number.POSITIVE_INFINITY;

      const found = lockLocs.find(
        (x) => normalizeLocName(x?.location_name) === locKey,
      );

      if (!found) return 0;
      return Math.max(0, Number(found?.qty ?? 0));
    },
    [],
  );

  const handlePickEditSave = (rowId: string) => {
    if (!confirmedLocation?.full_name) {
      Swal.fire({
        icon: "warning",
        title: "กรุณา Scan Location ก่อน",
        text: "ต้องสแกน Location ก่อนถึงจะแก้ Pick ได้",
      });
      return;
    }

    const newPick = parseInt(editPickValue, 10);
    if (Number.isNaN(newPick) || newPick < 0) {
      Swal.fire({ icon: "error", title: "กรุณาใส่ตัวเลขที่ถูกต้อง" });
      return;
    }

    const row = batchItems.find((x) => getRowId(x) === rowId);
    if (!row) return;

    const locLimit = getMaxPickAtLocation(row, confirmedLocation.full_name);
    if (Number.isFinite(locLimit) && newPick > locLimit) {
      Swal.fire({
        icon: "warning",
        title: "เกินโควต้า Location นี้",
        text: `Location นี้รับได้สูงสุด ${locLimit}`,
      });
      return;
    }

    const maxQty = getMaxPickLimit(row);

    const currentAtLoc = getPickAtActiveLoc(rowId);
    const totalLocalNow = getTotalPick(rowId);
    const totalWithoutThisLoc = Math.max(0, totalLocalNow - currentAtLoc);

    const backendPick = Number(row.pick ?? 0);
    const effectiveProposed = Math.max(
      backendPick,
      totalWithoutThisLoc + newPick,
    );

    if (effectiveProposed > maxQty) {
      Swal.fire({
        icon: "warning",
        title: "ห้ามเกิน QTY",
        text: lockAll
          ? `Pick รวมทุก Location ต้องไม่เกิน ${maxQty}`
          : `Pick รวมทุก Location ต้องไม่เกิน ${maxQty} (จำกัดตาม Lock ที่เลือก)`,
      });
      return;
    }

    setPickAtActiveLoc(rowId, newPick);

    setEditingRowId(null);
    setEditPickValue("");
    successAlert("แก้ไข Pick สำเร็จแล้ว");
  };

  /* =========================
   * ✅ Scan helpers (เหมือน inboundById)
   * ========================= */
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

  // ===== strict match rules =====
  const LOT_NULL_TOKEN = "XXXXXX";
  const EXP_NULL_TOKEN = "999999";

  // ✅ lot rule: null => XXXXXX, มีค่า => token (เก็บตัวอักษร)
  const getItemLotRule = (it: BatchItem) => {
    const v = (it as any)?.lot_serial;
    const s = v == null ? LOT_NULL_TOKEN : tokenOnly(v);
    return s || LOT_NULL_TOKEN;
  };

  // ✅ exp rule: null => 999999, มีค่า => YYMMDD (6 digits) ให้ match กับ scanDigits
  const expToYYMMDD = (d: unknown) => {
    if (!d) return "";
    const dt = new Date(d as any);
    if (Number.isNaN(dt.getTime())) return "";
    const yy = String(dt.getFullYear()).slice(-2);
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${yy}${mm}${dd}`; // 250703
  };

  const getItemExpRule = (it: BatchItem) => {
    const v = (it as any)?.exp;
    if (v == null) return EXP_NULL_TOKEN;

    // ถ้า backend ส่งมาเป็น "250703" อยู่แล้วก็ใช้ได้เลย
    const s = String(v).trim();
    if (/^\d{6}$/.test(s)) return s;

    const yymmdd = expToYYMMDD(v);
    return yymmdd || EXP_NULL_TOKEN;
  };

  // ✅ barcode หลักของ item: ใช้ barcode_text ก่อน แล้วค่อย fallback barcode/code (digits)
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

    // 1) candidate by barcode digits
    const candidates = batchItems.filter((it: BatchItem) => {
      const b = getItemBarcodeDigits(it);
      return b && scanDigits.includes(b);
    });

    if (candidates.length === 0) return { ok: false, reason: "NO_MATCH" };

    // 2) STRICT: lot_rule อยู่ใน scanToken + exp_rule อยู่ใน scanDigits
    const strictMatched = candidates.filter((it: BatchItem) => {
      const lotRule = getItemLotRule(it); // token
      const expRule = getItemExpRule(it);
      const lotOk = scanToken.includes(lotRule);
      const expOk = it.exp == null ? true : scanDigits.includes(expRule);

      return lotOk && expOk;
    });

    if (strictMatched.length === 1) {
      return { ok: true, item: strictMatched[0], reason: "OK_STRICT" };
    }

    // 0 หรือ >1 = แยกไม่ได้ → ส่ง candidates ไว้ debug
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

  const handleItemBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemBarcodeInput.trim()) return;

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

    const raw = normalize(itemBarcodeInput);
    const picked = pickBatchItemByScan(raw);

    if (!picked.ok) {
      if (picked.reason === "LOT_EXP_MISMATCH") {
        toast.error("Lot/Exp ไม่ตรงกับรายการใน Batch");
        console.log("LOT/EXP MISMATCH scanToken=", tokenOnly(raw));
        console.log("LOT/EXP MISMATCH scanDigits=", digitsOnly(raw));
        console.log("Candidates =", picked.candidates);
      } else if (picked.reason === "AMBIGUOUS") {
        toast.error("ยังแยกรายการไม่ได้ (Lot/Exp อาจไม่พอหรือข้อมูลซ้ำ)");
        console.log("AMBIGUOUS scanToken=", tokenOnly(raw));
        console.log("AMBIGUOUS scanDigits=", digitsOnly(raw));
        console.log("Candidates =", picked.candidates);
      } else if (picked.reason === "NO_MATCH") {
        toast.error("ไม่พบ Barcode ตรงกับสินค้าใน Batch");
      }
      setItemBarcodeInput("");
      return;
    }

    const target = picked.item;
    const rowId = getRowId(target);

    const maxQty = getMaxPickLimit(target);

    const backendPick = Number(target.pick ?? 0);
    const localTotalNow = getTotalPick(rowId);
    const effectiveNow = Math.max(backendPick, localTotalNow);

    if (effectiveNow >= maxQty) {
      setItemBarcodeInput("");
      return;
    }

    const currentAtLoc = getPickAtActiveLoc(rowId);
    const nextAtLoc = currentAtLoc + 1;

    const locLimit = getMaxPickAtLocation(target, confirmedLocation.full_name);
    if (Number.isFinite(locLimit) && nextAtLoc > locLimit) {
      Swal.fire({
        icon: "warning",
        title: "เกินโควต้า Location นี้",
        text: `Location นี้รับได้สูงสุด ${locLimit}`,
        timer: 1100,
        showConfirmButton: false,
      });
      setItemBarcodeInput("");
      return;
    }

    const localTotalProposed =
      Math.max(0, localTotalNow - currentAtLoc) + nextAtLoc;
    const effectiveProposed = Math.max(backendPick, localTotalProposed);

    if (effectiveProposed > maxQty) {
      setItemBarcodeInput("");
      return;
    }

    setPickAtActiveLoc(rowId, nextAtLoc);

    if ((target as any).input_number) {
      openInlinePickEdit(rowId, nextAtLoc);
    }

    setItemBarcodeInput("");
  };

  /* =========================
   * Render helpers
   * ========================= */
  const isDoneRow = (it: BatchItem) =>
    getEffectivePick(it) >= Number(it.quantity ?? 0);

  const isProgressRow = (it: BatchItem) => {
    const pick = getEffectivePick(it);
    const qty = Number(it.quantity ?? 0);
    return pick > 0 && pick < qty;
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

  const viewRows =
    viewMode === "done"
      ? filteredRows.filter(isDoneRow)
      : filteredRows.filter((x) => !isDoneRow(x));

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

  /* =========================
   * Submit Pick
   * ========================= */
  const handleSubmit = async () => {
    if (!confirmedLocation?.full_name) {
      Swal.fire({
        icon: "warning",
        title: "กรุณาสแกน Location ก่อน",
        text: "ต้อง Scan Location ให้ผ่านก่อนถึงจะยืนยันได้",
      });
      return;
    }

    if (batchItems.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "แจ้งเตือน",
        text: "ไม่มีรายการสินค้า",
      });
      return;
    }

    const invalid = batchItems.find((i) => {
      const qty = Number(i.quantity ?? 0);
      const rowId = getRowId(i);
      const pick = getTotalPick(rowId);

      if (!i.outbound_no) return true;
      if (!i.invoice_item_id && !(i as any).goods_out_id) return true;
      if (pick < 0) return true;
      if (pick > qty) return true;
      return false;
    });

    if (invalid) {
      Swal.fire({
        icon: "error",
        title: "ข้อมูลไม่ถูกต้อง",
        text: "พบรายการที่ pick เกิน qty หรือไม่มี outbound_no / id",
      });
      return;
    }

    const hasAnyPick = Object.values(pickByLoc || {}).some((m) =>
      Object.values(m || {}).some((v) => Number(v) > 0),
    );

    if (!hasAnyPick) {
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
      const user_ref = getUserRef();
      if (!user_ref) {
        warningAlert(
          "ไม่พบชื่อผู้ใช้งาน (first_name/last_name) กรุณา login ใหม่",
        );
        return;
      }

      const rowIdToLineId = new Map<string, string>();
      for (const it of batchItems) {
        const rowId = getRowId(it);
        const lineId = String(
          (it as any).invoice_item_id ?? (it as any).goods_out_id ?? "",
        );
        if (lineId) rowIdToLineId.set(rowId, lineId);
      }

      const byOutbound = new Map<string, BatchItem[]>();
      for (const it of batchItems) {
        if (!it.outbound_no) continue;
        if (!byOutbound.has(it.outbound_no)) byOutbound.set(it.outbound_no, []);
        byOutbound.get(it.outbound_no)!.push(it);
      }

      for (const [outboundNo, items] of byOutbound.entries()) {
        const locationsPayload = Object.entries(pickByLoc || {})
          .map(([locFullName, rowPickMap]) => {
            const locName = (locFullName || "").trim();
            if (!locName) return null;

            const validRowIds = new Set(items.map(getRowId));

            const lines = Object.entries(rowPickMap || {})
              .filter(
                ([rowId, pick]) => validRowIds.has(rowId) && Number(pick) > 0,
              )
              .map(([rowId, pick]) => ({
                goods_out_item_id: rowIdToLineId.get(rowId) || "",
                pick: Number(pick),
              }))
              .filter((x) => x.goods_out_item_id && x.pick > 0);

            return { location_full_name: locName, lines };
          })
          .filter(
            (x): x is { location_full_name: string; lines: any[] } =>
              !!x && x.lines.length > 0,
          );

        if (locationsPayload.length === 0) continue;

        for (const loc of locationsPayload) {
          await goodsoutApi.confirmToStock(outboundNo, {
            user_ref,
            location_full_name: loc.location_full_name,
            lines: loc.lines,
          });
        }
      }

      await successAlert("ยืนยันการ Pick สำเร็จ");
      await handleInvoiceUpdate();
      navigate("/outbound");
    } catch (error: any) {
      Swal.fire({
        icon: "error",
        title: "เกิดข้อผิดพลาด",
        text: error?.response?.data?.message || "ไม่สามารถยืนยันการ Pick ได้",
      });
    }
  };

  /* =========================
   * UI
   * ========================= */
  return (
    <div className="group-order-container">
      {/* ===== Header ===== */}
      <div className="groupOrder-topbar">
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

        <div className="groupOrder-topbar-right">
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
                  isLocationScanActive ? "รีเซ็ต Location" : "เปิดสแกน Location"
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
              <div className="scan-label">Scan Barcode/Serial :</div>

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
                  placeholder="Scan Barcode/Serial"
                  disabled={!confirmedLocation}
                />
              </form>
            </div>

            <div className={`scan-hint ${confirmedLocation ? "ok" : ""}`}>
              {confirmedLocation ? `✅ ${confirmedLocation.full_name}` : ""}
            </div>
          </div>
        </div>
      </div>

      <div className="content-container">
        {/* Invoice List */}
        <div className="invoice-list-panel">
          <div className="panel-header">
            <span className="panel-title">Invoice List </span>
            <span className="total-badge">total : {invoiceList.length}</span>
          </div>

          <div className="list-body">
            {invoiceList.map((inv) => (
              <div key={inv.no} className="invoice-item">
                <span>{inv.no}</span>

                <button
                  type="button"
                  className="invoice-remove-btn"
                  title="ลบ Invoice นี้ออกจาก Batch"
                  onClick={() => handleRemoveInvoice(inv)}
                >
                  <i className="fa-solid fa-trash"></i>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Batch Table */}
        <div className="batch-panel">
          <div
            className="groupOrder-search-wrapper"
            style={{ margin: "10px 0" }}
          >
            <label>Search</label>

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
              <button
                type="button"
                className={`groupOrder-tab ${
                  viewMode === "pending" ? "active" : ""
                }`}
                onClick={() => setViewMode("pending")}
              >
                ยังไม่ได้ดำเนินการ <span className="badge">{pendingCount}</span>
              </button>

              <button
                type="button"
                className={`groupOrder-tab ${viewMode === "done" ? "active" : ""}`}
                onClick={() => setViewMode("done")}
              >
                ดำเนินการเสร็จสิ้นแล้ว{" "}
                <span className="badge">{doneCount}</span>
              </button>
            </div>
          </div>

          <div className="panel-header">
            <button className="batch-btn">Batch ID (Inv.+Inv.+...)</button>
            <span className="total-badge">total : {batchItems.length}</span>
          </div>

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
                    SKU <SortIcon active={sort.key === "code"} dir={sort.dir} />
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
                    <SortIcon active={sort.key === "name"} dir={sort.dir} />
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="th-filter-btn"
                    onClick={openLockFilter}
                    title="Filter Lock No."
                  >
                    Lock No.{" "}
                    <span className="th-filter-badge">{lockFilterLabel}</span>
                    <i
                      className="fa-solid fa-filter"
                      style={{ marginLeft: 6, opacity: 0.7 }}
                    />
                  </button>
                </th>
                <th>Lot. Serial</th>
                <th>QTY</th>
                <th>Pick</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {sortedBatchItems.map((item, index) => {
                const rowId = getRowId(item);
                let rowClass = "row-white";
                if (isDoneRow(item)) rowClass = "row-green";
                else if (isProgressRow(item)) rowClass = "row-yellow";

                return (
                  <tr key={rowId} className={rowClass}>
                    <td>{index + 1}</td>
                    <td>{item.code}</td>
                    <td>{item.name}</td>

                    <td>
                      {Array.isArray((item as any).lock_no) ? (
                        (item as any).lock_no.map(
                          (lock: string, idx: number) => (
                            <div key={idx}>{lock}</div>
                          ),
                        )
                      ) : (
                        <div>{(item as any).lock_no}</div>
                      )}
                    </td>

                    <td>{(item as any).lot_name ?? item.lot_serial}</td>
                    <td>{item.quantity}</td>

                    <td>
                      {(() => {
                        const totalPick = getEffectivePick(item);
                        const locBreakdown = getAllLocPicksForRow(rowId);

                        return editingRowId === rowId ? (
                          <div className="edit-qty-container">
                            <input
                              ref={(el) => {
                                editPickInputRef.current[rowId] = el;
                              }}
                              type="number"
                              min={0}
                              max={Number(item.quantity ?? 0)}
                              className="edit-qty-input"
                              value={editPickValue}
                              onChange={(e) => setEditPickValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  handlePickEditSave(rowId);
                                if (e.key === "Escape") handlePickEditCancel();
                              }}
                            />
                            <button
                              className="btn-save-edit"
                              onClick={() => handlePickEditSave(rowId)}
                            >
                              ✓
                            </button>
                            <button
                              className="btn-cancel-edit"
                              onClick={handlePickEditCancel}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div style={{ lineHeight: 1.15 }}>
                            <div style={{ fontWeight: 700 }}>{totalPick}</div>

                            {locBreakdown.length > 0 && (
                              <div
                                style={{
                                  marginTop: 4,
                                  fontSize: 12,
                                  opacity: 0.75,
                                }}
                              >
                                {locBreakdown.map((x) => (
                                  <div key={x.loc}>
                                    ที่ {x.loc}: {x.pick}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
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
                              style={{ top: menuPos.top, left: menuPos.left }}
                            >
                              <button
                                className="grouporder-dropdown-item"
                                onClick={() => {
                                  handleDetailClick(
                                    item.code,
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

                              {(item as any).input_number ? (
                                <button
                                  className="grouporder-dropdown-item"
                                  onClick={() => {
                                    openInlinePickEdit(
                                      rowId,
                                      Number(getTotalPick(rowId)),
                                    );
                                    closeDropdown();
                                  }}
                                >
                                  <span className="menu-icon">
                                    <i className="fa-solid fa-pen-to-square"></i>
                                  </span>
                                  Edit Pick
                                </button>
                              ) : null}

                              <button
                                className="grouporder-dropdown-item"
                                onClick={() => {
                                  if (!confirmedLocation) {
                                    Swal.fire({
                                      icon: "warning",
                                      title: "กรุณา Scan Location ก่อน",
                                      text: "ต้องสแกน Location ก่อนถึงจะสแกนสินค้าได้",
                                      timer: 1400,
                                      showConfirmButton: false,
                                    });
                                    closeDropdown();
                                    setTimeout(
                                      () => locationInputRef.current?.focus(),
                                      120,
                                    );
                                    return;
                                  }
                                  setIsItemScanActive(true);
                                  closeDropdown();
                                  setTimeout(
                                    () => itemInputRef.current?.focus(),
                                    120,
                                  );
                                }}
                              >
                                <span className="menu-icon">
                                  <i className="fa-solid fa-barcode"></i>
                                </span>
                                Scan
                              </button>
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
      </div>

      {/* Footer */}
      <div className="order-footer">
        <button
          className="groupOrder-btn-back"
          onClick={() => navigate("/outbound")}
        >
          กลับหน้า Outbound
        </button>

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
              await batchApi.remove(bn);
              await successAlert("ยกเลิกรายการและลบ batch สำเร็จ");
              navigate("/batch-inv");
            } catch (err: any) {
              Swal.fire({
                icon: "error",
                title: "ลบ batch ไม่สำเร็จ",
                text: err?.response?.data?.message || "เกิดข้อผิดพลาด",
              });
            }
          }}
        >
          ลบ Batch และยกเลิกการ Pick
        </button>

        <button className="groupOrder-btn-submit" onClick={handleSubmit}>
          ยืนยัน
        </button>
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
      />
    </div>
  );
};

export default GroupOrder;




   <div className="inv-panel-inner">
            <div className="panel-header">
              <span className="panel-title">
                Invoice List{" "}
                <span
                  style={{ fontSize: "12px", color: "#666", marginLeft: "5px" }}
                >
                  2วันล่าสุด
                </span>
              </span>
              <span className="total-badge">total : {invoiceList.length}</span>
            </div>

            <div className="list-body">
              {invoiceList.map((inv) => (
                <div key={inv.no} className="invoice-item">
                  <span>{inv.no}</span>
                </div>
              ))}
            </div>
          </div>
        </div>










        import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
} from "../../types/outbound.type";

import InvoiceListModal from "../../invoiceslist/InvoiceListModal";

import {
  confirmAlert,
  successAlert,
  warningAlert,
} from "../../../../utils/alert";

import "./grouporder.css";
import { toast } from "react-toastify";

type MenuPos = { top: number; left: number };
type ViewMode = "pending" | "done";

type SortKey = "code" | "name" | null;
type SortDir = "asc" | "desc";
type SortState = { key: SortKey; dir: SortDir };

type ConfirmedLocation = { id: number; full_name: string };

// ✅ payload ที่จะถูกส่งกลับมาหลัง “เปลี่ยน Lot”
export type LotUpdatedPayload = {
  outbound_no: string;
  goods_out_id: string; // line id
  lot_old: string;
  lot_new: string;
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
    outbound_barcode: String(raw?.outbound_barcode ?? ""),
    out_type: String(raw?.out_type ?? ""),
    items: Array.isArray(raw?.items) ? (raw.items as GoodsOutItem[]) : [],
    batch_name: raw?.batch_name ?? null,
    created_at: String(raw?.created_at ?? raw?.date ?? ""),
    updated_at: raw?.updated_at ?? null,
    deleted_at: raw?.deleted_at ?? null,
  };
};

const GroupOrder = () => {
  const navigate = useNavigate();

  // ===== Refs =====
  const locationInputRef = useRef<HTMLInputElement>(null);
  const itemInputRef = useRef<HTMLInputElement>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<Record<string, HTMLButtonElement | null>>({});

  // ===== Invoice list =====
  const [invoiceList, setInvoiceList] = useState<InvoiceData[]>([]);

  // ===== Batch items (merged) =====
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchTitle, setBatchTitle] = useState<string>("-");

  // ===== Scan location =====
  const [scanLocation, setScanLocation] = useState("");
  const [confirmedLocation, setConfirmedLocation] =
    useState<ConfirmedLocation | null>(null);

  // ===== Item scan =====
  const [isItemScanActive, setIsItemScanActive] = useState(false);
  const [itemBarcodeInput, setItemBarcodeInput] = useState("");

  // ===== Dropdown =====
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);

  const MENU_WIDTH = 190;
  const MENU_HEIGHT = 90;
  const GAP = 8;

  // ===== Sort/Search/View =====
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("pending");

  // ===== Modal =====
  const [isInvoiceListModalOpen, setIsInvoiceListModalOpen] = useState(false);
  const [_selectedGoodsOutId, setSelectedGoodsOutId] = useState<string | null>(
    null,
  );
  const [selectedItemKey, setSelectedItemKey] = useState<{
    code: string;
    lot_serial: string | null;
  } | null>(null);

  // ===== Edit pick (inline) =====
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editPickValue, setEditPickValue] = useState<string>("");
  const editPickInputRef = useRef<Record<string, HTMLInputElement | null>>({});

  // ===== Per-lock pick (manual input per lock_no line) =====
  const [lockPickMap, setLockPickMap] = useState<Record<string, number[]>>({});
  const [editingLockCell, setEditingLockCell] = useState<{
    rowId: string;
    lockIdx: number;
  } | null>(null);
  const [editLockCellValue, setEditLockCellValue] = useState<string>("");
  const editLockCellInputRef = useRef<Record<string, HTMLInputElement | null>>({});

  // ===== Scan Location button mode =====
  const [isLocationScanActive, setIsLocationScanActive] = useState(false);

  const [searchParams] = useSearchParams();
  const batchNameFromUrl = (
    searchParams.get("batchName") ||
    searchParams.get("batch") ||
    ""
  ).trim();

  // ===== Lock filter popup =====
  const [isLockFilterOpen, setIsLockFilterOpen] = useState(false);
  const [lockAll, setLockAll] = useState(true);
  const [selectedLocks, setSelectedLocks] = useState<Set<string>>(new Set());

  const normalizeLockNo = (value: string) => {
    return value.replace(/\(จำนวน\s*\d+\)/g, "").trim();
  };
  const toLockList = (v: any): string[] => {
    if (!v) return [];
    if (Array.isArray(v))
      return v.map((x) => String(x ?? "").trim()).filter(Boolean);
    return [String(v).trim()].filter(Boolean);
  };

  // ✅ options จาก batchItems
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

  // temp state popup
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

  // ✅ Multi-location pick store: location_full_name -> rowId -> pick
  type LocKey = string;
  type PickByLoc = Record<LocKey, Record<string, number>>;
  const [pickByLoc, setPickByLoc] = useState<PickByLoc>({});

  const activeLocKey = (confirmedLocation?.full_name || "").trim();

  const getPickAtActiveLoc = useCallback(
    (rowId: string) => {
      if (!activeLocKey) return 0;
      return Number(pickByLoc[activeLocKey]?.[rowId] ?? 0);
    },
    [pickByLoc, activeLocKey],
  );

  const setPickAtActiveLoc = useCallback(
    (rowId: string, nextPick: number) => {
      if (!activeLocKey) return;
      setPickByLoc((prev) => {
        const curr = prev[activeLocKey] || {};
        return { ...prev, [activeLocKey]: { ...curr, [rowId]: nextPick } };
      });
    },
    [activeLocKey],
  );

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

  /* =========================
   * ✅ stable lock key
   * ========================= */
  const canonicalizeLockTokens = (v: any): string[] => {
    const raw: string[] = Array.isArray(v)
      ? v.map((x) => String(x ?? ""))
      : [String(v ?? "")];

    // รองรับ string ที่อาจมี | หรือ , หรือขึ้นบรรทัดใหม่
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
    return tokens.join("|"); // canonical key
  };

  /* =========================
   * Row ID (ยังใช้ lot_serial เพื่อแยก lot)
   * ========================= */
  const getRowId = useCallback((it: BatchItem) => {
    const pid = Number(it.product_id ?? 0);
    const lockKey = stableLockKey((it as any).lock_no);
    const lot = String(it.lot_serial ?? "").trim();
    return `${pid}|${lockKey}|${lot}`;
  }, []);

  const getLockPickTotal = useCallback(
    (rowId: string): number => {
      const arr = lockPickMap[rowId];
      if (!arr || arr.length === 0) return 0;
      return arr.reduce((acc, v) => acc + Number(v ?? 0), 0);
    },
    [lockPickMap],
  );

  const getEffectivePick = useCallback(
    (it: BatchItem) => {
      const rowId = getRowId(it);
      const backendPick = Number(it.pick ?? 0);
      const localPick = getTotalPick(rowId);
      const lockPick = getLockPickTotal(rowId);
      return Math.max(backendPick, localPick, lockPick);
    },
    [getTotalPick, getRowId, getLockPickTotal],
  );

  const getAllLocPicksForRow = useCallback(
    (rowId: string) => {
      const rows = Object.entries(pickByLoc || {})
        .map(([loc, map]) => ({ loc, pick: Number(map?.[rowId] ?? 0) }))
        .filter((x) => x.pick > 0);

      rows.sort((a, b) => {
        const aActive = a.loc === activeLocKey ? 0 : 1;
        const bActive = b.loc === activeLocKey ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        return a.loc.localeCompare(b.loc, "th", { numeric: true });
      });

      return rows;
    },
    [pickByLoc, activeLocKey],
  );

  /* =========================
   * Focus inputs
   * ========================= */
  useEffect(() => {
    if (isItemScanActive && itemInputRef.current) itemInputRef.current.focus();
  }, [isItemScanActive]);

  /* =========================
   * เวลา + เลือก batch ล่าสุด
   * ========================= */
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
      if (!latestDateKeys.length) return;

      const recentInvoices = withDate
        .filter((x) => latestDateKeys.includes(getDateKey(x.date)))
        .map((x) => toInvoiceData(x.row))
        .filter((inv): inv is InvoiceData => inv !== null);

      const sorted = sortInvoicesNewestFirst(recentInvoices);
      setInvoiceList(sorted);

      const latestBatch = resolveLatestBatchNameFrom(sorted);
      const initial = (batchNameFromUrl || latestBatch || "-").trim() || "-";
      setBatchTitle(initial);
    } catch (error) {
      console.error("Error loading recent outbound invoices:", error);
    }
  }, [batchNameFromUrl, resolveLatestBatchNameFrom]);

  /* =========================
   * ✅ load invoices ตาม batchNameFromUrl
   * ========================= */
  useEffect(() => {
    loadRecentOutbounds();
  }, [loadRecentOutbounds]);

  /* =========================
   * ✅ rebuild batchItems จาก invoiceList (เก็บ line_ids เพื่อ migrate pick)
   * ========================= */
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

  type LockLoc = { location_name?: string; qty?: number };

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

          const incomingLockLocs = Array.isArray((item as any).lock_locations)
            ? ((item as any).lock_locations as LockLoc[])
            : [];

          const lineId = String(item.id ?? "").trim();

          if (mergedMap.has(key)) {
            const existing = mergedMap.get(key)!;
            existing.quantity += quantity;
            existing.pick += pick;

            // ✅ เก็บ line_ids (สำคัญมากเพื่อ migrate pick หลังเปลี่ยน lot)
            const ids = new Set<string>(
              Array.isArray(existing.line_ids) ? existing.line_ids : [],
            );
            if (lineId) ids.add(lineId);
            existing.line_ids = Array.from(ids);

            existing.lock_locations = mergeLockLocations(
              existing.lock_locations || [],
              incomingLockLocs,
            );
          } else {
            mergedMap.set(key, {
              invoice_item_id: Number(item.id),
              outbound_no: invoice.no,
              goods_out_id: String(item.id),

              // ✅ NEW
              line_ids: lineId ? [lineId] : [],

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
              pack: Number(item.pack ?? 0),

              batchId: String((item as any).outbound_id ?? ""),

              barcode: item.barcode?.barcode || item.code,
              barcode_text: item.barcode_text ?? item.code,
              sku: item.code,
              input_number: Boolean((item as any).input_number),

              ...(incomingLockLocs.length
                ? { lock_locations: incomingLockLocs }
                : {}),
            });
          }
        });
      });

      return Array.from(mergedMap.values()) as BatchItem[];
    },
    [],
  );

  /* =========================
   * ✅ กัน reset ตอนเปลี่ยน lot (FIX)
   * ========================= */
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
    const ids: string[] = Array.isArray((it as any).line_ids)
      ? (it as any).line_ids
          .map((x: any) => String(x ?? "").trim())
          .filter(Boolean)
      : [String((it as any).goods_out_id ?? "").trim()].filter(Boolean);

    return ids;
  };

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

    // ✅ re-key pickByLoc หาก rowId ของรายการเดิมเปลี่ยน
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
        setItemBarcodeInput("");
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
  ]);

  /* =========================
   * ✅ Migrate pickByLoc หลัง “เปลี่ยน lot”
   * ========================= */
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

  /* =========================
   * Sort helpers
   * ========================= */
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

        setTimeout(() => locationInputRef.current?.focus(), 0);
        return true;
      }
      return false;
    });
  }, []);

  /* =========================
   * Dropdown helpers
   * ========================= */
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

  /* =========================
   * Scan Location
   * ========================= */
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

    const firstOutboundNo = invoiceList[0]?.no;
    if (!firstOutboundNo) {
      toast.error("ไม่พบรายการ Invoice จาก Batch");
      return;
    }

    try {
      const resp = await goodsoutApi.scanLocation(firstOutboundNo, {
        location_full_name: fullName,
      });
      const payload = resp.data as any;

      const locName = payload.location?.location_name ?? fullName;
      const locId = payload.location?.location_id ?? 0;

      setConfirmedLocation({ id: locId, full_name: locName });
      setScanLocation(locName);

      setIsLocationScanActive(false);

      toast.success(`ยืนยัน Location: ${locName}`);

      setIsItemScanActive(true);
      setTimeout(() => itemInputRef.current?.focus(), 120);
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || "ยืนยัน Location ไม่สำเร็จ",
      );
      setConfirmedLocation(null);
    }
  };

  /* =========================
   * Detail modal
   * ========================= */
  const handleDetailClick = (code: string, lot_serial: string | null) => {
    setSelectedItemKey({ code, lot_serial });
    setIsInvoiceListModalOpen(true);
  };

  const handleModalClose = () => {
    setIsInvoiceListModalOpen(false);
    setSelectedGoodsOutId(null);
  };

  /* =========================
   * ✅ Refresh invoice list (หลังแก้ lot)
   * ========================= */
  const handleInvoiceUpdate = async (payload?: LotUpdatedPayload) => {
    if (payload) {
      // ✅ อัปเดต selectedItemKey ให้ใช้ lot ใหม่
      // เพื่อให้ InvoiceListModal re-fetch ด้วย lot ที่ถูกต้องหลังเปลี่ยน
      if (payload.lot_new !== undefined) {
        setSelectedItemKey((prev) =>
          prev ? { ...prev, lot_serial: payload.lot_new } : prev,
        );
      }
      pendingLotUpdateRef.current = payload;
      oldBatchItemsRef.current = batchItems;
      isLotUpdatingRef.current = true;
    }
    try {
      // ✅ ใช้ loadRecentOutbounds แทน getInvoiceByBarcode เพื่อให้ข้อมูล
      // ผ่าน toInvoiceData normalize อย่างถูกต้อง (เหมือน refresh page)
      // และให้ lock_no / lot_serial ของ item ที่เปลี่ยนแสดงค่าใหม่
      await loadRecentOutbounds();
    } catch (err) {
      console.error(err);
      isLotUpdatingRef.current = false;
      Swal.fire({ icon: "error", title: "รีเฟรชข้อมูลไม่สำเร็จ" });
    }
  };

  const getOutboundIdOfInvoice = (inv: InvoiceData): number => {
    // โดยทั่วไป outbound_id จะอยู่ใน item
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

      // ✅ รีโหลดจาก server ให้ invoice หายจาก list ทันที
      await loadRecentOutbounds();
    } catch (err: any) {
      Swal.fire({
        icon: "error",
        title: "ลบ Invoice ไม่สำเร็จ",
        text: err?.response?.data?.message || "เกิดข้อผิดพลาด",
      });
    }
  };

  const getUserRef = () => {
    const first = (localStorage.getItem("first_name") || "").trim();
    const last = (localStorage.getItem("last_name") || "").trim();
    return `${first} ${last}`.trim();
  };

  /* =========================
   * Inline edit pick
   * ========================= */
  const openInlinePickEdit = useCallback(
    (rowId: string, currentPick: number) => {
      setEditingRowId(rowId);
      setEditPickValue(String(currentPick));

      setTimeout(() => {
        const el = editPickInputRef.current[rowId];
        el?.focus();
        el?.select();
      }, 0);
    },
    [],
  );

  const handlePickEditCancel = () => {
    setEditingRowId(null);
    setEditPickValue("");
  };

  /* =========================
   * Per-lock pick edit helpers
   * ========================= */
  const openLockPickEdit = useCallback(
    (rowId: string, lockIdx: number) => {
      setEditingLockCell({ rowId, lockIdx });
      const current = lockPickMap[rowId]?.[lockIdx] ?? 0;
      setEditLockCellValue(String(current));
      const key = `${rowId}__${lockIdx}`;
      setTimeout(() => {
        const el = editLockCellInputRef.current[key];
        el?.focus();
        el?.select();
      }, 0);
    },
    [lockPickMap],
  );

  const cancelLockPickEdit = useCallback(() => {
    setEditingLockCell(null);
    setEditLockCellValue("");
  }, []);

  const saveLockPickEdit = useCallback(
    (rowId: string, lockIdx: number, item: BatchItem) => {
      const newVal = parseInt(editLockCellValue, 10);
      if (Number.isNaN(newVal) || newVal < 0) {
        Swal.fire({ icon: "error", title: "กรุณาใส่ตัวเลขที่ถูกต้อง" });
        return;
      }
      const locks = toLockList((item as any).lock_no);
      const prevArr = lockPickMap[rowId] ?? Array(locks.length).fill(0);
      const updated = [...prevArr];
      while (updated.length < locks.length) updated.push(0);
      updated[lockIdx] = newVal;
      const total = updated.reduce((acc, v) => acc + Number(v ?? 0), 0);
      const maxQty = Number(item.quantity ?? 0);
      if (total > maxQty) {
        Swal.fire({
          icon: "warning",
          title: "ห้ามเกิน QTY",
          text: `Pick รวมทุก Lock ต้องไม่เกิน ${maxQty}`,
        });
        return;
      }
      setLockPickMap((prev) => ({ ...prev, [rowId]: updated }));
      setEditingLockCell(null);
      setEditLockCellValue("");
    },
    [editLockCellValue, lockPickMap],
  );

  /* =========================
   * จำกัดเพดานตาม lock filter + lock_locations
   * ========================= */
  const getMaxPickLimit = useCallback(
    (it: BatchItem) => {
      const baseQty = Number(it.quantity ?? 0);

      if (lockAll) return baseQty;
      if (!selectedLocks || selectedLocks.size === 0) return 0;

      const lockLocs = Array.isArray((it as any).lock_locations)
        ? ((it as any).lock_locations as Array<{
            location_name?: string;
            qty?: number;
          }>)
        : [];

      if (lockLocs.length === 0) return baseQty;

      const sum = lockLocs.reduce((acc, x) => {
        const name = normalizeLockNo(String(x?.location_name ?? ""));
        if (!name) return acc;
        if (!selectedLocks.has(name)) return acc;
        return acc + Number(x?.qty ?? 0);
      }, 0);

      return Math.min(baseQty, sum);
    },
    [lockAll, selectedLocks],
  );

  const normalizeLocName = (value: unknown) => {
    return String(value ?? "")
      .replace(/\(จำนวน\s*\d+\)/g, "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  };

  const getMaxPickAtLocation = useCallback(
    (it: BatchItem, locFullName: string) => {
      const locKey = normalizeLocName(locFullName);
      if (!locKey) return 0;

      const lockLocs = Array.isArray((it as any).lock_locations)
        ? ((it as any).lock_locations as Array<{
            location_name?: string;
            qty?: number;
          }>)
        : [];

      if (lockLocs.length === 0) return Number.POSITIVE_INFINITY;

      const found = lockLocs.find(
        (x) => normalizeLocName(x?.location_name) === locKey,
      );

      if (!found) return 0;
      return Math.max(0, Number(found?.qty ?? 0));
    },
    [],
  );

  /* =========================
   * หา index ของ lock_no ที่ตรงกับ location ที่สแกนอยู่
   * ========================= */
  const getActiveLockIdx = useCallback(
    (item: BatchItem): number => {
      if (!confirmedLocation) return -1;
      const locKey = normalizeLocName(confirmedLocation.full_name);
      const locks = toLockList((item as any).lock_no);
      return locks.findIndex(
        (lk) => normalizeLocName(normalizeLockNo(lk)) === locKey,
      );
    },
    [confirmedLocation],
  );

  const handlePickEditSave = (rowId: string) => {
    if (!confirmedLocation?.full_name) {
      Swal.fire({
        icon: "warning",
        title: "กรุณา Scan Location ก่อน",
        text: "ต้องสแกน Location ก่อนถึงจะแก้ Pick ได้",
      });
      return;
    }

    const newPick = parseInt(editPickValue, 10);
    if (Number.isNaN(newPick) || newPick < 0) {
      Swal.fire({ icon: "error", title: "กรุณาใส่ตัวเลขที่ถูกต้อง" });
      return;
    }

    const row = batchItems.find((x) => getRowId(x) === rowId);
    if (!row) return;

    const locLimit = getMaxPickAtLocation(row, confirmedLocation.full_name);
    if (Number.isFinite(locLimit) && newPick > locLimit) {
      Swal.fire({
        icon: "warning",
        title: "เกินโควต้า Location นี้",
        text: `Location นี้รับได้สูงสุด ${locLimit}`,
      });
      return;
    }

    const maxQty = getMaxPickLimit(row);

    const currentAtLoc = getPickAtActiveLoc(rowId);
    const totalLocalNow = getTotalPick(rowId);
    const totalWithoutThisLoc = Math.max(0, totalLocalNow - currentAtLoc);

    const backendPick = Number(row.pick ?? 0);
    const effectiveProposed = Math.max(
      backendPick,
      totalWithoutThisLoc + newPick,
    );

    if (effectiveProposed > maxQty) {
      Swal.fire({
        icon: "warning",
        title: "ห้ามเกิน QTY",
        text: lockAll
          ? `Pick รวมทุก Location ต้องไม่เกิน ${maxQty}`
          : `Pick รวมทุก Location ต้องไม่เกิน ${maxQty} (จำกัดตาม Lock ที่เลือก)`,
      });
      return;
    }

    setPickAtActiveLoc(rowId, newPick);

    setEditingRowId(null);
    setEditPickValue("");
    successAlert("แก้ไข Pick สำเร็จแล้ว");
  };

  /* =========================
   * ✅ Scan helpers (เหมือน inboundById)
   * ========================= */
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

  // ===== strict match rules =====
  const LOT_NULL_TOKEN = "XXXXXX";
  const EXP_NULL_TOKEN = "999999";

  // ✅ lot rule: null => XXXXXX, มีค่า => token (เก็บตัวอักษร)
  const getItemLotRule = (it: BatchItem) => {
    const v = (it as any)?.lot_serial;
    const s = v == null ? LOT_NULL_TOKEN : tokenOnly(v);
    return s || LOT_NULL_TOKEN;
  };

  // ✅ exp rule: null => 999999, มีค่า => YYMMDD (6 digits) ให้ match กับ scanDigits
  const expToYYMMDD = (d: unknown) => {
    if (!d) return "";
    const dt = new Date(d as any);
    if (Number.isNaN(dt.getTime())) return "";
    const yy = String(dt.getFullYear()).slice(-2);
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${yy}${mm}${dd}`; // 250703
  };

  const getItemExpRule = (it: BatchItem) => {
    const v = (it as any)?.exp;
    if (v == null) return EXP_NULL_TOKEN;

    // ถ้า backend ส่งมาเป็น "250703" อยู่แล้วก็ใช้ได้เลย
    const s = String(v).trim();
    if (/^\d{6}$/.test(s)) return s;

    const yymmdd = expToYYMMDD(v);
    return yymmdd || EXP_NULL_TOKEN;
  };

  // ✅ barcode หลักของ item: ใช้ barcode_text ก่อน แล้วค่อย fallback barcode/code (digits)
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

    // 1) candidate by barcode digits
    const candidates = batchItems.filter((it: BatchItem) => {
      const b = getItemBarcodeDigits(it);
      return b && scanDigits.includes(b);
    });

    if (candidates.length === 0) return { ok: false, reason: "NO_MATCH" };

    // 2) STRICT: lot_rule อยู่ใน scanToken + exp_rule อยู่ใน scanDigits
    const strictMatched = candidates.filter((it: BatchItem) => {
      const lotRule = getItemLotRule(it); // token
      const expRule = getItemExpRule(it);
      const lotOk = scanToken.includes(lotRule);
      const expOk = it.exp == null ? true : scanDigits.includes(expRule);

      return lotOk && expOk;
    });

    if (strictMatched.length === 1) {
      return { ok: true, item: strictMatched[0], reason: "OK_STRICT" };
    }

    // 0 หรือ >1 = แยกไม่ได้ → ส่ง candidates ไว้ debug
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

  const handleItemBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemBarcodeInput.trim()) return;

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

    const raw = normalize(itemBarcodeInput);
    const picked = pickBatchItemByScan(raw);

    if (!picked.ok) {
      if (picked.reason === "LOT_EXP_MISMATCH") {
        toast.error("Lot/Exp ไม่ตรงกับรายการใน Batch");
        console.log("LOT/EXP MISMATCH scanToken=", tokenOnly(raw));
        console.log("LOT/EXP MISMATCH scanDigits=", digitsOnly(raw));
        console.log("Candidates =", picked.candidates);
      } else if (picked.reason === "AMBIGUOUS") {
        toast.error("ยังแยกรายการไม่ได้ (Lot/Exp อาจไม่พอหรือข้อมูลซ้ำ)");
        console.log("AMBIGUOUS scanToken=", tokenOnly(raw));
        console.log("AMBIGUOUS scanDigits=", digitsOnly(raw));
        console.log("Candidates =", picked.candidates);
      } else if (picked.reason === "NO_MATCH") {
        toast.error("ไม่พบ Barcode ตรงกับสินค้าใน Batch");
      }
      setItemBarcodeInput("");
      return;
    }

    const target = picked.item;
    const rowId = getRowId(target);

    const maxQty = getMaxPickLimit(target);

    const backendPick = Number(target.pick ?? 0);
    const localTotalNow = getTotalPick(rowId);
    const effectiveNow = Math.max(backendPick, localTotalNow);

    if (effectiveNow >= maxQty) {
      setItemBarcodeInput("");
      return;
    }

    // ✅ Multi-lock: อัปเดต lockPickMap สำหรับ lock ที่ตรงกับ location ที่สแกน
    const locksList = toLockList((target as any).lock_no);
    if (locksList.length > 1) {
      const activeLockIdx = getActiveLockIdx(target);
      if (activeLockIdx === -1) {
        toast.warning(
          "Location ที่สแกนไม่ตรงกับ Lock ใดในรายการนี้ กรุณาสแกน Location ที่ถูกต้อง",
        );
        setItemBarcodeInput("");
        return;
      }
      const prevArr =
        lockPickMap[rowId] ?? Array(locksList.length).fill(0);
      const updated = [...prevArr];
      while (updated.length < locksList.length) updated.push(0);
      const newVal = Number(updated[activeLockIdx] ?? 0) + 1;
      const newTotal = updated.reduce(
        (acc, v, i) =>
          acc + (i === activeLockIdx ? newVal : Number(v ?? 0)),
        0,
      );
      if (newTotal > maxQty) {
        setItemBarcodeInput("");
        return;
      }
      updated[activeLockIdx] = newVal;
      setLockPickMap((prev) => ({ ...prev, [rowId]: updated }));
      setItemBarcodeInput("");
      return;
    }

    // ✅ Single-lock: ใช้ pickByLoc เหมือนเดิม
    const currentAtLoc = getPickAtActiveLoc(rowId);
    const nextAtLoc = currentAtLoc + 1;

    const locLimit = getMaxPickAtLocation(target, confirmedLocation.full_name);
    if (Number.isFinite(locLimit) && nextAtLoc > locLimit) {
      Swal.fire({
        icon: "warning",
        title: "เกินโควต้า Location นี้",
        text: `Location นี้รับได้สูงสุด ${locLimit}`,
        timer: 1100,
        showConfirmButton: false,
      });
      setItemBarcodeInput("");
      return;
    }

    const localTotalProposed =
      Math.max(0, localTotalNow - currentAtLoc) + nextAtLoc;
    const effectiveProposed = Math.max(backendPick, localTotalProposed);

    if (effectiveProposed > maxQty) {
      setItemBarcodeInput("");
      return;
    }

    setPickAtActiveLoc(rowId, nextAtLoc);

    if ((target as any).input_number) {
      openInlinePickEdit(rowId, nextAtLoc);
    }

    setItemBarcodeInput("");
  };

  /* =========================
   * Render helpers
   * ========================= */
  const isDoneRow = (it: BatchItem) =>
    getEffectivePick(it) >= Number(it.quantity ?? 0);

  const isProgressRow = (it: BatchItem) => {
    const pick = getEffectivePick(it);
    const qty = Number(it.quantity ?? 0);
    return pick > 0 && pick < qty;
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

  const viewRows =
    viewMode === "done"
      ? filteredRows.filter(isDoneRow)
      : filteredRows.filter((x) => !isDoneRow(x));

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

  /* =========================
   * Submit Pick
   * ========================= */
  const handleSubmit = async () => {
    if (!confirmedLocation?.full_name) {
      Swal.fire({
        icon: "warning",
        title: "กรุณาสแกน Location ก่อน",
        text: "ต้อง Scan Location ให้ผ่านก่อนถึงจะยืนยันได้",
      });
      return;
    }

    if (batchItems.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "แจ้งเตือน",
        text: "ไม่มีรายการสินค้า",
      });
      return;
    }

    const invalid = batchItems.find((i) => {
      const qty = Number(i.quantity ?? 0);
      const rowId = getRowId(i);
      const pick = getTotalPick(rowId);

      if (!i.outbound_no) return true;
      if (!i.invoice_item_id && !(i as any).goods_out_id) return true;
      if (pick < 0) return true;
      if (pick > qty) return true;
      return false;
    });

    if (invalid) {
      Swal.fire({
        icon: "error",
        title: "ข้อมูลไม่ถูกต้อง",
        text: "พบรายการที่ pick เกิน qty หรือไม่มี outbound_no / id",
      });
      return;
    }

    const hasAnyPick = Object.values(pickByLoc || {}).some((m) =>
      Object.values(m || {}).some((v) => Number(v) > 0),
    );

    if (!hasAnyPick) {
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
      const user_ref = getUserRef();
      if (!user_ref) {
        warningAlert(
          "ไม่พบชื่อผู้ใช้งาน (first_name/last_name) กรุณา login ใหม่",
        );
        return;
      }

      const rowIdToLineId = new Map<string, string>();
      for (const it of batchItems) {
        const rowId = getRowId(it);
        const lineId = String(
          (it as any).invoice_item_id ?? (it as any).goods_out_id ?? "",
        );
        if (lineId) rowIdToLineId.set(rowId, lineId);
      }

      const byOutbound = new Map<string, BatchItem[]>();
      for (const it of batchItems) {
        if (!it.outbound_no) continue;
        if (!byOutbound.has(it.outbound_no)) byOutbound.set(it.outbound_no, []);
        byOutbound.get(it.outbound_no)!.push(it);
      }

      for (const [outboundNo, items] of byOutbound.entries()) {
        const locationsPayload = Object.entries(pickByLoc || {})
          .map(([locFullName, rowPickMap]) => {
            const locName = (locFullName || "").trim();
            if (!locName) return null;

            const validRowIds = new Set(items.map(getRowId));

            const lines = Object.entries(rowPickMap || {})
              .filter(
                ([rowId, pick]) => validRowIds.has(rowId) && Number(pick) > 0,
              )
              .map(([rowId, pick]) => ({
                goods_out_item_id: rowIdToLineId.get(rowId) || "",
                pick: Number(pick),
              }))
              .filter((x) => x.goods_out_item_id && x.pick > 0);

            return { location_full_name: locName, lines };
          })
          .filter(
            (x): x is { location_full_name: string; lines: any[] } =>
              !!x && x.lines.length > 0,
          );

        if (locationsPayload.length === 0) continue;

        for (const loc of locationsPayload) {
          await goodsoutApi.confirmToStock(outboundNo, {
            user_ref,
            location_full_name: loc.location_full_name,
            lines: loc.lines,
          });
        }
      }

      await successAlert("ยืนยันการ Pick สำเร็จ");
      await handleInvoiceUpdate();
      navigate("/outbound");
    } catch (error: any) {
      Swal.fire({
        icon: "error",
        title: "เกิดข้อผิดพลาด",
        text: error?.response?.data?.message || "ไม่สามารถยืนยันการ Pick ได้",
      });
    }
  };

  /* =========================
   * UI
   * ========================= */
  return (
    <div className="group-order-container">
      {/* ===== Header ===== */}
      <div className="groupOrder-topbar">
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

        <div className="groupOrder-topbar-right">
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
                  isLocationScanActive ? "รีเซ็ต Location" : "เปิดสแกน Location"
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
              <div className="scan-label">Scan Barcode/Serial :</div>

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
                  placeholder="Scan Barcode/Serial"
                  disabled={!confirmedLocation}
                />
              </form>
            </div>

            <div className={`scan-hint ${confirmedLocation ? "ok" : ""}`}>
              {confirmedLocation ? `✅ ${confirmedLocation.full_name}` : ""}
            </div>
          </div>
        </div>
      </div>

      <div className="content-container">
        {/* Invoice List */}
        <div className="invoice-list-panel">
          <div className="panel-header">
            <span className="panel-title">Invoice List </span>
            <span className="total-badge">total : {invoiceList.length}</span>
          </div>

          <div className="list-body">
            {invoiceList.map((inv) => (
              <div key={inv.no} className="invoice-item">
                <span>{inv.no}</span>

                <button
                  type="button"
                  className="invoice-remove-btn"
                  title="ลบ Invoice นี้ออกจาก Batch"
                  onClick={() => handleRemoveInvoice(inv)}
                >
                  <i className="fa-solid fa-trash"></i>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Batch Table */}
        <div className="batch-panel">
          <div
            className="groupOrder-search-wrapper"
            style={{ margin: "10px 0" }}
          >
            <label>Search</label>

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
              <button
                type="button"
                className={`groupOrder-tab ${
                  viewMode === "pending" ? "active" : ""
                }`}
                onClick={() => setViewMode("pending")}
              >
                ยังไม่ได้ดำเนินการ <span className="badge">{pendingCount}</span>
              </button>

              <button
                type="button"
                className={`groupOrder-tab ${viewMode === "done" ? "active" : ""}`}
                onClick={() => setViewMode("done")}
              >
                ดำเนินการเสร็จสิ้นแล้ว{" "}
                <span className="badge">{doneCount}</span>
              </button>
            </div>
          </div>

          <div className="panel-header">
            <button className="batch-btn">Batch ID (Inv.+Inv.+...)</button>
            <span className="total-badge">total : {batchItems.length}</span>
          </div>

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
                    SKU <SortIcon active={sort.key === "code"} dir={sort.dir} />
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
                    <SortIcon active={sort.key === "name"} dir={sort.dir} />
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="th-filter-btn"
                    onClick={openLockFilter}
                    title="Filter Lock No."
                  >
                    Lock No.{" "}
                    <span className="th-filter-badge">{lockFilterLabel}</span>
                    <i
                      className="fa-solid fa-filter"
                      style={{ marginLeft: 6, opacity: 0.7 }}
                    />
                  </button>
                </th>
                <th>Lot. Serial</th>
                <th>QTY</th>
                <th>Pick</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {sortedBatchItems.map((item, index) => {
                const rowId = getRowId(item);
                let rowClass = "row-white";
                if (isDoneRow(item)) rowClass = "row-green";
                else if (isProgressRow(item)) rowClass = "row-yellow";

                return (
                  <tr key={rowId} className={rowClass}>
                    <td>{index + 1}</td>
                    <td>{item.code}</td>
                    <td>{item.name}</td>

                    <td>
                      {Array.isArray((item as any).lock_no) ? (
                        (item as any).lock_no.map(
                          (lock: string, idx: number) => (
                            <div key={idx}>{lock}</div>
                          ),
                        )
                      ) : (
                        <div>{(item as any).lock_no}</div>
                      )}
                    </td>

                    <td>{(item as any).lot_name ?? item.lot_serial}</td>
                    <td>{item.quantity}</td>

                    <td>
                      {(() => {
                        const locks = toLockList((item as any).lock_no);
                        const inputNumber = !!(item as any).input_number;

                        if (locks.length > 1) {
                          // ✅ แสดง pick แบบ multi-line ตาม lock_no
                          // เฉพาะ lock ที่ตรงกับ location ที่สแกนเท่านั้นถึงจะแก้ไขได้
                          const activeLockIdx = getActiveLockIdx(item);
                          const pickArr =
                            lockPickMap[rowId] ??
                            Array(locks.length).fill(0);
                          const total = pickArr.reduce(
                            (acc: number, v: number) => acc + Number(v ?? 0),
                            0,
                          );

                          return (
                            <div>
                              {locks.map((_lock: string, lockIdx: number) => {
                                const key = `${rowId}__${lockIdx}`;
                                const isEditingThis =
                                  editingLockCell?.rowId === rowId &&
                                  editingLockCell?.lockIdx === lockIdx;
                                const pickVal = Number(pickArr[lockIdx] ?? 0);
                                // ✅ แก้ไขได้เฉพาะ lock ที่ตรงกับ location ที่สแกน
                                // และต้องสแกนสินค้าแล้วอย่างน้อย 1 ครั้ง (pickVal > 0)
                                const isActiveForThisLoc =
                                  inputNumber &&
                                  activeLockIdx === lockIdx &&
                                  pickVal > 0;

                                return (
                                  <div key={lockIdx} className="lock-pick-row">
                                    {isEditingThis ? (
                                      <input
                                        ref={(el) => {
                                          editLockCellInputRef.current[key] = el;
                                        }}
                                        type="number"
                                        min={0}
                                        className="lock-pick-input"
                                        value={editLockCellValue}
                                        onChange={(e) =>
                                          setEditLockCellValue(e.target.value)
                                        }
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter")
                                            saveLockPickEdit(
                                              rowId,
                                              lockIdx,
                                              item,
                                            );
                                          if (e.key === "Escape")
                                            cancelLockPickEdit();
                                        }}
                                        onBlur={() =>
                                          saveLockPickEdit(rowId, lockIdx, item)
                                        }
                                      />
                                    ) : (
                                      <span
                                        className={`lock-pick-value${
                                          isActiveForThisLoc ? " editable" : ""
                                        }`}
                                        onClick={() =>
                                          isActiveForThisLoc &&
                                          openLockPickEdit(rowId, lockIdx)
                                        }
                                        title={
                                          isActiveForThisLoc
                                            ? "คลิกเพื่อแก้ไข"
                                            : undefined
                                        }
                                      >
                                        {pickVal}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                              {total > 0 && (
                                <div className="lock-pick-total">รวม: {total}</div>
                              )}
                            </div>
                          );
                        }

                        // ✅ กรณี lock เดียว / ไม่มี lock → แสดงแบบเดิม
                        const totalPick = getTotalPick(rowId);
                        const locBreakdown = getAllLocPicksForRow(rowId);

                        return editingRowId === rowId ? (
                          <div className="edit-qty-container">
                            <input
                              ref={(el) => {
                                editPickInputRef.current[rowId] = el;
                              }}
                              type="number"
                              min={0}
                              max={Number(item.quantity ?? 0)}
                              className="edit-qty-input"
                              value={editPickValue}
                              onChange={(e) => setEditPickValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  handlePickEditSave(rowId);
                                if (e.key === "Escape") handlePickEditCancel();
                              }}
                            />
                            <button
                              className="btn-save-edit"
                              onClick={() => handlePickEditSave(rowId)}
                            >
                              ✓
                            </button>
                            <button
                              className="btn-cancel-edit"
                              onClick={handlePickEditCancel}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div style={{ lineHeight: 1.15 }}>
                            <div style={{ fontWeight: 700 }}>{totalPick}</div>

                            {locBreakdown.length > 0 && (
                              <div
                                style={{
                                  marginTop: 4,
                                  fontSize: 12,
                                  opacity: 0.75,
                                }}
                              >
                                {locBreakdown.map((x) => (
                                  <div key={x.loc}>
                                    ที่ {x.loc}: {x.pick}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
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
                              style={{ top: menuPos.top, left: menuPos.left }}
                            >
                              <button
                                className="grouporder-dropdown-item"
                                onClick={() => {
                                  handleDetailClick(
                                    item.code,
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

                              {(item as any).input_number ? (
                                <button
                                  className="grouporder-dropdown-item"
                                  onClick={() => {
                                    openInlinePickEdit(
                                      rowId,
                                      Number(getTotalPick(rowId)),
                                    );
                                    closeDropdown();
                                  }}
                                >
                                  <span className="menu-icon">
                                    <i className="fa-solid fa-pen-to-square"></i>
                                  </span>
                                  Edit Pick
                                </button>
                              ) : null}

                              <button
                                className="grouporder-dropdown-item"
                                onClick={() => {
                                  if (!confirmedLocation) {
                                    Swal.fire({
                                      icon: "warning",
                                      title: "กรุณา Scan Location ก่อน",
                                      text: "ต้องสแกน Location ก่อนถึงจะสแกนสินค้าได้",
                                      timer: 1400,
                                      showConfirmButton: false,
                                    });
                                    closeDropdown();
                                    setTimeout(
                                      () => locationInputRef.current?.focus(),
                                      120,
                                    );
                                    return;
                                  }
                                  setIsItemScanActive(true);
                                  closeDropdown();
                                  setTimeout(
                                    () => itemInputRef.current?.focus(),
                                    120,
                                  );
                                }}
                              >
                                <span className="menu-icon">
                                  <i className="fa-solid fa-barcode"></i>
                                </span>
                                Scan
                              </button>
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
      </div>

      {/* Footer */}
      <div className="order-footer">
        <button
          className="groupOrder-btn-back"
          onClick={() => navigate("/outbound")}
        >
          กลับหน้า Outbound
        </button>

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
              await batchApi.remove(bn);
              await successAlert("ยกเลิกรายการและลบ batch สำเร็จ");
              navigate("/batch-inv");
            } catch (err: any) {
              Swal.fire({
                icon: "error",
                title: "ลบ batch ไม่สำเร็จ",
                text: err?.response?.data?.message || "เกิดข้อผิดพลาด",
              });
            }
          }}
        >
          ลบ Batch และยกเลิกการ Pick
        </button>

        <button className="groupOrder-btn-submit" onClick={handleSubmit}>
          ยืนยัน
        </button>
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
      />
    </div>
  );
};

export default GroupOrder;


import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";
import Swal from "sweetalert2";

import {
  batchApi,
  getInvoiceByBarcode,
  goodsoutApi,
  outboundApi,
} from "../../services/outbound.api";

import type {
  InvoiceData,
  GoodsOutItem,
  BatchItem,
} from "../../types/outbound.type";

import InvoiceListModal from "../../invoiceslist/InvoiceListModal";

import {
  confirmAlert,
  successAlert,
  warningAlert,
} from "../../../../utils/alert";

import "./grouporder.css";
import { toast } from "react-toastify";

type MenuPos = { top: number; left: number };
type ViewMode = "pending" | "done";

type SortKey = "code" | "name" | null;
type SortDir = "asc" | "desc";
type SortState = { key: SortKey; dir: SortDir };

type ConfirmedLocation = { id: number; full_name: string };

// ✅ payload ที่จะถูกส่งกลับมาหลัง “เปลี่ยน Lot”
export type LotUpdatedPayload = {
  outbound_no: string;
  goods_out_id: string; // line id
  lot_old: string;
  lot_new: string;
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
    outbound_barcode: String(raw?.outbound_barcode ?? ""),
    out_type: String(raw?.out_type ?? ""),
    items: Array.isArray(raw?.items) ? (raw.items as GoodsOutItem[]) : [],
    batch_name: raw?.batch_name ?? null,
    created_at: String(raw?.created_at ?? raw?.date ?? ""),
    updated_at: raw?.updated_at ?? null,
    deleted_at: raw?.deleted_at ?? null,
  };
};

const GroupOrder = () => {
  const navigate = useNavigate();

  // ===== Refs =====
  const locationInputRef = useRef<HTMLInputElement>(null);
  const itemInputRef = useRef<HTMLInputElement>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<Record<string, HTMLButtonElement | null>>({});

  // ===== Invoice list =====
  const [invoiceList, setInvoiceList] = useState<InvoiceData[]>([]);

  // ===== Batch items (merged) =====
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchTitle, setBatchTitle] = useState<string>("-");

  // ===== Scan location =====
  const [scanLocation, setScanLocation] = useState("");
  const [confirmedLocation, setConfirmedLocation] =
    useState<ConfirmedLocation | null>(null);

  // ===== Item scan =====
  const [isItemScanActive, setIsItemScanActive] = useState(false);
  const [itemBarcodeInput, setItemBarcodeInput] = useState("");

  // ===== Dropdown =====
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);

  const MENU_WIDTH = 190;
  const MENU_HEIGHT = 90;
  const GAP = 8;

  // ===== Sort/Search/View =====
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("pending");

  // ===== Modal =====
  const [isInvoiceListModalOpen, setIsInvoiceListModalOpen] = useState(false);
  const [_selectedGoodsOutId, setSelectedGoodsOutId] = useState<string | null>(
    null,
  );
  const [selectedItemKey, setSelectedItemKey] = useState<{
    code: string;
    lot_serial: string | null;
  } | null>(null);

  // ===== Edit pick (inline) =====
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editPickValue, setEditPickValue] = useState<string>("");
  const editPickInputRef = useRef<Record<string, HTMLInputElement | null>>({});

  // ===== Scan Location button mode =====
  const [isLocationScanActive, setIsLocationScanActive] = useState(false);

  const [searchParams] = useSearchParams();
  const batchNameFromUrl = (
    searchParams.get("batchName") ||
    searchParams.get("batch") ||
    ""
  ).trim();

  // ===== Lock filter popup =====
  const [isLockFilterOpen, setIsLockFilterOpen] = useState(false);
  const [lockAll, setLockAll] = useState(true);
  const [selectedLocks, setSelectedLocks] = useState<Set<string>>(new Set());

  const normalizeLockNo = (value: string) => {
    return value.replace(/\(จำนวน\s*\d+\)/g, "").trim();
  };
  const toLockList = (v: any): string[] => {
    if (!v) return [];
    if (Array.isArray(v))
      return v.map((x) => String(x ?? "").trim()).filter(Boolean);
    return [String(v).trim()].filter(Boolean);
  };

  // ✅ options จาก batchItems
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

  // temp state popup
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

  // ✅ Multi-location pick store: location_full_name -> rowId -> pick
  type LocKey = string;
  type PickByLoc = Record<LocKey, Record<string, number>>;
  const [pickByLoc, setPickByLoc] = useState<PickByLoc>({});

  const activeLocKey = (confirmedLocation?.full_name || "").trim();

  const getPickAtActiveLoc = useCallback(
    (rowId: string) => {
      if (!activeLocKey) return 0;
      return Number(pickByLoc[activeLocKey]?.[rowId] ?? 0);
    },
    [pickByLoc, activeLocKey],
  );

  const setPickAtActiveLoc = useCallback(
    (rowId: string, nextPick: number) => {
      if (!activeLocKey) return;
      setPickByLoc((prev) => {
        const curr = prev[activeLocKey] || {};
        return { ...prev, [activeLocKey]: { ...curr, [rowId]: nextPick } };
      });
    },
    [activeLocKey],
  );

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

  /* =========================
   * ✅ stable lock key
   * ========================= */
  const canonicalizeLockTokens = (v: any): string[] => {
    const raw: string[] = Array.isArray(v)
      ? v.map((x) => String(x ?? ""))
      : [String(v ?? "")];

    // รองรับ string ที่อาจมี | หรือ , หรือขึ้นบรรทัดใหม่
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
    return tokens.join("|"); // canonical key
  };

  /* =========================
   * Row ID (ยังใช้ lot_serial เพื่อแยก lot)
   * ========================= */
  const getRowId = useCallback((it: BatchItem) => {
    const pid = Number(it.product_id ?? 0);
    const lockKey = stableLockKey((it as any).lock_no);
    const lot = String(it.lot_serial ?? "").trim();
    return `${pid}|${lockKey}|${lot}`;
  }, []);

  const getEffectivePick = useCallback(
    (it: BatchItem) => {
      const rowId = getRowId(it);
      const backendPick = Number(it.pick ?? 0);
      const localPick = getTotalPick(rowId);
      return Math.max(backendPick, localPick);
    },
    [getTotalPick, getRowId],
  );

  const getAllLocPicksForRow = useCallback(
    (rowId: string) => {
      const rows = Object.entries(pickByLoc || {})
        .map(([loc, map]) => ({ loc, pick: Number(map?.[rowId] ?? 0) }))
        .filter((x) => x.pick > 0);

      rows.sort((a, b) => {
        const aActive = a.loc === activeLocKey ? 0 : 1;
        const bActive = b.loc === activeLocKey ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        return a.loc.localeCompare(b.loc, "th", { numeric: true });
      });

      return rows;
    },
    [pickByLoc, activeLocKey],
  );

  /* =========================
   * Focus inputs
   * ========================= */
  useEffect(() => {
    if (isItemScanActive && itemInputRef.current) itemInputRef.current.focus();
  }, [isItemScanActive]);

  /* =========================
   * เวลา + เลือก batch ล่าสุด
   * ========================= */
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
      if (!latestDateKeys.length) return;

      const recentInvoices = withDate
        .filter((x) => latestDateKeys.includes(getDateKey(x.date)))
        .map((x) => toInvoiceData(x.row))
        .filter((inv): inv is InvoiceData => inv !== null);

     const sorted = sortInvoicesNewestFirst(recentInvoices);
setInvoiceList(sorted);

const latestBatch = resolveLatestBatchNameFrom(sorted);
const initial = (batchNameFromUrl || latestBatch || "-").trim() || "-";
setBatchTitle(initial);
    } catch (error) {
      console.error("Error loading recent outbound invoices:", error);
    }
  }, [batchNameFromUrl, resolveLatestBatchNameFrom]);

  /* =========================
   * ✅ load invoices ตาม batchNameFromUrl
   * ========================= */
  useEffect(() => {
    loadRecentOutbounds();
  }, [loadRecentOutbounds]);

  /* =========================
   * ✅ rebuild batchItems จาก invoiceList (เก็บ line_ids เพื่อ migrate pick)
   * ========================= */
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

  type LockLoc = { location_name?: string; qty?: number };

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

          const incomingLockLocs = Array.isArray((item as any).lock_locations)
            ? ((item as any).lock_locations as LockLoc[])
            : [];

          const lineId = String(item.id ?? "").trim();

          if (mergedMap.has(key)) {
            const existing = mergedMap.get(key)!;
            existing.quantity += quantity;
            existing.pick += pick;

            // ✅ เก็บ line_ids (สำคัญมากเพื่อ migrate pick หลังเปลี่ยน lot)
            const ids = new Set<string>(
              Array.isArray(existing.line_ids) ? existing.line_ids : [],
            );
            if (lineId) ids.add(lineId);
            existing.line_ids = Array.from(ids);

            existing.lock_locations = mergeLockLocations(
              existing.lock_locations || [],
              incomingLockLocs,
            );
          } else {
            mergedMap.set(key, {
              invoice_item_id: Number(item.id),
              outbound_no: invoice.no,
              goods_out_id: String(item.id),

              // ✅ NEW
              line_ids: lineId ? [lineId] : [],

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
              pack: Number(item.pack ?? 0),

              batchId: String((item as any).outbound_id ?? ""),

              barcode: item.barcode?.barcode || item.code,
              barcode_text: item.barcode_text ?? item.code,
              sku: item.code,
              input_number: Boolean((item as any).input_number),

              ...(incomingLockLocs.length
                ? { lock_locations: incomingLockLocs }
                : {}),
            });
          }
        });
      });

      return Array.from(mergedMap.values()) as BatchItem[];
    },
    [],
  );

  /* =========================
   * ✅ กัน reset ตอนเปลี่ยน lot (FIX)
   * ========================= */
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
    const ids: string[] = Array.isArray((it as any).line_ids)
      ? (it as any).line_ids
          .map((x: any) => String(x ?? "").trim())
          .filter(Boolean)
      : [String((it as any).goods_out_id ?? "").trim()].filter(Boolean);

    return ids;
  };

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

    // ✅ re-key pickByLoc หาก rowId ของรายการเดิมเปลี่ยน
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
        setItemBarcodeInput("");
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
  ]);

  /* =========================
   * ✅ Migrate pickByLoc หลัง “เปลี่ยน lot”
   * ========================= */
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

  /* =========================
   * Sort helpers
   * ========================= */
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

        setTimeout(() => locationInputRef.current?.focus(), 0);
        return true;
      }
      return false;
    });
  }, []);

  /* =========================
   * Dropdown helpers
   * ========================= */
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

  /* =========================
   * Scan Location
   * ========================= */
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

    const firstOutboundNo = invoiceList[0]?.no;
    if (!firstOutboundNo) {
      Swal.fire({
        icon: "warning",
        title: "ไม่มี Invoice",
        text: "ไม่พบรายการ Invoice จาก Batch",
      });
      return;
    }

    try {
      const resp = await goodsoutApi.scanLocation(firstOutboundNo, {
        location_full_name: fullName,
      });
      const payload = resp.data as any;

      const locName = payload.location?.location_name ?? fullName;
      const locId = payload.location?.location_id ?? 0;

      setConfirmedLocation({ id: locId, full_name: locName });
      setScanLocation(locName);

      setIsLocationScanActive(false);

      Swal.fire({
        icon: "success",
        title: "Location OK",
        text: locName,
        timer: 900,
        showConfirmButton: false,
      });

      setIsItemScanActive(true);
      setTimeout(() => itemInputRef.current?.focus(), 120);
    } catch (err: any) {
      Swal.fire({
        icon: "error",
        title: "Scan Location ไม่สำเร็จ",
        text: err?.response?.data?.message || "เกิดข้อผิดพลาด",
      });
      setConfirmedLocation(null);
    }
  };

  /* =========================
   * Detail modal
   * ========================= */
  const handleDetailClick = (code: string, lot_serial: string | null) => {
    setSelectedItemKey({ code, lot_serial });
    setIsInvoiceListModalOpen(true);
  };

  const handleModalClose = () => {
    setIsInvoiceListModalOpen(false);
    setSelectedGoodsOutId(null);
  };

  /* =========================
   * ✅ Refresh invoice list (หลังแก้ lot)
   * ========================= */
  const handleInvoiceUpdate = async (payload?: LotUpdatedPayload) => {
    try {
      if (payload) {
        pendingLotUpdateRef.current = payload;
        oldBatchItemsRef.current = batchItems;
        isLotUpdatingRef.current = true;
      }
      const updatedInvoices = await Promise.all(
        invoiceList.map(async (inv) => {
          if (!inv.outbound_barcode) return inv;
          const fresh = await getInvoiceByBarcode(inv.outbound_barcode);

          // ✅ preserve batch_name ถ้า fresh ไม่มี (กัน title หาย)
          return {
            ...fresh,
            batch_name:
              (fresh as any)?.batch_name ?? (inv as any)?.batch_name ?? null,
          };
        }),
      );

      setInvoiceList(sortInvoicesNewestFirst(updatedInvoices));
    } catch (err) {
      console.error(err);
      isLotUpdatingRef.current = false;
      Swal.fire({ icon: "error", title: "รีเฟรชข้อมูลไม่สำเร็จ" });
    }
  };

  const getOutboundIdOfInvoice = (inv: InvoiceData): number => {
    // โดยทั่วไป outbound_id จะอยู่ใน item
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

      // ✅ รีโหลดจาก server ให้ invoice หายจาก list ทันที
      await loadRecentOutbounds();
    } catch (err: any) {
      Swal.fire({
        icon: "error",
        title: "ลบ Invoice ไม่สำเร็จ",
        text: err?.response?.data?.message || "เกิดข้อผิดพลาด",
      });
    }
  };

  const getUserRef = () => {
    const first = (localStorage.getItem("first_name") || "").trim();
    const last = (localStorage.getItem("last_name") || "").trim();
    return `${first} ${last}`.trim();
  };

  /* =========================
   * Inline edit pick
   * ========================= */
  const openInlinePickEdit = useCallback(
    (rowId: string, currentPick: number) => {
      setEditingRowId(rowId);
      setEditPickValue(String(currentPick));

      setTimeout(() => {
        const el = editPickInputRef.current[rowId];
        el?.focus();
        el?.select();
      }, 0);
    },
    [],
  );

  const handlePickEditCancel = () => {
    setEditingRowId(null);
    setEditPickValue("");
  };

  /* =========================
   * จำกัดเพดานตาม lock filter + lock_locations
   * ========================= */
  const getMaxPickLimit = useCallback(
    (it: BatchItem) => {
      const baseQty = Number(it.quantity ?? 0);

      if (lockAll) return baseQty;
      if (!selectedLocks || selectedLocks.size === 0) return 0;

      const lockLocs = Array.isArray((it as any).lock_locations)
        ? ((it as any).lock_locations as Array<{
            location_name?: string;
            qty?: number;
          }>)
        : [];

      if (lockLocs.length === 0) return baseQty;

      const sum = lockLocs.reduce((acc, x) => {
        const name = normalizeLockNo(String(x?.location_name ?? ""));
        if (!name) return acc;
        if (!selectedLocks.has(name)) return acc;
        return acc + Number(x?.qty ?? 0);
      }, 0);

      return Math.min(baseQty, sum);
    },
    [lockAll, selectedLocks],
  );

  const normalizeLocName = (value: unknown) => {
    return String(value ?? "")
      .replace(/\(จำนวน\s*\d+\)/g, "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  };

  const getMaxPickAtLocation = useCallback(
    (it: BatchItem, locFullName: string) => {
      const locKey = normalizeLocName(locFullName);
      if (!locKey) return 0;

      const lockLocs = Array.isArray((it as any).lock_locations)
        ? ((it as any).lock_locations as Array<{
            location_name?: string;
            qty?: number;
          }>)
        : [];

      if (lockLocs.length === 0) return Number.POSITIVE_INFINITY;

      const found = lockLocs.find(
        (x) => normalizeLocName(x?.location_name) === locKey,
      );

      if (!found) return 0;
      return Math.max(0, Number(found?.qty ?? 0));
    },
    [],
  );

  const handlePickEditSave = (rowId: string) => {
    if (!confirmedLocation?.full_name) {
      Swal.fire({
        icon: "warning",
        title: "กรุณา Scan Location ก่อน",
        text: "ต้องสแกน Location ก่อนถึงจะแก้ Pick ได้",
      });
      return;
    }

    const newPick = parseInt(editPickValue, 10);
    if (Number.isNaN(newPick) || newPick < 0) {
      Swal.fire({ icon: "error", title: "กรุณาใส่ตัวเลขที่ถูกต้อง" });
      return;
    }

    const row = batchItems.find((x) => getRowId(x) === rowId);
    if (!row) return;

    const locLimit = getMaxPickAtLocation(row, confirmedLocation.full_name);
    if (Number.isFinite(locLimit) && newPick > locLimit) {
      Swal.fire({
        icon: "warning",
        title: "เกินโควต้า Location นี้",
        text: `Location นี้รับได้สูงสุด ${locLimit}`,
      });
      return;
    }

    const maxQty = getMaxPickLimit(row);

    const currentAtLoc = getPickAtActiveLoc(rowId);
    const totalLocalNow = getTotalPick(rowId);
    const totalWithoutThisLoc = Math.max(0, totalLocalNow - currentAtLoc);

    const backendPick = Number(row.pick ?? 0);
    const effectiveProposed = Math.max(
      backendPick,
      totalWithoutThisLoc + newPick,
    );

    if (effectiveProposed > maxQty) {
      Swal.fire({
        icon: "warning",
        title: "ห้ามเกิน QTY",
        text: lockAll
          ? `Pick รวมทุก Location ต้องไม่เกิน ${maxQty}`
          : `Pick รวมทุก Location ต้องไม่เกิน ${maxQty} (จำกัดตาม Lock ที่เลือก)`,
      });
      return;
    }

    setPickAtActiveLoc(rowId, newPick);

    setEditingRowId(null);
    setEditPickValue("");
    successAlert("แก้ไข Pick สำเร็จแล้ว");
  };

  /* =========================
   * ✅ Scan helpers (เหมือน inboundById)
   * ========================= */
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

  // ===== strict match rules =====
  const LOT_NULL_TOKEN = "XXXXXX";
  const EXP_NULL_TOKEN = "999999";

  // ✅ lot rule: null => XXXXXX, มีค่า => token (เก็บตัวอักษร)
  const getItemLotRule = (it: BatchItem) => {
    const v = (it as any)?.lot_serial;
    const s = v == null ? LOT_NULL_TOKEN : tokenOnly(v);
    return s || LOT_NULL_TOKEN;
  };

  // ✅ exp rule: null => 999999, มีค่า => YYMMDD (6 digits) ให้ match กับ scanDigits
  const expToYYMMDD = (d: unknown) => {
    if (!d) return "";
    const dt = new Date(d as any);
    if (Number.isNaN(dt.getTime())) return "";
    const yy = String(dt.getFullYear()).slice(-2);
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${yy}${mm}${dd}`; // 250703
  };

  const getItemExpRule = (it: BatchItem) => {
    const v = (it as any)?.exp;
    if (v == null) return EXP_NULL_TOKEN;

    // ถ้า backend ส่งมาเป็น "250703" อยู่แล้วก็ใช้ได้เลย
    const s = String(v).trim();
    if (/^\d{6}$/.test(s)) return s;

    const yymmdd = expToYYMMDD(v);
    return yymmdd || EXP_NULL_TOKEN;
  };

  // ✅ barcode หลักของ item: ใช้ barcode_text ก่อน แล้วค่อย fallback barcode/code (digits)
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

    // 1) candidate by barcode digits
    const candidates = batchItems.filter((it: BatchItem) => {
      const b = getItemBarcodeDigits(it);
      return b && scanDigits.includes(b);
    });

    if (candidates.length === 0) return { ok: false, reason: "NO_MATCH" };

    // 2) STRICT: lot_rule อยู่ใน scanToken + exp_rule อยู่ใน scanDigits
    const strictMatched = candidates.filter((it: BatchItem) => {
      const lotRule = getItemLotRule(it); // token
      const expRule = getItemExpRule(it);
      const lotOk = scanToken.includes(lotRule);
      const expOk = it.exp == null ? true : scanDigits.includes(expRule);

      return lotOk && expOk;
    });

    if (strictMatched.length === 1) {
      return { ok: true, item: strictMatched[0], reason: "OK_STRICT" };
    }

    // 0 หรือ >1 = แยกไม่ได้ → ส่ง candidates ไว้ debug
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

  const handleItemBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemBarcodeInput.trim()) return;

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

    const raw = normalize(itemBarcodeInput);
    const picked = pickBatchItemByScan(raw);

    if (!picked.ok) {
      if (picked.reason === "LOT_EXP_MISMATCH") {
        toast.error("Lot/Exp ไม่ตรงกับรายการใน Batch");
        console.log("LOT/EXP MISMATCH scanToken=", tokenOnly(raw));
        console.log("LOT/EXP MISMATCH scanDigits=", digitsOnly(raw));
        console.log("Candidates =", picked.candidates);
      } else if (picked.reason === "AMBIGUOUS") {
        toast.error("ยังแยกรายการไม่ได้ (Lot/Exp อาจไม่พอหรือข้อมูลซ้ำ)");
        console.log("AMBIGUOUS scanToken=", tokenOnly(raw));
        console.log("AMBIGUOUS scanDigits=", digitsOnly(raw));
        console.log("Candidates =", picked.candidates);
      } else if (picked.reason === "NO_MATCH") {
        toast.error("ไม่พบ Barcode ตรงกับสินค้าใน Batch");
      }
      setItemBarcodeInput("");
      return;
    }

    const target = picked.item;
    const rowId = getRowId(target);

    const maxQty = getMaxPickLimit(target);

    const backendPick = Number(target.pick ?? 0);
    const localTotalNow = getTotalPick(rowId);
    const effectiveNow = Math.max(backendPick, localTotalNow);

    if (effectiveNow >= maxQty) {
      setItemBarcodeInput("");
      return;
    }

    const currentAtLoc = getPickAtActiveLoc(rowId);
    const nextAtLoc = currentAtLoc + 1;

    const locLimit = getMaxPickAtLocation(target, confirmedLocation.full_name);
    if (Number.isFinite(locLimit) && nextAtLoc > locLimit) {
      Swal.fire({
        icon: "warning",
        title: "เกินโควต้า Location นี้",
        text: `Location นี้รับได้สูงสุด ${locLimit}`,
        timer: 1100,
        showConfirmButton: false,
      });
      setItemBarcodeInput("");
      return;
    }

    const localTotalProposed =
      Math.max(0, localTotalNow - currentAtLoc) + nextAtLoc;
    const effectiveProposed = Math.max(backendPick, localTotalProposed);

    if (effectiveProposed > maxQty) {
      setItemBarcodeInput("");
      return;
    }

    setPickAtActiveLoc(rowId, nextAtLoc);

    if ((target as any).input_number) {
      openInlinePickEdit(rowId, nextAtLoc);
    }

    setItemBarcodeInput("");
  };

  /* =========================
   * Render helpers
   * ========================= */
  const isDoneRow = (it: BatchItem) =>
    getEffectivePick(it) >= Number(it.quantity ?? 0);

  const isProgressRow = (it: BatchItem) => {
    const pick = getEffectivePick(it);
    const qty = Number(it.quantity ?? 0);
    return pick > 0 && pick < qty;
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

  const viewRows =
    viewMode === "done"
      ? filteredRows.filter(isDoneRow)
      : filteredRows.filter((x) => !isDoneRow(x));

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

  /* =========================
   * Submit Pick
   * ========================= */
  const handleSubmit = async () => {
    if (!confirmedLocation?.full_name) {
      Swal.fire({
        icon: "warning",
        title: "กรุณาสแกน Location ก่อน",
        text: "ต้อง Scan Location ให้ผ่านก่อนถึงจะยืนยันได้",
      });
      return;
    }

    if (batchItems.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "แจ้งเตือน",
        text: "ไม่มีรายการสินค้า",
      });
      return;
    }

    const invalid = batchItems.find((i) => {
      const qty = Number(i.quantity ?? 0);
      const rowId = getRowId(i);
      const pick = getTotalPick(rowId);

      if (!i.outbound_no) return true;
      if (!i.invoice_item_id && !(i as any).goods_out_id) return true;
      if (pick < 0) return true;
      if (pick > qty) return true;
      return false;
    });

    if (invalid) {
      Swal.fire({
        icon: "error",
        title: "ข้อมูลไม่ถูกต้อง",
        text: "พบรายการที่ pick เกิน qty หรือไม่มี outbound_no / id",
      });
      return;
    }

    const hasAnyPick = Object.values(pickByLoc || {}).some((m) =>
      Object.values(m || {}).some((v) => Number(v) > 0),
    );

    if (!hasAnyPick) {
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
      const user_ref = getUserRef();
      if (!user_ref) {
        warningAlert(
          "ไม่พบชื่อผู้ใช้งาน (first_name/last_name) กรุณา login ใหม่",
        );
        return;
      }

      const rowIdToLineId = new Map<string, string>();
      for (const it of batchItems) {
        const rowId = getRowId(it);
        const lineId = String(
          (it as any).invoice_item_id ?? (it as any).goods_out_id ?? "",
        );
        if (lineId) rowIdToLineId.set(rowId, lineId);
      }

      const byOutbound = new Map<string, BatchItem[]>();
      for (const it of batchItems) {
        if (!it.outbound_no) continue;
        if (!byOutbound.has(it.outbound_no)) byOutbound.set(it.outbound_no, []);
        byOutbound.get(it.outbound_no)!.push(it);
      }

      for (const [outboundNo, items] of byOutbound.entries()) {
        const locationsPayload = Object.entries(pickByLoc || {})
          .map(([locFullName, rowPickMap]) => {
            const locName = (locFullName || "").trim();
            if (!locName) return null;

            const validRowIds = new Set(items.map(getRowId));

            const lines = Object.entries(rowPickMap || {})
              .filter(
                ([rowId, pick]) => validRowIds.has(rowId) && Number(pick) > 0,
              )
              .map(([rowId, pick]) => ({
                goods_out_item_id: rowIdToLineId.get(rowId) || "",
                pick: Number(pick),
              }))
              .filter((x) => x.goods_out_item_id && x.pick > 0);

            return { location_full_name: locName, lines };
          })
          .filter(
            (x): x is { location_full_name: string; lines: any[] } =>
              !!x && x.lines.length > 0,
          );

        if (locationsPayload.length === 0) continue;

        for (const loc of locationsPayload) {
          await goodsoutApi.confirmToStock(outboundNo, {
            user_ref,
            location_full_name: loc.location_full_name,
            lines: loc.lines,
          });
        }
      }

      await successAlert("ยืนยันการ Pick สำเร็จ");
      await handleInvoiceUpdate();
      navigate("/outbound");
    } catch (error: any) {
      Swal.fire({
        icon: "error",
        title: "เกิดข้อผิดพลาด",
        text: error?.response?.data?.message || "ไม่สามารถยืนยันการ Pick ได้",
      });
    }
  };

  /* =========================
   * UI
   * ========================= */
  return (
    <div className="group-order-container">
      {/* ===== Header ===== */}
      <div className="groupOrder-topbar">
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

        <div className="groupOrder-topbar-right">
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
                  isLocationScanActive ? "รีเซ็ต Location" : "เปิดสแกน Location"
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
              <div className="scan-label">Scan Barcode/Serial :</div>

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
                  placeholder="Scan Barcode/Serial"
                  disabled={!confirmedLocation}
                />
              </form>
            </div>

            <div className={`scan-hint ${confirmedLocation ? "ok" : ""}`}>
              {confirmedLocation ? `✅ ${confirmedLocation.full_name}` : ""}
            </div>
          </div>
        </div>
      </div>

      <div className="content-container">
        {/* Invoice List */}
        <div className="invoice-list-panel">
          <div className="panel-header">
            <span className="panel-title">Invoice List </span>
            <span className="total-badge">total : {invoiceList.length}</span>
          </div>

          <div className="list-body">
            {invoiceList.map((inv) => (
              <div key={inv.no} className="invoice-item">
                <span>{inv.no}</span>

                <button
                  type="button"
                  className="invoice-remove-btn"
                  title="ลบ Invoice นี้ออกจาก Batch"
                  onClick={() => handleRemoveInvoice(inv)}
                >
                  <i className="fa-solid fa-trash"></i>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Batch Table */}
        <div className="batch-panel">
          <div
            className="groupOrder-search-wrapper"
            style={{ margin: "10px 0" }}
          >
            <label>Search</label>

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
              <button
                type="button"
                className={`groupOrder-tab ${
                  viewMode === "pending" ? "active" : ""
                }`}
                onClick={() => setViewMode("pending")}
              >
                ยังไม่ได้ดำเนินการ <span className="badge">{pendingCount}</span>
              </button>

              <button
                type="button"
                className={`groupOrder-tab ${viewMode === "done" ? "active" : ""}`}
                onClick={() => setViewMode("done")}
              >
                ดำเนินการเสร็จสิ้นแล้ว{" "}
                <span className="badge">{doneCount}</span>
              </button>
            </div>
          </div>

          <div className="panel-header">
            <button className="batch-btn">Batch ID (Inv.+Inv.+...)</button>
            <span className="total-badge">total : {batchItems.length}</span>
          </div>

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
                    SKU <SortIcon active={sort.key === "code"} dir={sort.dir} />
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
                    <SortIcon active={sort.key === "name"} dir={sort.dir} />
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="th-filter-btn"
                    onClick={openLockFilter}
                    title="Filter Lock No."
                  >
                    Lock No.{" "}
                    <span className="th-filter-badge">{lockFilterLabel}</span>
                    <i
                      className="fa-solid fa-filter"
                      style={{ marginLeft: 6, opacity: 0.7 }}
                    />
                  </button>
                </th>
                <th>Lot. Serial</th>
                <th>QTY</th>
                <th>Pick</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {sortedBatchItems.map((item, index) => {
                const rowId = getRowId(item);
                let rowClass = "row-white";
                if (isDoneRow(item)) rowClass = "row-green";
                else if (isProgressRow(item)) rowClass = "row-yellow";

                return (
                  <tr key={rowId} className={rowClass}>
                    <td>{index + 1}</td>
                    <td>{item.code}</td>
                    <td>{item.name}</td>

                    <td>
                      {Array.isArray((item as any).lock_no) ? (
                        (item as any).lock_no.map(
                          (lock: string, idx: number) => (
                            <div key={idx}>{lock}</div>
                          ),
                        )
                      ) : (
                        <div>{(item as any).lock_no}</div>
                      )}
                    </td>

                    <td>{(item as any).lot_name ?? item.lot_serial}</td>
                    <td>{item.quantity}</td>

                    <td>
                      {(() => {
                        const totalPick = getTotalPick(rowId);
                        const locBreakdown = getAllLocPicksForRow(rowId);

                        return editingRowId === rowId ? (
                          <div className="edit-qty-container">
                            <input
                              ref={(el) => {
                                editPickInputRef.current[rowId] = el;
                              }}
                              type="number"
                              min={0}
                              max={Number(item.quantity ?? 0)}
                              className="edit-qty-input"
                              value={editPickValue}
                              onChange={(e) => setEditPickValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  handlePickEditSave(rowId);
                                if (e.key === "Escape") handlePickEditCancel();
                              }}
                            />
                            <button
                              className="btn-save-edit"
                              onClick={() => handlePickEditSave(rowId)}
                            >
                              ✓
                            </button>
                            <button
                              className="btn-cancel-edit"
                              onClick={handlePickEditCancel}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div style={{ lineHeight: 1.15 }}>
                            <div style={{ fontWeight: 700 }}>{totalPick}</div>

                            {locBreakdown.length > 0 && (
                              <div
                                style={{
                                  marginTop: 4,
                                  fontSize: 12,
                                  opacity: 0.75,
                                }}
                              >
                                {locBreakdown.map((x) => (
                                  <div key={x.loc}>
                                    ที่ {x.loc}: {x.pick}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
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
                              style={{ top: menuPos.top, left: menuPos.left }}
                            >
                              <button
                                className="grouporder-dropdown-item"
                                onClick={() => {
                                  handleDetailClick(
                                    item.code,
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

                              {(item as any).input_number ? (
                                <button
                                  className="grouporder-dropdown-item"
                                  onClick={() => {
                                    openInlinePickEdit(
                                      rowId,
                                      Number(getTotalPick(rowId)),
                                    );
                                    closeDropdown();
                                  }}
                                >
                                  <span className="menu-icon">
                                    <i className="fa-solid fa-pen-to-square"></i>
                                  </span>
                                  Edit Pick
                                </button>
                              ) : null}

                              <button
                                className="grouporder-dropdown-item"
                                onClick={() => {
                                  if (!confirmedLocation) {
                                    Swal.fire({
                                      icon: "warning",
                                      title: "กรุณา Scan Location ก่อน",
                                      text: "ต้องสแกน Location ก่อนถึงจะสแกนสินค้าได้",
                                      timer: 1400,
                                      showConfirmButton: false,
                                    });
                                    closeDropdown();
                                    setTimeout(
                                      () => locationInputRef.current?.focus(),
                                      120,
                                    );
                                    return;
                                  }
                                  setIsItemScanActive(true);
                                  closeDropdown();
                                  setTimeout(
                                    () => itemInputRef.current?.focus(),
                                    120,
                                  );
                                }}
                              >
                                <span className="menu-icon">
                                  <i className="fa-solid fa-barcode"></i>
                                </span>
                                Scan
                              </button>
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
      </div>

      {/* Footer */}
      <div className="order-footer">
        <button
          className="groupOrder-btn-back"
          onClick={() => navigate("/outbound")}
        >
          กลับหน้า Outbound
        </button>

        <button
          className="groupOrder-btn-cancel"
          onClick={async () => {
            const c = await confirmAlert(
              `ยืนยันยกเลิกรายการและทำการลบ ${batchTitle}?`,
            );
            if (!c.isConfirmed) return;

            const bn = (resolveLatestBatchNameFrom(invoiceList) || batchTitle || "").trim();

            if (!bn) {
              warningAlert('ไม่พบ "batch_name" สำหรับลบ batch');
              return;
            }

            try {
              await batchApi.remove(bn);
              await successAlert("ยกเลิกรายการและลบ batch สำเร็จ");
              navigate("/batch-inv");
            } catch (err: any) {
              Swal.fire({
                icon: "error",
                title: "ลบ batch ไม่สำเร็จ",
                text: err?.response?.data?.message || "เกิดข้อผิดพลาด",
              });
            }
          }}
        >
          ลบ Batch และยกเลิกการ Pick
        </button>

        <button className="groupOrder-btn-submit" onClick={handleSubmit}>
          ยืนยัน
        </button>
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
      />
    </div>
  );
};

export default GroupOrder;
