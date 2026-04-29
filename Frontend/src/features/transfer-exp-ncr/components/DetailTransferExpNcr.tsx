import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Swal from "sweetalert2";
import { toast } from "react-toastify";

import { confirmAlert, successAlert, warningAlert } from "../../../utils/alert";
import { transferApi } from "../services/transfer.api";
import type { TransferType, TransferItemType } from "../types/tranfers.type";

import Table from "../../../components/Table/Table";
import "../../../components/Button/button.css";
import "../../../components/Table/table.css";
import "../../../styles/component.css";
import { formatDateTime } from "../../../components/Datetime/FormatDateTime";

import { socket } from "../../../services/socket";

import Loading from "../../../components/Loading/Loading";
import "../transfer-exp-ncr.css";

import DetailNavigator from "../../../components/DetailNavigator/DetailNavigator";

type ConfirmedLocation = { id: number; full_name: string };
type LocKey = string;
type CountByLoc = Record<LocKey, Record<string, number>>;
type ViewMode = "pending" | "done";

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

const DetailTransferExpNcr = () => {
  const navigate = useNavigate();
  const params = useParams();
  const no = decodeURIComponent(String(params.no ?? "").trim());

  const locationState = useLocation();

  const stateDetailList = Array.isArray(
    (locationState.state as any)?.detailList,
  )
    ? (locationState.state as any)?.detailList
    : [];

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
  const [viewMode, setViewMode] = useState<ViewMode>("pending");
  const [searchFilter, setSearchFilter] = useState("");

  const [detailList, setDetailList] = useState<any[]>(stateDetailList);

  // local count store (เหมือน inboundById)
  const [countByLoc, setCountByLoc] = useState<CountByLoc>({});
  const activeLocKey: string = (confirmedLocation?.full_name || "").trim();

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
      return mergeTransferItems(prev, lines);
    });
  }, []);

  const location = (transfer as any)?.location;
  const locationDest = (transfer as any)?.location_dest;

  const isExpNcrReturn =
    location === "WH/M_EXP&NCR" && locationDest === "WH/MDT";

  // =========================
  // scan helpers (STRICT เหมือน ScanBox)
  // barcode_text + lot_serial + exp(6ท้าย)
  // =========================
  const normalize = (v: unknown) =>
    String(v ?? "")
      .replace(/\s|\r|\n|\t/g, "")
      .trim();

  // =========================
  const allItems: TransferItemType[] = useMemo(() => {
    const raw =
      (transfer as any)?.items ??
      (transfer as any)?.lines ??
      (transfer as any)?.details;
    return Array.isArray(raw) ? (raw as TransferItemType[]) : [];
  }, [transfer]);

  // =========================
  // counting helpers (เหมือน inboundById)
  // =========================
  const getQtyLimit = (it: TransferItemType) =>
    Number((it as any).quantity_receive ?? (it as any).qty ?? 0);

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

  const getEffectiveCount = useCallback(
    (it: TransferItemType) => {
      const itemId = String((it as any).id);
      const backend = Number((it as any).quantity_count ?? 0);
      const local = getTotalCount(itemId);
      return Math.max(backend, local);
    },
    [getTotalCount],
  );

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
  const isLockAllowedForItemAtLoc = useCallback(
    (it: any, locFullName: string) => {
      const loc = String(locFullName ?? "").trim();
      if (!loc) return true;

      const locks = Array.isArray(it?.lock_locations) ? it.lock_locations : [];
      if (locks.length === 0) return true; // ถ้า backend ไม่ส่ง lock_locations มา ก็ไม่ block

      return locks.some(
        (x: any) => String(x?.location_name ?? "").trim() === loc,
      );
    },
    [],
  );

  // =========================
  // ✅ done/progress (เหมือน inboundById)
  // =========================
  const isDoneItem = useCallback(
    (it: TransferItemType) => {
      const qty = getQtyLimit(it);
      const pick = getEffectiveCount(it);
      return qty > 0 && pick === qty;
    },
    [getEffectiveCount],
  );

  const isProgressItem = useCallback(
    (it: TransferItemType) => {
      const qty = getQtyLimit(it);
      const pick = getEffectiveCount(it);
      return pick > 0 && qty > 0 && pick < qty;
    },
    [getEffectiveCount],
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
      const ca = getEffectiveCount(a);
      const cb = getEffectiveCount(b);
      const ra = qa > 0 ? ca / qa : 0;
      const rb = qb > 0 ? cb / qb : 0;
      return rb - ra;
    });

    return arr;
  }, [filteredItems, viewMode, isProgressItem, getQtyLimit, getEffectiveCount]);

  // =========================
  // find item by scan (barcode_text + lot_serial + exp)
  // =========================
  // =========================
  // find item by scan (STRICT: barcode_text + lot_serial + exp6ท้าย

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
      let row = pickTransferFromAnyShape(resp.data);

      // Normalize: ensure items field exists
      if (row && !row.items && (row.lines || row.details)) {
        row = {
          ...row,
          items: row.lines ?? row.details ?? [],
        };
      }

      setTransfer(row);

      // reset scan context (ไม่ reset countByLoc)
      setScanLocation("");
      setConfirmedLocation(null);
      setIsLocationScanOpen(false);
      if (scanBarcodeInputRef.current) scanBarcodeInputRef.current.value = "";
    } catch (err: any) {
      console.error(err);
      Swal.fire({
        icon: "error",
        title: "โหลดรายละเอียดไม่สำเร็จ",
        text: err?.response?.data?.message || "เกิดข้อผิดพลาด",
      });
      setTransfer(null);
    } finally {
      setLoading(false);
    }
  }, [no]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // Fetch transfers list for navigation
  useEffect(() => {
    if (stateDetailList.length > 0) {
      setDetailList(stateDetailList);
      return;
    }

    const fetchTransfersList = async () => {
      try {
        const response = await transferApi.getExpNcrPaginated({
          page: 1,
          limit: 100,
          columns: "no,department,date",
        });

        const { data = [] } = response.data as any;
        setDetailList(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Error fetching transfers list for navigation:", error);
        setDetailList([]);
      }
    };

    fetchTransfersList();
  }, [stateDetailList]);

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
    socket.on("transfer_doc:scan_barcode", onScanBarcode);

    return () => {
      socket.off("transfer_doc:confirm_put", onConfirmPut);
      socket.off("transfer_doc:confirm_pick", onConfirmPick);
      socket.off("transfer_doc:scan_barcode", onScanBarcode);
    };
  }, [applyTransferDocSocketDetail]);

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
  // Scan Location (merge lines กัน Lock No. หาย)
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

      const locId = Number(
        payload?.location?.location_id ?? payload?.location_id ?? 0,
      );

      setConfirmedLocation({ id: locId || 0, full_name: locName });
      setScanLocation(locName);
      setIsLocationScanOpen(false);

      if (Array.isArray(payload?.lines)) {
        setTransfer((prev) => {
          if (!prev) return prev;

          const prevItemsRaw = ((prev as any).items || []) as any[];
          const prevById = new Map(prevItemsRaw.map((x) => [String(x.id), x]));

          const mergedLines = (payload.lines as any[]).map((l: any) => {
            const old = prevById.get(String(l.id));

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
              exp: l.exp ?? old?.exp ?? null,
              lot_serial: l.lot_serial ?? old?.lot_serial ?? null,
              lot: l.lot ?? old?.lot ?? null,
              lock_no_list:
                l.lock_no_list ?? old?.lock_no_list ?? old?.lock_no ?? null,
              lock_no: l.lock_no ?? old?.lock_no ?? null,
              barcode_text,
              barcode: barcodeObj,
            };
          });

          return { ...(prev as any), items: mergedLines } as any;
        });
      }

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
  // Scan Barcode/Serial (LOCAL ONLY)
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

      const resp = await transferApi.scanBarcode(no, {
        barcode: scanned,
        qty_input: 1,
        location_full_name: confirmedLocation.full_name,
      });

      const data = resp.data as any;
      const matchedLine = data?.matchedLine;

      if (!matchedLine?.id) {
        toast.error("ไม่พบรายการที่ตรงกับ barcode");
        return;
      }

      applyTransferDocSocketDetail(data);

      const itemId = String(matchedLine.id);
      const qtyLimit = Number(
        matchedLine.quantity_receive ??
          matchedLine.qty ??
          matchedLine.qty_required ??
          0,
      );

      const loc = confirmedLocation.full_name;
      const currentAtLoc = getCountAtLoc(loc, itemId);
      const totalNow = getEffectiveCount({
        ...matchedLine,
        id: matchedLine.id,
      } as TransferItemType);

      if (qtyLimit > 0 && totalNow >= qtyLimit) {
        if (scanBarcodeInputRef.current) scanBarcodeInputRef.current.value = "";
        return;
      }

      setCountAtLoc(loc, itemId, currentAtLoc + 1);

      toast.success(
        `เพิ่ม Pick: ${matchedLine?.name || matchedLine?.code || "สินค้า"}`,
      );

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

  // =========================
  // Confirm
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

    // ✅ ใช้ quantity_count จาก backend items แทน countByLoc
    const linesFromItems = allItems
      .filter((it: any) => Number(it.quantity_count ?? 0) > 0)
      .map((it: any) => ({
        transfer_item_id: String(it.id),
        quantity_count: Number(it.quantity_count ?? 0),
      }));

    if (linesFromItems.length === 0) {
      warningAlert("ยังไม่มีรายการที่นับ (Pick = 0 ทั้งหมด)");
      return;
    }

    const payloadLocations = [
      {
        location_full_name: confirmedLocation?.full_name ?? "",
        lines: linesFromItems,
      },
    ];

    const totalLines = linesFromItems.length;

    const c = await confirmAlert(
      `ยืนยันทำรายการ Pick ${totalLines} รายการ ใช่ไหม?`,
    );
    if (!c.isConfirmed) return;

    try {
      setLoading(true);
      await transferApi.confirmToPick(no, {
        user_ref,
        locations: payloadLocations,
      });

      // ✅ สำคัญ: ปิด overlay ก่อนเปิด successAlert
      setLoading(false);

      await successAlert("ยืนยันสำเร็จแล้ว");
      navigate(`/tf-exp-ncr-put/${encodeURIComponent(no)}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Confirm ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  // ✅ วางตรงนี้
  const currentIndex =
    detailList.findIndex((x) => String(x.no) === String(no)) + 1;

  const total = detailList.length;

  const handlePrev = () => {
    const idx = detailList.findIndex((x) => String(x.no) === String(no));
    if (idx <= 0) return;

    const prevItem = detailList[idx - 1];
    navigate(`/tf-exp-ncr/${encodeURIComponent(prevItem.no)}`, {
      state: {
        detailList,
        fromTab: (locationState.state as any)?.fromTab ?? "waiting",
      },
    });
  };

  const handleNext = () => {
    const idx = detailList.findIndex((x) => String(x.no) === String(no));
    if (idx < 0 || idx >= detailList.length - 1) return;

    const nextItem = detailList[idx + 1];
    navigate(`/tf-exp-ncr/${encodeURIComponent(nextItem.no)}`, {
      state: {
        detailList,
        fromTab: (locationState.state as any)?.fromTab ?? "waiting",
      },
    });
  };

  const tableHeaders = [
    "No",
    "สินค้า",
    "ชื่อ",
    "Lot. Serial",
    "Expire Date",
    "หน่วย",
    "Lock No.",
    "QTY",
    "Pick",
  ];

  const isAllDoneBackend = false;
  const isConfirming = false;

  if (!transfer && loading) {
    return (
      <div className="transfer-exp-ncr-detail-container">
        <Loading />
      </div>
    );
  }

  return (
    <div className="transfer-exp-ncr-detail-container">
      <div className="transfer-exp-ncr-detail-header">
        <div className="detail-header-with-nav">
          <h1 className="transfer-exp-ncr-detail-title">
            PICK : {(transfer as any)?.no || no || "PICK"}
            {isExpNcrReturn && (
              <span className="transfer-exp-ncr-detail-title-sub">
                {" "}
                - นำสินค้ากลับจาก EXP&NCR{" "}
                <i className="fa-solid fa-arrow-rotate-right"></i>
              </span>
            )}
          </h1>

          <DetailNavigator
            currentIndex={currentIndex}
            total={total}
            onPrev={handlePrev}
            onNext={handleNext}
            disablePrev={currentIndex <= 1}
            disableNext={currentIndex >= total}
          />
        </div>
      </div>

      <div className="transfer-exp-ncr-main-layout">
        {/* row 1 */}
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
                <label>Scan Location :</label>

                <input
                  ref={scanLocationInputRef}
                  type="text"
                  className="transfer-exp-ncr-scan-input"
                  value={scanLocation}
                  onChange={(e) => setScanLocation(e.target.value)}
                  onKeyDown={handleScanLocationKeyDown}
                  placeholder="Scan Location"
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
                <button
                  type="button"
                  className={`transfer-exp-ncr-tab ${
                    viewMode === "pending" ? "active" : ""
                  }`}
                  onClick={() => setViewMode("pending")}
                >
                  รอการดำเนินการ <span className="badge">{pendingCount}</span>
                </button>

                <button
                  type="button"
                  className={`transfer-exp-ncr-tab ${
                    viewMode === "done" ? "active" : ""
                  }`}
                  onClick={() => setViewMode("done")}
                >
                  ดำเนินการเสร็จสิ้น <span className="badge">{doneCount}</span>
                </button>
              </div>

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

        {/* Table */}
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
                const qty = getQtyLimit(it);
                const pick = getEffectiveCount(it);

                const isDone = qty > 0 && pick === qty;
                const isProgress = pick > 0 && qty > 0 && pick < qty;

                const lockMismatch =
                  !!activeLocKey &&
                  !isLockAllowedForItemAtLoc(it, activeLocKey);

                const rowClass = [
                  isDone ? "row-done" : isProgress ? "row-progress" : "",
                  lockMismatch ? "row-lock-mismatch" : "",
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <tr key={`${it.id}-${index}`} className={rowClass}>
                    <td>{index + 1}</td>
                    <td style={{ minWidth: "200px" }}>{it.code || "-"}</td>
                    <td style={{ minWidth: "200px" }}>{it.name || "-"}</td>
                    <td>{it.lot_serial ?? it.lot ?? "-"}</td>
                    <td>{it.exp ? formatDateTime(it.exp) : "-"}</td>
                    <td>{it.unit || "-"}</td>
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
                            .map((loc: string, i: number) => (
                              <div key={`${loc}-${i}`}>{loc}</div>
                            ))}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>{qty}</td>
                    <td>{pick}</td>
                  </tr>
                );
              })
            )}
          </Table>
        </div>
      </div>

      {/* Footer */}
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

export default DetailTransferExpNcr;
