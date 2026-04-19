

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import type { InboundType, GoodsInType } from "../types/inbound.type";
import { inboundApi } from "../services/inbound.api";
// import { goodinApi } from "../../goodin/services/goodin.api";
import BarcodeModal from "./BarcodeModal";
import AddBarcodeByGoodInIdModal from "./AddBarcodeByGoodInIdModal";

import { toast } from "react-toastify";
import { warningAlert, successAlert, confirmAlert } from "../../../utils/alert";

import Table from "../../../components/Table/Table";
import Loading from "../../../components/Loading/Loading";
import "../../../components/Button/button.css";
import "../../../components/Table/table.css";
import "../../../styles/component.css";
import "../inbound.css";

type MenuPos = { top: number; left: number };

// ✅ Sort types
type SortKey = "code" | "name" | null;
type SortDir = "asc" | "desc";

type SortState = { key: SortKey; dir: SortDir };

// ✅ View tabs
type ViewMode = "pending" | "done";

const InboundById = () => {
  const { no } = useParams<{ no: string }>();
  const navigate = useNavigate();

  const [inboundItem, setInboundItem] = useState<InboundType | null>(null);
  const [loading, setLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  // Scan inputs
  const [scanLocation, setScanLocation] = useState<string>("");
  const [scanBarcode, setScanBarcode] = useState<string>("");
  const scanBarcodeInputRef = useRef<HTMLInputElement>(null);

  // Search filter
  const [searchFilter, setSearchFilter] = useState<string>("");

  // Keep original data for reset + compare confirm
  const [originalData, setOriginalData] = useState<InboundType | null>(null);

  // Edit qty
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  // Barcode modal
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
  const [selectedGoodsIn, setSelectedGoodsIn] = useState<GoodsInType | null>(
    null,
  );
  const [isAddBarcodeOpen, setIsAddBarcodeOpen] = useState(false);

  // ✅ History: itemId -> stack of previous qty values
  const [_qtyHistory, setQtyHistory] = useState<Record<string, number[]>>({});

  // Dropdown state (portal+fixed)
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<Record<string, HTMLButtonElement | null>>({});

  const MENU_WIDTH = 190;
  const MENU_HEIGHT = 180;
  const GAP = 8;

  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });

  // ✅ View mode
  const [viewMode, setViewMode] = useState<ViewMode>("pending");

  // ✅ Confirmed location
  const [confirmedLocation, setConfirmedLocation] = useState<{
    full_name: string;
    id: number;
  } | null>(null);

  const handleScanLocationKeyDown = async (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key !== "Enter" && e.key !== "Tab") return;
    e.preventDefault();

    if (!no) return;
    const fullName = scanLocation.trim();
    if (!fullName) return;

    // ✅ ถ้า scan location ใหม่ แต่เคย confirm location แล้ว
    if (confirmedLocation && confirmedLocation.full_name !== fullName) {
      // ✅ กฎ: ห้ามเปลี่ยน location ถ้ามีการนับไปแล้ว (ยังไม่จบ)
      if (hasAnyCounted()) {
        warningAlert(
          "ไม่สามารถเปลี่ยน Location ได้ เพราะมีการนับสินค้าไปแล้ว กรุณานับให้ครบก่อน",
        );
        setScanLocation(confirmedLocation.full_name); // ดึงกลับ
        return;
      }

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

      // ✅ CALL backend (มันจะ validate location จริงให้ด้วย)
      const resp = await inboundApi.scanLocation(no, {
        location_full_name: fullName,
      });

      // ✅ response แนะนำให้ได้: location + lines
      const payload = resp.data as any;

      setConfirmedLocation({
        id: payload.location.location_id,
        full_name: payload.location.location_name,
      });

      // ✅ อัปเดต inboundItem ให้ตาราง render ตาม lines ที่ backend ส่งมา
      setInboundItem((prev) => {
        if (!prev) return prev;

        const lines = (payload.lines || []).map((l: any) => ({
          id: l.id,
          inbound_id: prev.id,
          code: l.code ?? null,
          name: l.name ?? "",
          unit: l.unit ?? "",
          lot_id: l.lot_id ?? null,
          lot_serial: l.lot_serial ?? null,
          quantity_receive: l.qty_receive ?? l.quantity_receive ?? 0,
          quantity_count: l.qty_count ?? l.quantity_count ?? 0,
          sequence: l.sequence ?? null,
          tracking: (l as any).tracking ?? null,
          qty: (l as any).qty ?? 0,
          barcode_id: l.barcode_id ?? null,
          exp: l.exp ?? null,

          // ✅ สำคัญมากสำหรับซ่อน/โชว์ Edit
          input_number: l.input_number ?? false,

          barcode: l.barcode
            ? { id: l.barcode.id, barcode: l.barcode.barcode }
            : null,
        })) as GoodsInType[];

        return {
          ...prev,
          scanned_location_full_name: payload.location.location_name,
          scanned_location_id: payload.location.location_id,
          items: lines,
          goods_ins: lines,
        };
      });

      toast.success(`Location OK: ${payload.location.location_name}`);

      // ✅ focus ไป scan barcode ได้ (แต่เราจะ disable ถ้ายังไม่ confirm)
      setTimeout(() => scanBarcodeInputRef.current?.focus(), 100);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Scan Location ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  // ---------- sort helpers ----------
  const toggleSort = (key: Exclude<SortKey, null>) => {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" }; // ✅ flip ได้ทุกครั้ง
      }
      return { key, dir: "asc" }; // ✅ เปลี่ยนคอลัมน์เริ่ม asc
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

  const tableHeaders = [
    "No",
    <button
      type="button"
      className="th-sort-btn"
      onClick={() => toggleSort("code")}
      title="Sort Code"
      key="h-code"
    >
      Code <SortIcon active={sort.key === "code"} dir={sort.dir} />
    </button>,
    <button
      type="button"
      className="th-sort-btn"
      onClick={() => toggleSort("name")}
      title="Sort ชื่อ"
      key="h-name"
    >
      ชื่อ <SortIcon active={sort.key === "name"} dir={sort.dir} />
    </button>,
    "QTY รับ",
    "QTY นับ",
    "หน่วย",
    "Zone Temp",
    "Lot. Serial",
    "Expire Date",
    "Action",
  ];

  // ---------- item helpers ----------
  const getItems = useCallback((): GoodsInType[] => {
    return (inboundItem?.items ||
      inboundItem?.goods_ins ||
      []) as GoodsInType[];
  }, [inboundItem]);

  const hasAnyCounted = useCallback(() => {
    const items = getItems();
    return items.some((it) => Number(it.quantity_count ?? 0) > 0);
  }, [getItems]);

  const getQtyReceive = (item: GoodsInType) =>
    Number(item.quantity_receive ?? (item as any).qty ?? 0);

  const getQtyCount = (item: GoodsInType) => Number(item.quantity_count ?? 0);

  const isDoneRow = (item: GoodsInType) => {
    const receive = getQtyReceive(item);
    const count = getQtyCount(item);
    return receive > 0 && count === receive;
  };

  const isProgressRow = (item: GoodsInType) => {
    const receive = getQtyReceive(item);
    const count = getQtyCount(item);
    return count > 0 && count !== receive;
  };

  // ---------- dropdown helpers ----------
  const computeAndOpenDropdown = useCallback((itemId: string) => {
    const btn = buttonRef.current[itemId];
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    const openUp = spaceBelow < MENU_HEIGHT && spaceAbove > spaceBelow;
    const top = openUp ? rect.top - MENU_HEIGHT - GAP : rect.bottom + GAP;

    let left = rect.right - MENU_WIDTH;
    left = Math.max(8, Math.min(left, window.innerWidth - MENU_WIDTH - 8));

    setMenuPos({ top, left });
    setOpenDropdownId(itemId);
  }, []);

  const toggleDropdown = useCallback(
    (itemId: string) => {
      if (openDropdownId === itemId) {
        setOpenDropdownId(null);
        setMenuPos(null);
        return;
      }
      computeAndOpenDropdown(itemId);
    },
    [openDropdownId, computeAndOpenDropdown],
  );

  const closeDropdown = useCallback(() => {
    setOpenDropdownId(null);
    setMenuPos(null);
  }, []);

  // ---------- scan helpers ----------
  const findItemByScan = useCallback(
    (scanText: string): GoodsInType | undefined => {
      const s = scanText.trim();
      if (!s) return undefined;

      const items = getItems();
      return items.find((it) => {
        // Check barcode field only
        const barcodeValue = (it as any).barcode?.barcode
          ? ((it as any).barcode.barcode ?? "").toString().trim()
          : "";
        return barcodeValue === s;
      });
    },
    [getItems],
  );

  // ✅ change qty + push history
  const setQtyCountWithHistory = useCallback(
    (itemId: string, newQty: number) => {
      if (!inboundItem) return;

      const currentItems = inboundItem.items || inboundItem.goods_ins || [];
      const currentItem = currentItems.find((x) => x.id === itemId);
      const currentQty = Number(currentItem?.quantity_count ?? 0);

      if (currentQty === newQty) return;

      setQtyHistory((h) => ({
        ...h,
        [itemId]: [...(h[itemId] || []), currentQty],
      }));

      setInboundItem((prev) => {
        if (!prev) return prev;

        const updateItems = (items?: GoodsInType[]) =>
          items?.map((item) =>
            item.id === itemId ? { ...item, quantity_count: newQty } : item,
          );

        return {
          ...prev,
          goods_ins: updateItems(prev.goods_ins),
          items: updateItems(prev.items),
        };
      });
    },
    [inboundItem],
  );

  // ✅ หา item ที่จะเพิ่ม qty โดยเช็คว่านับครบหรือยัง
  const findItemToIncrement = useCallback(
    (scannedItem: GoodsInType): GoodsInType | null => {
      const items = getItems();

      // เช็คว่า item ที่สแกนนับครบหรือยัง
      const currentQty = Number(scannedItem.quantity_count ?? 0);
      const receiveQty = Number(
        scannedItem.quantity_receive ?? scannedItem.qty ?? 0,
      );

      // ถ้ายังนับไม่ครบ ให้เพิ่มที่ item นี้
      if (currentQty < receiveQty) {
        return scannedItem;
      }

      // ถ้านับครบแล้ว หา lot อื่นที่มี barcode เหมือนกัน แต่ lot_id ต่างกัน และยังนับไม่ครบ
      const scannedBarcode = (scannedItem as any).barcode?.barcode ?? "";
      const scannedLotId = scannedItem.lot_id;

      const alternativeItem = items.find((item) => {
        // ต้องมี barcode เหมือนกัน
        const itemBarcode = (item as any).barcode?.barcode ?? "";
        if (itemBarcode !== scannedBarcode || !itemBarcode) return false;

        // ต้อง lot_id ต่างกัน
        if (item.lot_id === scannedLotId) return false;

        // ต้องนับยังไม่ครบ
        const itemQty = Number(item.quantity_count ?? 0);
        const itemReceive = Number(item.quantity_receive ?? item.qty ?? 0);
        return itemQty < itemReceive;
      });

      return alternativeItem || null;
    },
    [getItems],
  );

  const incrementQtyByScan = useCallback(
    (itemId: string): { success: boolean; targetItem?: GoodsInType } => {
      const items = getItems();
      const scannedItem = items.find((x) => x.id === itemId);

      if (!scannedItem) return { success: false };

      // หา item ที่จะเพิ่ม qty (อาจเป็น item เดิมหรือ lot อื่น)
      const targetItem = findItemToIncrement(scannedItem);

      if (!targetItem) {
        toast.warning("สินค้าทุก lot นับครบแล้ว");
        return { success: false };
      }

      const current = Number(targetItem.quantity_count ?? 0);
      setQtyCountWithHistory(targetItem.id, current + 1);

      // แจ้งเตือนถ้าเป็นคนละ lot
      if (targetItem.id !== itemId) {
        toast.info(
          `เปลี่ยนไป Lot: ${targetItem.lot_serial || targetItem.lot_id}`,
        );
      }

      return { success: true, targetItem };
    },
    [getItems, setQtyCountWithHistory, findItemToIncrement],
  );

  // ---------- fetch ----------
  useEffect(() => {
    const fetchInboundData = async () => {
      if (!no) return;

      setLoading(true);
      try {
        const response = await inboundApi.getById(no);
        const data = response.data as unknown as InboundType;

        setInboundItem(data);
        setOriginalData(JSON.parse(JSON.stringify(data)));
        setQtyHistory({});
      } catch (error) {
        console.error("Error fetching inbound data:", error);
        toast.error("Failed to load inbound data.");
      } finally {
        setLoading(false);
      }
    };

    fetchInboundData();
  }, [no]);

  // ---------- scan barcode/serial ----------
  const handleScanBarcodeKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();

      if (!confirmedLocation) {
        warningAlert("กรุณา Scan Location ก่อน");
        return;
      }

      const scanned = scanBarcode.trim();
      if (!scanned) return;

      const found = findItemByScan(scanned);
      if (!found) {
        toast.error(`ไม่พบสินค้า: ${scanned}`);
        setScanBarcode("");
        return;
      }

      const result = incrementQtyByScan(found.id);
      setScanBarcode("");

      // แสดง success message เฉพาะเมื่อเพิ่ม QTY สำเร็จ
      if (result.success && result.targetItem) {
        toast.success(
          `เพิ่ม QTY: ${result.targetItem.name || result.targetItem.code}`,
        );
      }

      setTimeout(() => {
        scanBarcodeInputRef.current?.focus();
      }, 100);
    }
  };

  useEffect(() => {
    if (scanLocation.trim() && scanBarcodeInputRef.current) {
      scanBarcodeInputRef.current.focus();
    }
  }, [scanLocation]);

  // Clean up button refs when rows change
  useEffect(() => {
    const currentIds = new Set(
      (inboundItem?.items || inboundItem?.goods_ins || []).map(
        (item) => item.id,
      ),
    );

    Object.keys(buttonRef.current).forEach((id) => {
      if (!currentIds.has(id)) delete buttonRef.current[id];
    });
  }, [inboundItem]);

  // close dropdown on outside click
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

  // close dropdown on scroll/resize
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

  // ---------- undo ----------
  const handleDecreaseCount = (itemId: string) => {
    confirmAlert("คุณต้องการย้อนกลับ QTY นับ ใช่หรือไม่?").then((result) => {
      if (result.isConfirmed) {
        handleUndoQty(itemId);
      }
    });
  };

  const handleUndoQty = (itemId: string) => {
    setQtyHistory((h) => {
      const history = h[itemId] || [];
      if (history.length === 0) {
        warningAlert("ไม่มีประวัติให้ย้อนกลับแล้ว");
        return h;
      }

      const prevQty = history[history.length - 1];

      setInboundItem((prev) => {
        if (!prev) return prev;

        const updateItems = (items?: GoodsInType[]) =>
          items?.map((item) =>
            item.id === itemId ? { ...item, quantity_count: prevQty } : item,
          );

        return {
          ...prev,
          goods_ins: updateItems(prev.goods_ins),
          items: updateItems(prev.items),
        };
      });

      successAlert("ย้อนกลับ QTY นับ 1 ครั้งแล้ว");
      return { ...h, [itemId]: history.slice(0, -1) };
    });
  };

  // ---------- edit qty ----------
  const handleEditClick = (itemId: string, currentCount: number) => {
    confirmAlert("คุณต้องการแก้ไข QTY นับ ใช่หรือไม่?").then((result) => {
      if (result.isConfirmed) {
        setEditingItemId(itemId);
        setEditValue(currentCount.toString());
      }
    });
  };

  const handleEditSave = (itemId: string) => {
    const newValue = parseInt(editValue, 10);
    if (isNaN(newValue) || newValue < 0) {
      toast.error("กรุณาใส่ตัวเลขที่ถูกต้อง");
      return;
    }

    setQtyCountWithHistory(itemId, newValue);
    setEditingItemId(null);
    setEditValue("");
    successAlert("แก้ไขจำนวน QTY นับ สำเร็จแล้ว");
  };

  const handleEditCancel = () => {
    setEditingItemId(null);
    setEditValue("");
  };

  // ---------- reset ----------
  const handleResetCount = (itemId: string) => {
    if (!originalData) return;

    confirmAlert("คุณต้องการรีเซ็ต QTY นับ ใช่หรือไม่?").then((result) => {
      if (result.isConfirmed) {
        resetCount(itemId);
      }
    });
  };

  const resetCount = (itemId: string) => {
    if (!originalData) return;

    const originalItem = (originalData.items || originalData.goods_ins)?.find(
      (item) => item.id === itemId,
    );
    if (!originalItem) return;

    const originalQty = Number(originalItem.quantity_count ?? 0);
    setQtyCountWithHistory(itemId, originalQty);
    successAlert("รีเซ็ต QTY นับ สำเร็จแล้ว");
  };

  // ---------- barcode modal ----------
  const handleOpenBarcodeModal = (item: GoodsInType) => {
    setSelectedGoodsIn(item);
    setIsBarcodeModalOpen(true);
  };

  const handleCloseBarcodeModal = () => {
    setIsBarcodeModalOpen(false);
    setSelectedGoodsIn(null);
  };

  const handleBarcodeSuccess = async () => {
    if (!no) return;
    try {
      const response = await inboundApi.getById(no);
      const data = response.data as unknown as InboundType;
      setInboundItem(data);
      setOriginalData(JSON.parse(JSON.stringify(data)));
      setQtyHistory({});
    } catch (error) {
      console.error("Error refreshing data:", error);
    }
  };

  // ---------- confirm ----------
  const handleConfirm = async () => {
    if (!no) return;
    if (!confirmedLocation) {
      warningAlert("กรุณา Scan Location ก่อน");
      return;
    }

    const items = (inboundItem?.items || inboundItem?.goods_ins || []) as any[];

    const lines = items
      .map((it) => ({
        goods_in_id: it.id,
        quantity_count: Number(it.quantity_count ?? 0),
      }))
      .filter((x) => x.quantity_count > 0);

    if (lines.length === 0) {
      warningAlert("ยังไม่มีรายการที่นับ (QTY นับ = 0 ทั้งหมด)");
      return;
    }

    const c = await confirmAlert(
      `ยืนยันนำ ${lines.length} รายการเข้า Stock ที่ Location: ${confirmedLocation.full_name} ใช่ไหม?`,
    );
    if (!c.isConfirmed) return;

    try {
      setIsConfirming(true);
      setLoading(true);

      await inboundApi.confirmToStock(no, {
        location_full_name: confirmedLocation.full_name,
        lines,
      });

      await successAlert("ยืนยันเข้า Stock สำเร็จแล้ว");
      
      // redirect กลับหน้า list เพื่อป้องกันการกดยืนยันซ้ำ
      navigate("/inbound");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Confirm ไม่สำเร็จ");
      setIsConfirming(false);
    } finally {
      setLoading(false);
    }
  };

  // ---------- render ----------
  if (loading) {
    return (
      <div className="inbound-detail-container">
        <Loading />
      </div>
    );
  }

  if (!inboundItem) {
    return (
      <div className="inbound-detail-container">
        <div className="no-data">No inbound data found.</div>
      </div>
    );
  }

  const allRows = (inboundItem.items ||
    inboundItem.goods_ins ||
    []) as GoodsInType[];

  // 1) search filter
  const filteredRows = searchFilter.trim()
    ? allRows.filter((item) => {
        const search = searchFilter.toLowerCase();
        const code = (item.code ?? "").toString().toLowerCase();
        const name = (item.name ?? "").toString().toLowerCase();
        const lotSerial = (item.lot_serial ?? "").toString().toLowerCase();
        return (
          code.includes(search) ||
          name.includes(search) ||
          lotSerial.includes(search)
        );
      })
    : allRows;

  const pendingCount = filteredRows.filter((x) => !isDoneRow(x)).length;
  const doneCount = filteredRows.filter(isDoneRow).length;

  // 2) view mode filter
  const viewRows =
    viewMode === "done"
      ? filteredRows.filter(isDoneRow)
      : filteredRows.filter((x) => !isDoneRow(x));

  // 3) sort rows
  const rows = [...viewRows].sort((a, b) => {
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

  return (
    <div className="inbound-detail-container">
      <div className="inbound-detail-header">
        <h1 className="inbound-detail-title">{inboundItem.no || "GR"}</h1>
      </div>

      <div className="inbound-detail-info">
        <div className="inbound-info-row">
          <div className="inbound-info-item">
            <label>Department :</label>
            <span>{inboundItem.department || "data"}</span>
          </div>
          <div className="inbound-info-item">
            <label>PO No. :</label>
            <span>{inboundItem.origin || "data"}</span>
          </div>
          <div className="inbound-info-item">
            <label>Scan Location :</label>
            <input
              type="text"
              className="inbound-scan-input"
              value={scanLocation}
              onChange={(e) => setScanLocation(e.target.value)}
              onKeyDown={handleScanLocationKeyDown}
              placeholder="Scan Location"
            />
          </div>
        </div>

        <div className="inbound-info-row">
          <div className="inbound-info-item">
            <label>INV. Sup:</label>
            <span>{inboundItem.reference || "data"}</span>
          </div>
          <div className="inbound-info-item">
            <label>User :</label>
            <span>
              {localStorage.getItem("first_name")}{" "}
              {localStorage.getItem("last_name")}
            </span>
          </div>
          <div className="inbound-info-item">
            <label>Scan Barcode/Serial :</label>
            <input
              ref={scanBarcodeInputRef}
              type="text"
              className="inbound-scan-input"
              value={scanBarcode}
              onChange={(e) => setScanBarcode(e.target.value)}
              onKeyDown={handleScanBarcodeKeyDown}
              placeholder="Scan Barcode/Serial"
              disabled={!confirmedLocation}
            />
          </div>
        </div>

        <br />
        <hr className="inbound-detail-divider" />

        <div className="inbound-info-row">
          <div className="inbound-search-wrapper">
            <label>Search</label>
            <div className="inbound-search-input-container">
              <i className="fa-solid fa-magnifying-glass inbound-search-icon"></i>
              <input
                type="text"
                className="inbound-search-input"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter Search"
              />
            </div>

            {/* ✅ Tabs ใต้ search */}
            <div className="inbound-view-tabs" style={{ marginTop: 10 }}>
              <button
                type="button"
                className={`inbound-tab ${viewMode === "pending" ? "active" : ""}`}
                onClick={() => setViewMode("pending")}
              >
                ยังไม่ได้ดำเนินการ <span className="badge">{pendingCount}</span>
              </button>

              <button
                type="button"
                className={`inbound-tab ${viewMode === "done" ? "active" : ""}`}
                onClick={() => setViewMode("done")}
              >
                ดำเนินการเสร็จสิ้นแล้ว{" "}
                <span className="badge">{doneCount}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="table__wrapper">
        <Table headers={tableHeaders as any}>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={tableHeaders.length} className="no-data">
                No items found.
              </td>
            </tr>
          ) : (
            rows.map((item, index) => (
              <tr
                key={item.id || index}
                className={
                  isDoneRow(item)
                    ? "row-done"
                    : isProgressRow(item)
                      ? "row-progress"
                      : ""
                }
              >
                <td>{index + 1}</td>
                <td style={{ minWidth: "200px" }}>{item.code || "--"}</td>
                <td style={{ minWidth: "200px" }}>{item.name || "--"}</td>
                <td>{getQtyReceive(item)}</td>

                <td>
                  {editingItemId === item.id ? (
                    <div className="edit-qty-container">
                      <input
                        type="number"
                        className="edit-qty-input"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleEditSave(item.id);
                          if (e.key === "Escape") handleEditCancel();
                        }}
                        autoFocus
                      />
                      <button
                        className="btn-save-edit"
                        onClick={() => handleEditSave(item.id)}
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
                    getQtyCount(item)
                  )}
                </td>

                <td>{item.unit}</td>
                <td>
                  {item.zone_type ? (
                    item.zone_type
                  ) : (
                    <span style={{ color: "red", fontWeight: "500" }}>
                      null
                    </span>
                  )}
                </td>
                <td>
                  {item.lot_serial ? (
                    item.lot_serial
                  ) : (
                    <span style={{ color: "red", fontWeight: "500" }}>
                      null
                    </span>
                  )}
                </td>
                <td>
                  {item.exp ? (
                    item.exp
                  ) : (
                    <span style={{ color: "red", fontWeight: "500" }}>
                      null
                    </span>
                  )}
                </td>

                <td>
                  <div className="inbound-action-buttons">
                    <div className="inbound-dropdown-container">
                      <button
                        ref={(el) => {
                          buttonRef.current[item.id] = el;
                        }}
                        className="btn-dropdown-toggle"
                        onClick={() => toggleDropdown(item.id)}
                        title="เมนูเพิ่มเติม"
                      >
                        <i className="fa-solid fa-ellipsis-vertical"></i>
                      </button>

                      {openDropdownId === item.id &&
                        menuPos &&
                        createPortal(
                          <div
                            ref={dropdownRef}
                            className="inbound-dropdown-menu"
                            style={{ top: menuPos.top, left: menuPos.left }}
                          >
                            <button
                              className="inbound-dropdown-item"
                              onClick={() => {
                                handleDecreaseCount(item.id);
                                closeDropdown();
                              }}
                            >
                              <span className="menu-icon">
                                <i className="fa-solid fa-rotate-left"></i>
                              </span>
                              Undo
                            </button>

                            {(item as any).input_number ? (
                              <button
                                className="inbound-dropdown-item"
                                onClick={() => {
                                  handleEditClick(item.id, getQtyCount(item));
                                  closeDropdown();
                                }}
                              >
                                <span className="menu-icon">
                                  <i className="fa-solid fa-pen-to-square"></i>
                                </span>
                                Edit QTY
                              </button>
                            ) : null}

                            <button
                              className="inbound-dropdown-item danger"
                              onClick={() => {
                                handleResetCount(item.id);
                                closeDropdown();
                              }}
                            >
                              <span className="menu-icon">
                                <i className="fa-solid fa-trash"></i>
                              </span>
                              Clear
                            </button>

                            <button
                              className="inbound-dropdown-item"
                              onClick={() => {
                                closeDropdown();

                                if (
                                  !("barcode" in item) ||
                                  !(item as any).barcode
                                ) {
                                  confirmAlert(
                                    "ยังไม่มี Barcode ต้องการสร้างหรือไม่?",
                                  ).then((res) => {
                                    if (res.isConfirmed) {
                                      setSelectedGoodsIn(item);
                                      setIsAddBarcodeOpen(true);
                                    }
                                  });
                                  return;
                                }

                                handleOpenBarcodeModal(item);
                              }}
                            >
                              <span className="menu-icon">
                                <i className="fa-solid fa-barcode"></i>
                              </span>
                              QR-Code
                            </button>
                          </div>,
                          document.body,
                        )}
                    </div>
                  </div>
                </td>
              </tr>
            ))
          )}
        </Table>
      </div>

      <BarcodeModal
        isOpen={isBarcodeModalOpen}
        onClose={handleCloseBarcodeModal}
        goodsInItem={selectedGoodsIn}
        onSuccess={handleBarcodeSuccess}
      />

      <AddBarcodeByGoodInIdModal
        isOpen={isAddBarcodeOpen}
        onClose={() => {
          setIsAddBarcodeOpen(false);
          setSelectedGoodsIn(null);
        }}
        goodsInItem={selectedGoodsIn}
        onSuccess={handleBarcodeSuccess}
      />

      <div className="inbound-detail-footer">
        <button
          className="inbound-btn-cancel"
          onClick={() => window.history.back()}
          disabled={isConfirming}
        >
          ยกเลิก
        </button>
        <button 
          className="inbound-btn-confirm" 
          onClick={handleConfirm}
          disabled={isConfirming || !confirmedLocation}
        >
          {isConfirming ? "กำลังยืนยัน..." : "ยืนยัน"}
        </button>
      </div>
    </div>
  );
};

export default InboundById;


import { http } from "../../../services/http";
import type {
  ApiInboundResponse,
  ApiInboundByIdResponse,
  ApiInboundByIdPaginatedResponse,
} from "../types/inbound.type";

export const inboundApi = {
  getAll: (params?: any) => http.get("/inbounds/getAll", { params }),

  getAllPaginated: (params: { page: number; limit: number; search?: string }) =>
    http.get<ApiInboundResponse>("/inbounds/get", { params }),

  getById: (no: string) =>
    http.get<ApiInboundByIdResponse>(
      `/inbounds/get/odoo/transfers/${encodeURIComponent(no)}`,
    ),

  getByIdPagination: (no: string, params: { page: number; limit: number }) =>
    http.get<ApiInboundByIdPaginatedResponse>(
      `/inbounds/get/odoo/transfers/${encodeURIComponent(no)}/paginated`,
      { params },
    ),

  createGoodinBarcode: (data: {
    goods_in_id: string;
    barcode: string;
    lot_start?: number | null;
    lot_stop?: number | null;
    exp_start?: number | null;
    exp_stop?: number | null;
    barcode_length?: number | null;
  }) => http.post("/goods_ins/barcode/create", data),

  // ✅ NEW: Scan Location (บังคับให้ทำก่อน)
  scanLocation: (no: string, data: { location_full_name: string }) =>
    http.post(`/inbounds/${encodeURIComponent(no)}/scan/location`, data),

  // ✅ NEW: Scan Barcode (ไว้ step ถัดไป)
  scanBarcode: (
    no: string,
    data: { barcode: string; location_full_name: string; qty_input?: number },
  ) => http.post(`/inbounds/${encodeURIComponent(no)}/scan/barcode`, data),

  // ✅ NEW: Confirm -> upsert stock
  confirmToStock: (
    no: string,
    data: {
      location_full_name: string;
      lines: { goods_in_id: string; quantity_count: number }[];
    },
  ) => http.post(`/inbounds/${encodeURIComponent(no)}/scan/confirm`, data),
};

export interface GoodsInType {
  id: string;
  inbound_id?: number;
  code: string | null;
  name: string;
  quantity_receive?: number;
  quantity_count?: number;
  unit: string;
  zone_type?: string | null;
  lot?: string | null;
  exp?: string | null;
  no_expiry?: boolean;
  qr_payload?: string | null;
  created_at?: string;
  updated_at?: string | null;
  deleted_at?: string | null;
  lot_id: number | null;
  lot_serial: string | null;
  product_id: number | null;
  qty: number;
  sequence: number | null;
  tracking: string | null;
  barcode_id: number | null;

  // ✅ NEW: ใช้ซ่อน/โชว์ปุ่ม Edit
  input_number?: boolean;

  // (optional) ถ้าคุณส่ง barcode object มาด้วย
  barcode?: {
    id: number;
    barcode: string;
  } | null;
}


export interface InboundType {
  id?: number;
  no: string;
  lot: string | null;
  date: string;
  quantity: number;
  in_type: string;
  department: string;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
  department_id: string;
  location: string;
  location_dest: string;
  location_dest_id: number;
  location_id: number;
  origin: string;
  picking_id: number;
  reference: string;
  goods_ins?: GoodsInType[];
  items?: GoodsInType[];

  // ✅ FE-only: location ที่ scan แล้ว (ไม่จำเป็นต้องมีใน backend model)
  scanned_location_full_name?: string;
  scanned_location_id?: number;
}


export interface InboundFilter {
    sku: string | null;
    lot : string | null;
    date: string | null;
    quantity: number | null;
    in_type: string | null;
    department: string | null;
}

export interface InboundMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export interface ApiInboundResponse {
    data: InboundType[];
    meta: InboundMeta;
}

export interface ApiInboundByIdResponse {
    data: InboundType;
}

export interface ApiInboundByIdPaginatedResponse {
    inbound: InboundType;
    data: GoodsInType[];
    meta: InboundMeta;
}


import { useCallback, useEffect, useState } from "react";
import type { InboundType } from "./types/inbound.type";
import { inboundApi } from "./services/inbound.api";
import {
  DEFAULT_PAGE_LIMIT,
  SHOW_LOADING_THRESHOLD,
  MIN_LOADING_TIME,
} from "../../utils/contants";
import Loading from "../../components/Loading/Loading";

import Pegination from "../../components/Pegination/Pegination";
import InboundTable from "./components/InboundTable";

const InboundContainer = () => {
  const [inbound, setInbound] = useState<InboundType[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState(1);

  //filter and search state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_PAGE_LIMIT);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [searchableColumns, setSearchableColumns] = useState({
    no: true,
    lot: true,
    date: true,
    quantity: true,
    in_type: true,
    department: true,
  });

  const fetchInbound = useCallback(
    async (
      page: number,
      search: string,
      limit: number,
      columns: typeof searchableColumns,
    ) => {
      const startTime = Date.now();
      const loadingTimeout = setTimeout(() => {
        setLoading(true);
      }, SHOW_LOADING_THRESHOLD);

      try {
        if (!search.trim()) {
          const response = await inboundApi.getAllPaginated({
            page,
            limit,
            search: search.trim() || undefined,
          });
          const { data = [], meta } = response.data;
          setInbound(data);
          setTotalPages(meta.totalPages);
          setTotalItems(meta.total);
        } else {
          const response: any = await inboundApi.getAllPaginated({
            page: 1,
            limit: 1000, // ดึงข้อมูลเยอะๆ มาเพื่อกรอง
          });
          const { data = [] } = response.data;
          // กรองข้อมูลตาม searchableColumns
          const filteredData = data.filter((inbound: InboundType) => {
            return Object.entries(columns).some(([key, isSearchable]) => {
              if (isSearchable) {
                const value = String((inbound as any)[key] || "").toLowerCase();
                return value.includes(search.trim().toLowerCase());
              }
              return false;
            });
          });
          setInbound(filteredData);
          setTotalPages(Math.ceil(filteredData.length / limit));
          setTotalItems(filteredData.length);
        }
      } catch (error) {
        console.error("Error fetching inbound:", error);
      } finally {
        clearTimeout(loadingTimeout);
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime < MIN_LOADING_TIME) {
          setTimeout(() => setLoading(false), MIN_LOADING_TIME - elapsedTime);
        } else {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    fetchInbound(currentPage, debouncedSearch, itemsPerPage, searchableColumns);
  }, [
    fetchInbound,
    currentPage,
    debouncedSearch,
    itemsPerPage,
    searchableColumns,
  ]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleItemsPerPageChange = (limit: number) => {
    setItemsPerPage(limit);
    setCurrentPage(1);
  };

  return (
    <div className="location-page-container">
      <div>
        <InboundTable
          inbound={inbound}
          searchQuery={searchQuery}
          onSearchChange={(e) => setSearchQuery(e.target.value)}
          onClearSearch={() => setSearchQuery("")}
          showFilterDropdown={showFilterDropdown}
          onToggleFilter={() => setShowFilterDropdown((prev) => !prev)}
          searchableColumns={searchableColumns}
          onToggleSearchableColumn={(column) =>
            setSearchableColumns((prev) => ({
              ...prev,
              [column]: !prev[column],
            }))
          }
        />

        <Pegination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={(page) => setCurrentPage(page)}
          onItemsPerPageChange={handleItemsPerPageChange}
        />
      </div>

      {loading && (
        <div className="loading-overlay">
          <Loading />
        </div>
      )}
    </div>
  );
};

export default InboundContainer; 










import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { badRequest, notFound, conflict } from "../utils/appError";

function normalizeNumberArray(input: any, field: string): number[] {
  if (input === undefined || input === null || input === "") return [];
  const arr = Array.isArray(input) ? input : [input];

  const nums = arr
    .flatMap((x) => {
      if (typeof x === "string") {
        // รองรับ "1,2,3"
        if (x.includes(",")) return x.split(",").map((s) => s.trim());
      }
      return [x];
    })
    .map((x) => Number(x))
    .filter(👎 => Number.isFinite(n));

  const uniq = Array.from(new Set(nums));
  if (uniq.length === 0) throw badRequest(ต้องระบุ ${field} อย่างน้อย 1 ค่า, { field });
  return uniq;
}

function getUserId(req: Request): number {
  const fromReqUser = (req as any).user?.id;
  const fromBody = (req.body as any)?.user_id;

  const id = Number(fromReqUser ?? fromBody);
  if (!Number.isFinite(id)) throw badRequest("ไม่พบ user_id (ต้อง login หรือส่ง user_id มา)", { field: "user_id" });
  return id;
}

/**
 * ✅ CREATE Batch Locks (เลือกหลาย outbound แล้ว lock)
 * POST /api/batch-outbounds
 * body: { outbound_ids: number[] }  (หรือ outbound_ids เป็น string "1,2,3" ก็ได้)
 */
export const createBatchOutbounds = asyncHandler(
  async (req: Request<{}, {}, { outbound_ids: any; user_id?: any }>, res: Response) => {
    const userId = getUserId(req);
    const outboundIds = normalizeNumberArray((req.body as any).outbound_ids ?? (req.body as any)["outbound_ids[]"], "outbound_ids");

    const now = new Date();

    try {
      const result = await prisma.$transaction(async (tx) => {
        // 1) validate outbound exist + not deleted
        const outbounds = await tx.outbound.findMany({
          where: { id: { in: outboundIds }, deleted_at: null },
          select: { id: true, no: true, deleted_at: true },
        });

        if (outbounds.length !== outboundIds.length) {
          const found = new Set(outbounds.map((o) => o.id));
          const missing = outboundIds.filter((id) => !found.has(id));
          throw notFound(ไม่พบ outbound บางรายการ หรือถูกลบแล้ว: ${missing.join(", ")});
        }

        // 2) check already locked
        const locked = await tx.batch_outbound.findMany({
          where: { outbound_id: { in: outboundIds }, status: "OPEN" },
          select: { outbound_id: true, user_id: true, created_at: true },
        });

        if (locked.length > 0) {
          // ถ้าอยากบอกว่าใครล็อกอยู่: return detail ได้
          throw conflict("มี Outbound บางรายการถูกล็อกอยู่แล้ว", {
            field: "outbound_ids",
            locked,
          });
        }

        // 3) create locks
        // ใช้ createMany + unique(outbound_id) จะกัน race ได้ระดับหนึ่ง (ชนก็ P2002)
        await tx.batch_outbound.createMany({
          data: outboundIds.map((outbound_id) => ({
            outbound_id,
            user_id: userId,
            status: "OPEN",
            created_at: now,
            updated_at: now,
          })),
          skipDuplicates: false,
        });

        const created = await tx.batch_outbound.findMany({
          where: { outbound_id: { in: outboundIds }, status: "OPEN" },
          include: {
            outbound: { select: { id: true, no: true, outbound_barcode: true, out_type: true } },
            user: { select: { id: true, username: true, first_name: true, last_name: true } },
          },
          orderBy: { id: "asc" },
        });

        return created;
      });

      return res.status(201).json({
        message: "สร้าง Batch INV (lock outbound) สำเร็จ",
        data: result,
      });
    } catch (e: any) {
      // ✅ ชน unique outbound_id
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw conflict("มี Outbound บางรายการถูกล็อกอยู่แล้ว (ชน unique)", {
          field: "outbound_ids",
        });
      }
      throw e;
    }
  }
);

/**
 * ✅ LIST ALL Locks
 * GET /api/batch-outbounds?status=OPEN
 */
export const getBatchOutbounds = asyncHandler(async (req: Request, res: Response) => {
  const status = typeof req.query.status === "string" ? req.query.status.trim() : undefined;

  const where: any = {};
  if (status) where.status = status;

  const rows = await prisma.batch_outbound.findMany({
    where,
    include: {
      outbound: { select: { id: true, no: true, outbound_barcode: true, out_type: true } },
      user: { select: { id: true, username: true, first_name: true, last_name: true } },
    },
    orderBy: { created_at: "desc" },
  });

  return res.json({ total: rows.length, data: rows });
});

/**
 * ✅ LIST My Locks
 * GET /api/batch-outbounds/my
 */
export const getMyBatchOutbounds = asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);

  const rows = await prisma.batch_outbound.findMany({
    where: { user_id: userId, status: "OPEN" },
    include: {
      outbound: { select: { id: true, no: true, outbound_barcode: true, out_type: true } },
    },
    orderBy: { created_at: "desc" },
  });

  return res.json({ total: rows.length, data: rows });
});

/**
 * ✅ RELEASE Locks (ปลดล็อกหลาย outbound_id)
 * PATCH /api/batch-outbounds/release
 * body: { outbound_ids: number[] }
 *
 * - ปลดได้เฉพาะของตัวเอง (ถ้าต้องการให้ admin ปลดได้ ให้เพิ่มเงื่อนไข)
 */
export const releaseBatchOutbounds = asyncHandler(
  async (req: Request<{}, {}, { outbound_ids: any; user_id?: any }>, res: Response) => {
    const userId = getUserId(req);
    const outboundIds = normalizeNumberArray((req.body as any).outbound_ids ?? (req.body as any)["outbound_ids[]"], "outbound_ids");

    const now = new Date();

    // เช็คว่ามี lock ของ user นี้จริง
    const existing = await prisma.batch_outbound.findMany({
      where: { outbound_id: { in: outboundIds }, status: "OPEN" },
      select: { id: true, outbound_id: true, user_id: true },
    });

    if (existing.length === 0) {
      return res.json({ message: "ไม่มีรายการที่ต้องปลดล็อก", released: 0 });
    }

    const notMine = existing.filter((x) => x.user_id !== userId);
    if (notMine.length > 0) {
      throw conflict("มีบางรายการไม่ได้ถูกล็อกโดยคุณ", {
        field: "outbound_ids",
        not_mine: notMine.map((x) => x.outbound_id),
      });
    }

    const updated = await prisma.batch_outbound.updateMany({
      where: { outbound_id: { in: outboundIds }, user_id: userId, status: "OPEN" },
      data: { status: "RELEASED", released_at: now, updated_at: now },
    });

    return res.json({
      message: "ปลดล็อก Batch INV สำเร็จ",
      released: updated.count,
      outbound_ids: outboundIds,
    });
  }
);



{
                    "id": 175,
                    "outbound_id": 28,
                    "sequence": 12,
                    "product_id": 5105,
                    "code": "DAD-OUPZ17",
                    "name": "Control Plasma P 10x1 ml",
                    "unit": "PACK",
                    "tracking": "lot",
                    "lot_id": 105844,
                    "lot_serial": "556751D",
                    "qty": 1,
                    "pick": 0,
                    "pack": 0,
                    "status": "DRAFT",
                    "user_pick": null,
                    "user_pack": null,
                    "barcode_id": null,
                    "barcode_text": "DIA11225",
                    "input_number": true,
                    "lock_no": [
                        "M05_F02_002",
                        "M05_F02_003"
                    ],
                    "barcode": null,
                    "boxes": []
                },

                 {
                    "id": 161,
                    "outbound_id": 27,
                    "sequence": 10,
                    "product_id": 5105,
                    "code": "DAD-OUPZ17",
                    "name": "Control Plasma P 10x1 ml",
                    "unit": "PACK",
                    "tracking": "lot",
                    "lot_id": 105844,
                    "lot_serial": "556751D",
                    "qty": 3,
                    "pick": 0,
                    "pack": 0,
                    "status": "DRAFT",
                    "user_pick": null,
                    "user_pack": null,
                    "barcode_id": null,
                    "barcode_text": "DIA11225",
                    "input_number": true,
                    "lock_no": [
                        "M05_F02_002",
                        "M05_F02_003"
                    ],
                    "barcode": null,
                    "boxes": []
                },