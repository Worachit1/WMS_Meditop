import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import DetailNavigator from "../../../components/DetailNavigator/DetailNavigator";
// import Swal from "sweetalert2";
import { toast } from "react-toastify";

import { confirmAlert, successAlert, warningAlert } from "../../../utils/alert";
import { transferApi } from "../services/transfer.api";
import type { TransferType, TransferItemType } from "../types/tranfers.type";

import Table from "../../../components/Table/Table";
import "../../../components/Button/button.css";
import "../../../components/Table/table.css";
import "../../../styles/component.css";
import { formatDateTime } from "../../../components/Datetime/FormatDateTime";

import Loading from "../../../components/Loading/Loading";
import "../transfer-exp-ncr.css";

import { socket } from "../../../services/socket";

type ConfirmedLocation = { id: number; full_name: string };
type LocKey = string;
type CountByLoc = Record<LocKey, Record<string, number>>;

const mergeTransferItems = (prev: any, incomingLines: any[]) => {
  if (!prev) return prev;

  const prevItemsRaw = Array.isArray((prev as any)?.items)
    ? ((prev as any).items as any[])
    : [];

  const prevById = new Map(prevItemsRaw.map((x) => [String(x.id), x]));

  const mergedLines = (incomingLines || []).map((l: any) => {
    const old = prevById.get(String(l.id));

    const barcode_text =
      l?.barcode_text ??
      l?.barcode?.barcode ??
      old?.barcode_text ??
      old?.barcode?.barcode ??
      null;

    const barcodeObj = l?.barcode ?? old?.barcode ?? null;

    return {
      ...(old || {}),
      ...(l || {}),
      exp: l?.exp ?? old?.exp ?? null,
      lot_serial: l?.lot_serial ?? old?.lot_serial ?? null,
      lot: l?.lot ?? old?.lot ?? null,
      lock_no_list:
        l?.lock_no_list ?? old?.lock_no_list ?? old?.lock_no ?? null,
      lock_no: l?.lock_no ?? old?.lock_no ?? null,
      barcode_text,
      barcode: barcodeObj,
    };
  });

  return {
    ...(prev as any),
    items: mergedLines,
  };
};

const PutTransferExpNcr = () => {
  const navigate = useNavigate();
  const params = useParams();
  const no = decodeURIComponent(String(params.no ?? "").trim());

  const locationRouter = useLocation();
  const navState = useMemo(() => {
    return (locationRouter.state as any) || {};
  }, [locationRouter.state]);

  const navStatus = navState.status as string | undefined;
  const navView = navState.view || "transfer";
  const navMode = navState.mode as "put" | "view" | undefined;

  const stateDetailList = useMemo(() => {
    return Array.isArray(navState.detailList) ? navState.detailList : [];
  }, [navState.detailList]);

  const stateDetailTotal = Number(navState.detailTotal ?? 0);

  const [detailList, setDetailList] = useState<Array<{ no: string }>>([]);

  // ===== refs =====
  const scanLocationInputRef = useRef<HTMLInputElement>(null);
  const scanBarcodeInputRef = useRef<HTMLInputElement>(null);

  // ===== data =====
  const [loading, setLoading] = useState(false);
  const [transfer, setTransfer] = useState<TransferType | null>(null);

  // ===== scan states =====
  const [scanLocation, setScanLocation] = useState("");
  const [confirmedLocation, setConfirmedLocation] =
    useState<ConfirmedLocation | null>(null);
  const [isLocationScanOpen, setIsLocationScanOpen] = useState(false);

  // ===== ui =====
  type ViewMode = "pending" | "done";
  const [viewMode, setViewMode] = useState<ViewMode>("pending");
  const [searchFilter, setSearchFilter] = useState("");

  // ✅ local count store (เหมือน inboundById)
  const [countByLoc, setCountByLoc] = useState<CountByLoc>({});
  const activeLocKey: string = (confirmedLocation?.full_name || "").trim();

  // ===== Edit Put qty (inline) =====
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const editInputRef = useRef<Record<string, HTMLInputElement | null>>({});

  const [_confirmedLocations, setConfirmedLocations] = useState<
    ConfirmedLocation[]
  >([]);

  const getUserRef = () => {
    const first = (localStorage.getItem("first_name") || "").trim();
    const last = (localStorage.getItem("last_name") || "").trim();
    return `${first} ${last}`.trim();
  };

  const applyTransferDocSocketDetail = useCallback((payload: any) => {
    const detail =
      payload?.detail ?? payload?.data?.detail ?? payload?.data ?? payload;

    const lines = Array.isArray(detail?.lines) ? detail.lines : null;
    if (!lines) return;

    setTransfer((prev) => {
      if (!prev) return prev;
      const nextTransfer = mergeTransferItems(prev, lines);
      setCountByLoc(buildCountByLocFromTransfer(nextTransfer as TransferType));
      return nextTransfer;
    });
  }, []);

  const location = (transfer as any)?.location;
  const locationDest = (transfer as any)?.location_dest;

  const isExpNcrReturn =
    location === "WH/M_EXP&NCR" && locationDest === "WH/MDT";

  const buildCountByLocFromTransfer = (
    row: TransferType | null,
  ): CountByLoc => {
    const next: CountByLoc = {};
    const items = Array.isArray(row?.items) ? row.items : [];

    for (const item of items) {
      const puts = Array.isArray(item.put_locations) ? item.put_locations : [];
      for (const p of puts) {
        const loc = String(p.location_name ?? "").trim();
        if (!loc) continue;
        if (!next[loc]) next[loc] = {};
        next[loc][String(item.id)] = Number(p.confirmed_put ?? 0);
      }
    }

    return next;
  };
  // =========================
  // ✅ SCAN helpers (STRICT เหมือน ScanBox)
  // match: barcode_text + lot_serial + exp6ท้าย
  // lot_serial null/"" => XXXXXX
  // exp null => 999999
  // =========================
  const normalize = (v: unknown) =>
    String(v ?? "")
      .replace(/\s|\r|\n|\t/g, "")
      .trim();

  const getAllLocCountsForItem = useCallback(
    (item: TransferItemType) => {
      const localRows = Object.entries(countByLoc || {})
        .map(([loc, map]) => ({
          loc,
          qty: Number(map?.[String(item.id)] ?? 0),
        }))
        .filter((x) => x.qty > 0);

      if (localRows.length > 0) {
        localRows.sort((a, b) => {
          const aActive = a.loc === activeLocKey ? 0 : 1;
          const bActive = b.loc === activeLocKey ? 0 : 1;
          if (aActive !== bActive) return aActive - bActive;
          return a.loc.localeCompare(b.loc, "th", { numeric: true });
        });
        return localRows;
      }

      const backendRows = Array.isArray(item.put_locations)
        ? item.put_locations.map((x) => ({
            loc: String(x.location_name ?? "").trim(),
            qty: Number(x.confirmed_put ?? 0),
          }))
        : [];

      return backendRows.filter((x) => x.loc && x.qty > 0);
    },
    [countByLoc, activeLocKey],
  );

  // ===== Items =====
  const allItems: TransferItemType[] = useMemo(() => {
    const raw = (transfer as any)?.items;
    return Array.isArray(raw) ? (raw as TransferItemType[]) : [];
  }, [transfer]);

  // =========================
  // ✅ counting helpers (เหมือน inboundById)
  // =========================
  const getQtyLimit = (it: TransferItemType) =>
    Number((it as any).quantity_count ?? 0);

  const getCountAtLoc = useCallback(
    (loc: string, itemId: string) => {
      const lk = (loc || "").trim();
      if (!lk) return 0;
      return Number(countByLoc[lk]?.[String(itemId)] ?? 0);
    },
    [countByLoc],
  );

  const getTotalCount = useCallback(
    (itemId: string) => {
      let sum = 0;
      for (const locMap of Object.values(countByLoc || {})) {
        sum += Number(locMap?.[String(itemId)] ?? 0);
      }
      return sum;
    },
    [countByLoc],
  );

  const getEffectiveCountPut = useCallback((it: TransferItemType) => {
    return Number((it as any).quantity_put ?? 0);
  }, []);

  const setCountAtLoc = useCallback(
    (locFullName: string, itemId: string, qty: number) => {
      const lk = (locFullName || "").trim();
      if (!lk) return;

      setCountByLoc((prev) => {
        const currLocMap = prev[lk] || {};
        return {
          ...prev,
          [lk]: { ...currLocMap, [String(itemId)]: Number(qty ?? 0) },
        };
      });
    },
    [],
  );

  // =========================
  // ✅ lock check: ถ้า scan location แล้ว location ปัจจุบันไม่อยู่ใน lock_locations -> แดง
  // "lock_locations": [{ location_name, qty }]
  // =========================
  //   const isLockAllowedForItemAtLoc = useCallback(
  //     (it: any, locFullName: string) => {
  //       const loc = String(locFullName ?? "").trim();
  //       if (!loc) return true;

  //       const locks = Array.isArray(it?.lock_locations) ? it.lock_locations : [];
  //       if (locks.length === 0) return true; // ถ้า backend ไม่ส่ง lock_locations มา ก็ไม่ block

  //       return locks.some(
  //         (x: any) => String(x?.location_name ?? "").trim() === loc,
  //       );
  //     },
  //     [],
  //   );

  // =========================
  // ✅ done/progress (เหมือน inboundById)
  // =========================
  const isDoneItem = useCallback(
    (it: TransferItemType) => {
      const qty = getQtyLimit(it);
      const pick = getEffectiveCountPut(it);
      return qty > 0 && pick === qty;
    },
    [getEffectiveCountPut],
  );

  const isProgressItem = useCallback(
    (it: TransferItemType) => {
      const qty = getQtyLimit(it);
      const pick = getEffectiveCountPut(it);
      return pick > 0 && qty > 0 && pick < qty;
    },
    [getEffectiveCountPut],
  );

  const pendingItems = useMemo(
    () => allItems.filter((x) => !isDoneItem(x)),
    [allItems, isDoneItem],
  );

  const doneItems = useMemo(
    () => allItems.filter((x) => isDoneItem(x)),
    [allItems, isDoneItem],
  );

  const pendingCount = pendingItems.length;
  const doneCount = doneItems.length;

  // ✅ auto switch tab: ถ้า pending หมด → ไป done
  useEffect(() => {
    if (pendingCount === 0 && doneCount > 0) setViewMode("done");
  }, [pendingCount, doneCount]);

  const viewItems = viewMode === "done" ? doneItems : pendingItems;

  // ✅ search
  const filteredItems = useMemo(() => {
    const s = searchFilter.trim().toLowerCase();
    if (!s) return viewItems;

    return viewItems.filter((it: any) => {
      const code = String(it?.code ?? "").toLowerCase();
      const name = String(it?.name ?? "").toLowerCase();
      const lot = String(it?.lot_serial ?? it?.lot ?? "").toLowerCase();
      const lock = String(it?.lock_no_list ?? it?.lock_no ?? "").toLowerCase();
      return (
        code.includes(s) ||
        name.includes(s) ||
        lot.includes(s) ||
        lock.includes(s)
      );
    });
  }, [viewItems, searchFilter]);

  // ✅ sort: ใน tab pending ให้ progress (เหลือง) ขึ้นบนสุด
  const rowsToRender = useMemo(() => {
    const arr = [...filteredItems];
    if (viewMode !== "pending") return arr;

    arr.sort((a: any, b: any) => {
      const pa = isProgressItem(a) ? 0 : 1; // progress first
      const pb = isProgressItem(b) ? 0 : 1;
      if (pa !== pb) return pa - pb;

      // ถ้าอยากให้ใกล้ครบขึ้นก่อน (pick มากกว่า) ก็จัดต่อได้
      const qa = getQtyLimit(a);
      const qb = getQtyLimit(b);
      const ca = getEffectiveCountPut(a);
      const cb = getEffectiveCountPut(b);
      const ra = qa > 0 ? ca / qa : 0;
      const rb = qb > 0 ? cb / qb : 0;
      return rb - ra;
    });

    return arr;
  }, [
    filteredItems,
    viewMode,
    isProgressItem,
    getQtyLimit,
    getEffectiveCountPut,
  ]);

  // =========================
  // ✅ find item by scan (STRICT: barcode_text + lot_serial + exp6ท้าย)
  // =========================
  // const onScanBarcode = (payload: any) => {
  //   const data = payload?.data ?? payload;
  //   applyTransferDocSocketDetail(data);
  // };

  // =========================
  // ✅ API shape guard (กัน resp.data แปลก)
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
  // ✅ fetch detail
  // =========================
  const fetchDetail = useCallback(async () => {
    if (!no) return;
    setLoading(true);

    try {
      const resp = await transferApi.getDetailExpNcr(no);
      let row = pickTransferFromAnyShape(resp.data);

      // Normalize: ensure items field exists
      if (row && !row.items && (row.lines || row.details)) {
        row = {
          ...row,
          items: row.lines ?? row.details ?? [],
        };
      }

      setTransfer(row);

      setCountByLoc(buildCountByLocFromTransfer(row));

      // reset scan context (แต่ไม่ reset countByLoc เพื่อกันกรณี refresh ระหว่างทำงาน)
      setScanLocation("");
      setConfirmedLocation(null);
      setIsLocationScanOpen(false);
      if (scanBarcodeInputRef.current) scanBarcodeInputRef.current.value = "";
    } catch (err: any) {
      console.error(err);
      toast.error(
        err?.response?.data?.message || "Fetch transfer detail failed",
      );
      setTransfer(null);
    } finally {
      setLoading(false);
    }
  }, [no]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

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
          const resp = await transferApi.getExpNcrPaginated({
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
        console.error("Error fetching transfer detail list:", error);
        setDetailList(stateRows);
      }
    };

    fetchDetailList();
  }, [navStatus, stateDetailList, stateDetailTotal]);

  useEffect(() => {
    if (!no) return;

    socket.emit("transfer_doc:join", { no });

    return () => {
      socket.emit("transfer_doc:leave", { no });
    };
  }, [no]);

  useEffect(() => {
    const onConfirmPut = (payload: any) => {
      const data = payload?.data ?? payload;
      applyTransferDocSocketDetail(data);
      setCountByLoc({});
    };

    const onConfirmPick = (payload: any) => {
      const data = payload?.data ?? payload;
      applyTransferDocSocketDetail(data);
    };

    const onScanBarcode = (payload: any) => {
      const data = payload?.data ?? payload;
      applyTransferDocSocketDetail(data);
    };

    socket.on("transfer_doc:confirm_put", onConfirmPut);
    socket.on("transfer_doc:confirm_pick", onConfirmPick);
    socket.on("transfer_doc:scan_barcode_put", onScanBarcode);

    return () => {
      socket.off("transfer_doc:confirm_put", onConfirmPut);
      socket.off("transfer_doc:confirm_pick", onConfirmPick);
      socket.off("transfer_doc:scan_barcode_put", onScanBarcode);
    };
  }, [applyTransferDocSocketDetail]);

  // =========================
  // ✅ scan toggle (เหมือน inboundById)
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
  // ✅ Scan Location (สำคัญ: merge lines เพื่อไม่ให้ Lock No. หาย)
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

      const resp = await transferApi.scanLocation(no, {
        location_full_name: fullName,
      });

      const payload = resp.data as any;

      const locations = Array.isArray(payload?.locations)
        ? payload.locations
        : payload?.location
          ? [payload.location]
          : [];

      if (locations.length === 0) {
        throw new Error("ไม่พบข้อมูล location จาก backend");
      }

      const normalizedLocations = locations.map((loc: any) => ({
        id: Number(loc?.location_id ?? 0),
        full_name: String(loc?.location_name ?? "").trim(),
        ncr_check: loc?.ncr_check ?? null,
      }));

      const firstLoc = normalizedLocations[0];

      setConfirmedLocation({
        id: firstLoc.id,
        full_name: firstLoc.full_name,
      });
      setConfirmedLocations(normalizedLocations);

      setScanLocation(firstLoc.full_name);
      setIsLocationScanOpen(false);

      // ✅ merge items: เอา old fields มาเติม (กัน lock_no_list หาย)
      if (Array.isArray(payload?.lines)) {
        setTransfer((prev) => {
          if (!prev) return prev;

          const prevItemsRaw = ((prev as any).items || []) as any[];
          const prevById = new Map(prevItemsRaw.map((x) => [String(x.id), x]));

          const mergedLines = (payload.lines as any[]).map((l: any) => {
            const old = prevById.get(String(l.id));

            // กัน barcode_text หาย
            const barcode_text =
              l.barcode_text ??
              l.barcode?.barcode ??
              old?.barcode_text ??
              old?.barcode?.barcode ??
              null;

            const barcodeObj = l.barcode ?? old?.barcode ?? null;

            return { 
              ...(old || {}),
              ...(l || {}),
              // บังคับ preserve ฟิลด์ที่เคยหายบ่อย
              exp: l.exp ?? old?.exp ?? null,
              lot_serial: l.lot_serial ?? old?.lot_serial ?? null,
              lot: l.lot ?? old?.lot ?? null,
              lock_no_list:
                l.lock_no_list ?? old?.lock_no_list ?? old?.lock_no ?? null,
              lock_no: l.lock_no ?? old?.lock_no ?? null,
              barcode_text,
              barcode: barcodeObj,
            } as any;
          });

          return { ...(prev as any), items: mergedLines } as any;
        });
      }

      toast.success(`Location OK: ${firstLoc.full_name}`);
      setTimeout(() => scanBarcodeInputRef.current?.focus(), 80);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Scan Location ไม่สำเร็จ");
      setConfirmedLocation(null);
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // ✅ Scan Barcode/Serial (LOCAL ONLY) — ไม่เรียก transferApi.scanBarcode
  // =========================
  const handleScanBarcodeKeyDown = async (
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

    const raw = scanBarcodeInputRef.current?.value ?? "";
    const scanned = normalize(raw);
    if (!scanned) return;

    if (scanned.toUpperCase() === "CHANGELOCATION") {
      if (scanBarcodeInputRef.current) scanBarcodeInputRef.current.value = "";
      setScanLocation("");
      setConfirmedLocation(null);
      setIsLocationScanOpen(true);
      setTimeout(() => scanLocationInputRef.current?.focus(), 0);
      return;
    }

    try {
      setLoading(true);

      const resp = await transferApi.scanBarcodePut(no, {
        barcode: scanned,
        location_full_name: confirmedLocation.full_name,
        user_ref: getUserRef(),
      });

      const data = resp.data;

      // ✅ update UI จาก BE response
      applyTransferDocSocketDetail(data);

      // optional: show toast
      toast.success("Scan สำเร็จ");

      // clear input
      if (scanBarcodeInputRef.current) {
        scanBarcodeInputRef.current.value = "";
        scanBarcodeInputRef.current.focus();
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Scan ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const handleEditCancel = () => {
    setEditingItemId(null);
    setEditValue("");
  };

  const handleEditSave = useCallback(
    (it: TransferItemType) => {
      const itemId = String((it as any).id);
      if (!confirmedLocation?.full_name) {
        warningAlert("กรุณา Scan Location ก่อน");
        return;
      }

      const newValue = parseInt(editValue, 10);
      if (Number.isNaN(newValue) || newValue < 0) {
        toast.error("กรุณาใส่ตัวเลขที่ถูกต้อง");
        return;
      }

      const limit = getQtyLimit(it);
      const loc = confirmedLocation.full_name;

      const currentAtLoc = getCountAtLoc(loc, itemId);
      const localTotal = getTotalCount(itemId);

      // backend put (ทั้งใบ) — ไม่มี breakdown ต่อ loc ก็จริง แต่กัน overflow แบบปลอดภัย
      const backendPut = Number((it as any).quantity_put ?? 0);

      // ✅ baseTotal = max(backend, local)
      const baseTotal = Math.max(backendPut, localTotal);
      const totalWithoutThisLoc = Math.max(0, baseTotal - currentAtLoc);

      if (limit > 0 && totalWithoutThisLoc + newValue > limit) {
        toast.error(
          `ห้ามเกินจำนวน Pick (${limit}) — ตอนนี้ Location อื่นนับไปแล้ว ${totalWithoutThisLoc}`,
        );
        return;
      }

      setCountAtLoc(loc, itemId, newValue);

      setEditingItemId(null);
      setEditValue("");
      successAlert("แก้ไขจำนวน Put สำเร็จแล้ว");
    },
    [
      confirmedLocation,
      editValue,
      getCountAtLoc,
      getTotalCount,
      getQtyLimit,
      setCountAtLoc,
    ],
  );

  // =========================
  // ✅ Confirm (ส่ง countByLoc แบบเดิม)
  // =========================
  const handleConfirm = async () => {
    if (!no) return;

    const user_ref = getUserRef();
    if (!user_ref) {
      warningAlert(
        "ไม่พบชื่อผู้ใช้งาน (first_name/last_name) กรุณา login ใหม่",
      );
      return;
    }

    let locationsPayload = Object.entries(countByLoc)
      .map(([location_full_name, itemMap]) => {
        const lines = Object.entries(itemMap)
          .map(([itemId, qty]) => ({
            transfer_item_id: String(itemId),
            quantity_put: Number(qty ?? 0),
          }))
          .filter((x) => x.quantity_put > 0);

        return {
          location_full_name,
          lines,
        };
      })
      .filter((x) => x.location_full_name.trim() && x.lines.length > 0);

    // ✅ Fallback: ใช้ quantity_put จาก backend items
    if (locationsPayload.length === 0) {
      const linesFromItems = allItems
        .filter((it: any) => Number(it.quantity_put ?? 0) > 0)
        .map((it: any) => ({
          transfer_item_id: String(it.id),
          quantity_put: Number(it.quantity_put ?? 0),
        }));

      if (linesFromItems.length > 0) {
        locationsPayload = [
          {
            location_full_name: confirmedLocation?.full_name ?? "",
            lines: linesFromItems,
          },
        ];
      }
    }

    if (locationsPayload.length === 0) {
      warningAlert("ยังไม่มีรายการ Put ตาม Location");
      return;
    }

    const totalLines = locationsPayload.reduce(
      (sum, loc) => sum + loc.lines.length,
      0,
    );

    const c = await confirmAlert(
      `ยืนยันทำรายการ Put ${totalLines} รายการ / ${locationsPayload.length} Location ใช่ไหม?`,
    );
    if (!c.isConfirmed) return;

    try {
      setLoading(true);

      await transferApi.confirmToPut(no, {
        user_ref,
        locations: locationsPayload,
      });

      setLoading(false);
      await successAlert("ยืนยันสำเร็จแล้ว");
      navigate(`/tf-exp-ncr`);
    } catch (err: any) {
      setLoading(false);
      toast.error(err?.response?.data?.message || "Confirm ไม่สำเร็จ");
    }
  };

  const tableHeaders = [
    "No",
    "สินค้า",
    "ชื่อ",
    "Lot. Serial",
    "Expire Date",
    "หน่วย",
    "Lock No.",
    "Pick",
    "Put",
  ];

  // placeholder
  const isAllDoneBackend = false;
  const isConfirming = false;
  const isAllDoneUI = doneCount > 0 && pendingCount === 0;

  if (!transfer && loading) {
    return (
      <div className="transfer-exp-ncr-detail-container">
        <Loading />
      </div>
    );
  }

  const currentIndex =
    detailList.findIndex((x) => String(x.no) === String(no)) + 1;

  const total = detailList.length;

  const hasNavigator = detailList.length > 0 && currentIndex > 0;

  const handlePrev = () => {
    const idx = detailList.findIndex((x) => String(x.no) === String(no));
    if (idx <= 0) return;

    const prevItem = detailList[idx - 1];

    navigate(`/tf-exp-ncr/put/${encodeURIComponent(prevItem.no)}`, {
      state: {
        view: navView,
        mode: navMode,
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

    navigate(`/tf-exp-ncr-put/${encodeURIComponent(nextItem.no)}`, {
      state: {
        view: navView,
        mode: navMode,
        status: navStatus,
        detailList,
        detailTotal: total,
      },
    });
  };

  return (
    <div className="transfer-exp-ncr-detail-container">
      <div className="transfer-exp-ncr-detail-header transfer-detail-header-with-nav">
        <h1 className="transfer-exp-ncr-detail-title">
          PUT : {(transfer as any)?.no || no || "PUT"}
          {isExpNcrReturn && (
            <span className="transfer-exp-ncr-detail-title-sub">
              {" "}
              - นำสินค้ากลับจาก EXP&NCR{" "}
              <i className="fa-solid fa-arrow-rotate-right"></i>
            </span>
          )}
        </h1>

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

      <div className="transfer-exp-ncr-main-layout">
        <div className="transfer-exp-ncr-meta-panel">
          <div className="transfer-exp-ncr-info-row">
            <div className="transfer-exp-ncr-info-item">
              <label>Department :</label>
              <span>{(transfer as any)?.department || "data"}</span>
            </div>

            <div className="transfer-exp-ncr-info-item">
              <label>PO No. :</label>
              <span>{(transfer as any)?.origin || "data"}</span>
            </div>
          </div>

          <div className="transfer-exp-ncr-info-row">
            <div className="transfer-exp-ncr-info-item">
              <label>INV. Sup:</label>
              <span>{(transfer as any)?.reference || "data"}</span>
            </div>

            <div className="transfer-exp-ncr-info-item">
              <label>เวลารับเข้าเอกสาร:</label>
              <span>{formatDateTime((transfer as any)?.date) || "data"}</span>
            </div>
          </div>
        </div>

        {!isAllDoneBackend && (
          <div
            className={`transfer-exp-ncr-scan-sticky-wrap ${
              viewMode === "done" ? "no-sticky" : ""
            }`}
          >
            <div className="transfer-exp-ncr-scan-panel">
              <div className="transfer-exp-ncr-scan-row">
                <label>Scan Location EXP&NCR :</label>

                <input
                  ref={scanLocationInputRef}
                  type="text"
                  className="transfer-exp-ncr-scan-input"
                  value={scanLocation}
                  onChange={(e) => setScanLocation(e.target.value)}
                  onKeyDown={handleScanLocationKeyDown}
                  placeholder="Scan Location EXP&NCR"
                  disabled={!isLocationScanOpen || isAllDoneBackend}
                  style={{
                    borderColor: confirmedLocation ? "#4CAF50" : undefined,
                    opacity: isLocationScanOpen && !isAllDoneBackend ? 1 : 0.6,
                  }}
                />

                <button
                  type="button"
                  className={`transfer-exp-ncr-btn-scan-toggle ${
                    isLocationScanOpen ? "active" : ""
                  }`}
                  onClick={toggleLocationScan}
                  disabled={isAllDoneBackend}
                >
                  {isLocationScanOpen ? (
                    <i className="fa-solid fa-xmark"></i>
                  ) : (
                    <i className="fa-solid fa-qrcode"></i>
                  )}
                </button>
              </div>

              <div className="transfer-exp-ncr-scan-row">
                <label>Scan Barcode/Serial :</label>

                <input
                  ref={scanBarcodeInputRef}
                  type="text"
                  className="transfer-exp-ncr-scan-input"
                  onKeyDown={handleScanBarcodeKeyDown}
                  placeholder="Scan Barcode/Serial"
                  disabled={!confirmedLocation || isAllDoneBackend}
                />

                <div className="transfer-exp-ncr-scan-spacer" />
              </div>
            </div>
          </div>
        )}

        <div className="transfer-exp-ncr-search-section">
          <hr className="transfer-exp-ncr-detail-divider" />

          <div className="transfer-exp-ncr-search-bar">
            <div className="transfer-exp-ncr-search-left">
              <div className="transfer-exp-ncr-view-tabs">
                {pendingCount > 0 && (
                  <button
                    type="button"
                    className={`transfer-exp-ncr-tab ${
                      viewMode === "pending" ? "active" : ""
                    }`}
                    onClick={() => setViewMode("pending")}
                  >
                    ยังไม่ได้ดำเนินการ{" "}
                    <span className="badge">{pendingCount}</span>
                  </button>
                )}

                {doneCount > 0 && (
                  <button
                    type="button"
                    className={`transfer-exp-ncr-tab ${
                      viewMode === "done" ? "active" : ""
                    }`}
                    onClick={() => setViewMode("done")}
                  >
                    ดำเนินการเสร็จสิ้นแล้ว{" "}
                    <span className="badge">{doneCount}</span>
                  </button>
                )}
              </div>

              {!isAllDoneBackend && isAllDoneUI ? (
                <div className="transfer-exp-ncr-hint-done">
                  ทำครบทุกบรรทัดแล้ว ✅ กด “ยืนยัน” เพื่อบันทึก
                </div>
              ) : null}

              {confirmedLocation ? (
                <div className="transfer-exp-ncr-hint-loc">
                  Location ปัจจุบัน: <b>{confirmedLocation.full_name}</b>
                </div>
              ) : null}
            </div>

            <div className="transfer-exp-ncr-search-right">
              <label className="transfer-exp-ncr-search-label">Search</label>
              <div className="transfer-exp-ncr-search-input-container">
                <i className="fa-solid fa-magnifying-glass transfer-exp-ncr-search-icon"></i>
                <input
                  type="text"
                  className="transfer-exp-ncr-search-input"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Filter Search"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ===== Table ===== */}
        <div className="table__wrapper transfer-exp-ncr-table-section">
          <Table headers={tableHeaders as any}>
            {rowsToRender.length === 0 ? (
              <tr>
                <td colSpan={tableHeaders.length} className="no-data">
                  No items found.
                </td>
              </tr>
            ) : (
              rowsToRender.map((it: any, index) => {
                const put = getEffectiveCountPut(it); // ✅ local+backend
                const qtyLimit = getQtyLimit(it);

                const isDone = qtyLimit > 0 && put === qtyLimit;
                const isProgress = put > 0 && qtyLimit > 0 && put < qtyLimit;

                // เดิมคุณมี lockMismatch + row-lock-mismatch
                const rowClass = [
                  isDone ? "row-done" : isProgress ? "row-progress" : "",
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <tr key={`${it.id}-${index}`} className={rowClass}>
                    <td>{index + 1}</td>
                    <td style={{ minWidth: "200px" }}>{it.code || "--"}</td>
                    <td style={{ minWidth: "200px" }}>{it.name || "--"}</td>
                    <td>{it.lot_serial ?? it.lot ?? "--"}</td>
                    <td>{it.exp ? formatDateTime(it.exp) : "--"}</td>
                    <td>{it.unit || "--"}</td>
                    <td style={{ minWidth: 220 }}>
                      {Array.isArray(it?.lock_no_list) &&
                      it.lock_no_list.length > 0 ? (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                          }}
                        >
                          {it.lock_no_list
                            .filter(Boolean)
                            .map((lock: string, i: number) => (
                              <div key={`${lock}-${i}`}>{lock}</div>
                            ))}
                        </div>
                      ) : (
                        (it.lock_no ?? "--")
                      )}
                    </td>

                    <td>{qtyLimit}</td>
                    <td>
                      {editingItemId === String(it.id) ? (
                        <div className="edit-qty-container">
                          <input
                            ref={(el) => {
                              editInputRef.current[String(it.id)] = el;
                            }}
                            type="number"
                            min={0}
                            max={qtyLimit}
                            className="edit-qty-input"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleEditSave(it);
                              if (e.key === "Escape") handleEditCancel();
                            }}
                          />
                          <button
                            className="btn-save-edit"
                            onClick={() => handleEditSave(it)}
                          >
                            ✓
                          </button>
                          <button
                            className="btn-cancel-edit"
                            onClick={handleEditCancel}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div style={{ lineHeight: 1.15 }}>
                          {(() => {
                            const itemId = String(it.id);

                            const backendPut = Number(
                              (it as any).quantity_put ?? 0,
                            );
                            const localTotal = getTotalCount(itemId);
                            const totalPut = Math.max(backendPut, localTotal);

                            const locBreakdown = getAllLocCountsForItem(it);

                            return (
                              <>
                                <div style={{ fontWeight: 700 }}>
                                  {totalPut}
                                </div>

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
                                        ที่ {x.loc}: {x.qty}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* ✅ ถ้าต้องการให้ “คลิกเพื่อแก้” เฉพาะ input_number */}
                                {/* {(it as any).input_number ? (
                                <button
                                  type="button"
                                  className="btn-link-edit"
                                  style={{ marginTop: 6 }}
                                  onClick={() => {
                                    if (!confirmedLocation?.full_name) {
                                      warningAlert("กรุณา Scan Location ก่อน");
                                      return;
                                    }
                                    const loc = confirmedLocation.full_name;
                                    const currentAtLoc = getCountAtLoc(
                                      loc,
                                      itemId,
                                    );
                                    openInlineEdit(itemId, currentAtLoc);
                                  }}
                                >
                                  แก้ไขจำนวน (Location นี้)
                                </button>
                              ) : null} */}
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </Table>
        </div>
      </div>

      {/* ===== Footer ===== */}
      <div className="transfer-exp-ncr-detail-footer">
        <button
          className="transfer-exp-ncr-btn-cancel"
          onClick={() => navigate("/tf-exp-ncr")}
          disabled={isConfirming}
        >
          ย้อนกลับ
        </button>

        <button
          className="transfer-exp-ncr-btn-confirm"
          onClick={handleConfirm}
          disabled={loading}
        >
          ยืนยัน
        </button>
      </div>

      {loading && (
        <div className="loading-overlay">
          <Loading />
        </div>
      )}
    </div>
  );
};

export default PutTransferExpNcr;
