import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import type { InboundType, GoodsInType } from "../types/inbound.type";
import { inboundApi } from "../services/inbound.api";
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

import { formatDateTime } from "../../../components/Datetime/FormatDateTime";
import DetailLocaModal from "./DetailLocaModal";

type MenuPos = { top: number; left: number };

// ✅ Sort types
type SortKey = "code" | "name" | null;
type SortDir = "asc" | "desc";
type SortState = { key: SortKey; dir: SortDir };

// ✅ View tabs
type ViewMode = "pending" | "done";

// ✅ Multi-location count (location_full_name -> goods_in_id -> qty)
type LocKey = string;
type CountByLoc = Record<LocKey, Record<string, number>>;

// ✅ History ต่อ location+item (undo)
type HistKey = string; // `${loc}::${itemId}`
type QtyHistory = Record<HistKey, number[]>;

const InboundById = () => {
  const { no } = useParams<{ no: string }>();
  const navigate = useNavigate();

  const [inboundItem, setInboundItem] = useState<InboundType | null>(null);
  const [loading, setLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  // Scan inputs
  const [scanLocation, setScanLocation] = useState<string>("");
  const scanBarcodeInputRef = useRef<HTMLInputElement>(null);

  // Search filter
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [showHasBarcodeOnly, setShowHasBarcodeOnly] = useState(false);
  const [showBarcodeMissingOnly, setShowBarcodeMissingOnly] = useState(false);

  // ✅ Multi-location count store (ไม่รีเซ็ตเมื่อ scan location)
  const [countByLoc, setCountByLoc] = useState<CountByLoc>({});

  // ✅ History per location+item
  const [qtyHistory, setQtyHistory] = useState<QtyHistory>({});

  // Edit qty (inline ในตาราง) — ยังเป็น “location ปัจจุบัน” เหมือนเดิม
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  // ✅ ref ของ input edit แต่ละ row เพื่อ focus ได้
  const editInputRef = useRef<Record<string, HTMLInputElement | null>>({});

  // Barcode modal
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
  const [selectedGoodsIn, setSelectedGoodsIn] = useState<GoodsInType | null>(
    null,
  );
  const [isAddBarcodeOpen, setIsAddBarcodeOpen] = useState(false);

  // Dropdown state (portal+fixed)
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<Record<string, HTMLButtonElement | null>>({});

  const MENU_WIDTH = 190;
  const MENU_HEIGHT = 135;
  const GAP = 8;

  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });

  // ✅ View mode
  const [viewMode, setViewMode] = useState<ViewMode>("pending");

  // ✅ Confirmed location
  const [confirmedLocation, setConfirmedLocation] = useState<{
    full_name: string;
    id: number;
  } | null>(null);

  const scanLocationInputRef = useRef<HTMLInputElement>(null);
  const [isLocationScanOpen, setIsLocationScanOpen] = useState(false);

  // ✅ Detail location modal
  const [isDetailLocaOpen, setIsDetailLocaOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<GoodsInType | null>(null);

  const activeLocKey: string = (confirmedLocation?.full_name || "").trim();

  const histKeyOf = useCallback((loc: string, itemId: string): HistKey => {
    return `${loc}::${itemId}`;
  }, []);

  const openInlineEdit = useCallback((itemId: string, qty: number) => {
    setEditingItemId(itemId);
    setEditValue(String(qty));

    setTimeout(() => {
      const el = editInputRef.current[itemId];
      el?.focus();
      el?.select();
    }, 0);
  }, []);

  const getUserRef = () => {
    const first = (localStorage.getItem("first_name") || "").trim();
    const last = (localStorage.getItem("last_name") || "").trim();
    return `${first} ${last}`.trim();
  };

  // ✅ user_ref จาก items: ถ้าทั้งใบเหมือนกันทุก item -> แสดงค่านั้น
  // ถ้าไม่ครบ/ไม่เหมือนกัน/ว่าง -> fallback เป็น user login
  const resolveInboundUserRef = useCallback((): string | null => {
    const items = (inboundItem?.items || inboundItem?.goods_ins || []) as any[];
    if (!Array.isArray(items) || items.length === 0) return null;

    // ดึง user_ref ที่ไม่ว่าง
    const refs = items
      .map((x) => String(x?.user_ref ?? "").trim())
      .filter(Boolean);

    // ถ้ายังไม่มีครบทุกบรรทัด (บางบรรทัดว่าง/ไม่มี) -> ไม่ถือว่า "ทั้งใบ"
    if (refs.length !== items.length) return null;

    // ถ้ามีมากกว่า 1 ค่า -> ไม่เหมือนกันทั้งใบ
    const uniq = Array.from(new Set(refs));
    if (uniq.length !== 1) return null;

    return uniq[0] || null;
  }, [inboundItem]);

  // =========================
  // ✅ SCAN helpers (ไม่ใช้ lot_start/lot_stop)
  // =========================
  const normalize = (v: unknown) =>
    (v ?? "")
      .toString()
      .replace(/\s|\r|\n|\t/g, "")
      .trim();

  const digitsOnly = (v: unknown) => normalize(v).replace(/\D/g, "");

  // ✅ รูปแบบ temp ที่ถือว่าเป็น “อุณหภูมิ” จริง (เช่น 2-8C, -18C, 15-25C)
  // ปรับ pattern ได้ตามจริงหน้างาน
  const isTempToken = (s: string) => {
    const t = (s || "").trim().toUpperCase();
    if (!t) return false;

    // 2-8C / 15-25C / -18C / 8C (เผื่อ)
    return /^-?\d{1,2}([\-~]\d{1,2})?C$/.test(t);
  };

  // ✅ ตีความ temp จาก location
  // - ถ้าท้าย "_" เป็น temp token => เอาค่านั้น
  // - ถ้าไม่ใช่ (หรือไม่มี _) => ถือเป็น Normal
  const getTempFromLocation = (locFullName: string): string => {
    const s = (locFullName || "").trim();
    if (!s) return "Normal";

    const idx = s.lastIndexOf("_");
    if (idx === -1) return "Normal";

    const tail = s.slice(idx + 1).trim();
    if (!tail) return "Normal";

    return isTempToken(tail) ? tail : "Normal";
  };

  // ✅ normalize สำหรับเทียบค่า
  const normTemp = (v: unknown) =>
    (v ?? "")
      .toString()
      .replace(/\s+/g, "")
      .trim()
      .toUpperCase()
      .replace("~", "-"); // เผื่อ 2~8C ให้เทียบเป็น 2-8C

  // ✅ เช็คว่า item เข้า location นี้ได้ไหม (zone_type ต้องตรง temp ของ location)
  const isTempAllowedForItemAtLoc = (
    item: GoodsInType,
    locFullName: string,
  ) => {
    const locTemp = normTemp(getTempFromLocation(locFullName)); // ✅ ได้ค่าเสมอ (Normal หรือ 2-8C)
    const itemTemp = normTemp((item as any)?.zone_type ?? "");

    // ถ้า item ไม่มี zone_type เลย -> ไม่ block (กันพัง)
    // ถ้าคุณอยาก block ให้เปลี่ยนเป็น `if (!itemTemp) return false;`
    if (!itemTemp) return true;

    return itemTemp === locTemp;
  };

  // barcode หลักของสินค้า: ใช้ barcode.barcode ก่อน แล้วค่อย fallback barcode_text
  const getItemBarcode = (it: any) =>
    digitsOnly(it?.barcode?.barcode || it?.barcode_text || "");

  // const getItemLotSerialDigits = (it: any) => digitsOnly(it?.lot || "");

  // const getItemLotIdDigits = (it: any) =>
  //   digitsOnly((it?.lot_id ?? it?.lot_id === 0) ? String(it?.lot_id) : "");

  type ScanPickResult =
    | { item: GoodsInType; reason: "OK_SINGLE" | "OK_LOT_ID" | "OK_LOT_SERIAL" }
    | {
        item?: undefined;
        reason: "EMPTY" | "NO_BARCODE_MATCH" | "AMBIGUOUS";
        candidates?: Array<{
          id: string;
          code: string | null;
          lot_id: number | null;
          lot: string | null;
          barcode: string;
        }>;
      };

  const findItemByScanSmart = useCallback(
    (scanRaw: string): ScanPickResult => {
      const scanDigits = digitsOnly(scanRaw);
      const scanToken = tokenOnly(scanRaw);

      if (!scanDigits && !scanToken) return { reason: "EMPTY" };

      const items = (inboundItem?.items ||
        inboundItem?.goods_ins ||
        []) as GoodsInType[];

      // 1) candidate by barcode_text/barcode
      const candidates = items.filter((it: any) => {
        const b = getItemBarcode(it); // digits
        return b && scanDigits.includes(b);
      });

      if (candidates.length === 0) return { reason: "NO_BARCODE_MATCH" };

      // 2) ✅ STRICT FILTER: barcode match แล้วต้อง lot_serial + exp ตรงตาม rule
      // - lot_serial: ถ้า null => XXXXXX (token compare)
      // - exp: ถ้า null => 999999, ถ้ามี => YYYYMMDD (8 digits) ต้องอยู่ใน scanDigits
      const strictMatched = candidates.filter((it: any) => {
        const lotRule = getItemLotRule(it); // token
        const expRule = getItemExpRule(it); // "YYYYMMDD" หรือ "999999"

        const lotOk = scanToken.includes(lotRule);

        // expRule เป็น 999999 (6 หลัก) หรือ YYYYMMDD (8 หลัก)
        const expOk =
          expRule.length === 6
            ? scanDigits.includes(expRule)
            : scanDigits.includes(expRule);

        return lotOk && expOk;
      });

      if (strictMatched.length === 1) {
        return { item: strictMatched[0], reason: "OK_LOT_SERIAL" };
      }

      if (strictMatched.length === 0) {
        // ให้ debug ได้ว่าชน rule อะไร
        return {
          reason: "AMBIGUOUS",
          candidates: candidates.map((x: any) => ({
            id: x.id,
            code: x.code ?? null,
            lot_id: x.lot_id ?? null,
            lot: x.lot ?? null,
            barcode: getItemBarcode(x),
            exp: x.exp ?? null,
          })),
        };
      }

      // >1 ก็ ambiguous
      return {
        reason: "AMBIGUOUS",
        candidates: candidates.map((x: any) => ({
          id: String(x.id),
          code: x.code ?? null,

          barcode: getItemBarcode(x),

          // ✅ show lot fields
          lot_id: x.lot_id ?? null,
          lot: x.lot ?? null,
          lot_serial: x.lot_serial ?? null,

          // ✅ show exp raw + parsed
          exp: x.exp ?? null,
          exp_yyyymmdd: expToYyyymmdd(x.exp) || null,

          // ✅ show strict-rule values (ตามที่คุณกำหนด)
          lot_rule:
            (x.lot_serial == null ? "XXXXXX" : tokenOnly(x.lot_serial)) ||
            "XXXXXX",
          exp_rule: x.exp == null ? "999999" : expToYyyymmdd(x.exp) || "999999",
        })),
      };
    },
    [inboundItem],
  );

  const tokenOnly = (v: unknown) =>
    (v ?? "")
      .toString()
      .toUpperCase()
      .replace(/\s|\r|\n|\t/g, "")
      .trim();

  // lot_serial ต้อง match แบบ “ตัวอักษร+ตัวเลข” ห้าม digitsOnly
  // const getItemLotSerialToken = (it: any) =>
  //   tokenOnly(it?.lot_serial || it?.lot || "");

  // exp เอาเป็น digits YYYYMMDD เพื่อ match กับ scanDigits
  const expToYyyymmdd = (d: unknown) => {
    if (!d) return "";
    const dt = new Date(d as any);
    if (Number.isNaN(dt.getTime())) return "";
    const yy = String(dt.getFullYear()).slice(-2);
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${yy}${mm}${dd}`; // เช่น 250703
  };

  // exp -> YYMMDD (6 digits) เพื่อให้ตรงกับที่สแกนท้าย "250703"

  // ===== strict match rules =====
  const LOT_NULL_TOKEN = "XXXXXX";
  const EXP_NULL_TOKEN = "999999";

  const getItemLotRule = (it: any) => {
    const v = it?.lot_serial;
    const s = v == null ? LOT_NULL_TOKEN : tokenOnly(v);
    return s || LOT_NULL_TOKEN;
  };

  // exp: ถ้า null => 999999, ถ้ามี date => YYYYMMDD (ตามที่คุณทำอยู่แล้ว)
  const getItemExpRule = (it: any) => {
    const v = it?.exp;
    if (v == null) return EXP_NULL_TOKEN;

    const yyyymmdd = expToYyyymmdd(v); // "YYYYMMDD"
    return yyyymmdd || EXP_NULL_TOKEN;
  };

  // const getItemExpDigits = (it: any) => expToYyyymmdd(it?.exp);

  // ---------- item helpers ----------
  const getItems = useCallback((): GoodsInType[] => {
    return (inboundItem?.items ||
      inboundItem?.goods_ins ||
      []) as GoodsInType[];
  }, [inboundItem]);

  const findItemById = useCallback(
    (itemId: string) => {
      const items = getItems();
      return items.find((x) => String(x.id) === String(itemId)) || null;
    },
    [getItems],
  );

  const getQtyReceive = (item: GoodsInType) =>
    Number(item.quantity_receive ?? (item as any).qty ?? 0);

  const getCountAtLoc = useCallback(
    (loc: string, itemId: string) => {
      const lk = (loc || "").trim();
      if (!lk) return 0;
      return Number(countByLoc[lk]?.[String(itemId)] ?? 0);
    },
    [countByLoc],
  );

  // ✅ count ที่ location ปัจจุบัน
  const getCountAtActiveLoc = useCallback(
    (itemId: string) => {
      if (!activeLocKey) return 0;
      return getCountAtLoc(activeLocKey, itemId);
    },
    [activeLocKey, getCountAtLoc],
  );

  // ✅ total count ของ item เดียวกัน (รวมทุก location)
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

  // ✅ count ที่ใช้จริง (รวม backend quantity_count + local countByLoc)
  const getEffectiveCount = useCallback(
    (item: GoodsInType) => {
      const itemId = String(item.id);
      const backendCount = Number(item.quantity_count ?? 0);
      const localTotal = getTotalCount(itemId);
      return Math.max(backendCount, localTotal);
    },
    [getTotalCount],
  );

  // ✅ list ทุก location ที่มี count ของ item นี้ (เอาเฉพาะ > 0)
  const getAllLocCountsForItem = useCallback(
    (itemId: string) => {
      const rows = Object.entries(countByLoc || {})
        .map(([loc, map]) => ({
          loc,
          qty: Number(map?.[String(itemId)] ?? 0),
        }))
        .filter((x) => x.qty > 0);

      rows.sort((a, b) => {
        const aActive = a.loc === activeLocKey ? 0 : 1;
        const bActive = b.loc === activeLocKey ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        return a.loc.localeCompare(b.loc, "th", { numeric: true });
      });

      return rows;
    },
    [countByLoc, activeLocKey],
  );

  // ✅ set qty (generic) + push history ให้ “loc ที่เลือก”
  const setCountWithHistoryForLoc = useCallback(
    (loc: string, itemId: string, newQty: number) => {
      const lk = (loc || "").trim();
      if (!lk) return;

      const id = String(itemId);
      const currentQty = getCountAtLoc(lk, id);
      if (currentQty === newQty) return;

      const hk = histKeyOf(lk, id);
      setQtyHistory((h) => ({
        ...h,
        [hk]: [...(h[hk] || []), currentQty],
      }));

      setCountByLoc((prev) => {
        const currLocMap = prev[lk] || {};
        return {
          ...prev,
          [lk]: { ...currLocMap, [id]: newQty },
        };
      });
    },
    [getCountAtLoc, histKeyOf],
  );

  // ✅ set qty + push history (active loc)
  const setCountWithHistoryAtActiveLoc = useCallback(
    (itemId: string, newQty: number) => {
      if (!activeLocKey) return;
      setCountWithHistoryForLoc(activeLocKey, itemId, newQty);
    },
    [activeLocKey, setCountWithHistoryForLoc],
  );

  // ✅ ใช้เตือน/logic เฉพาะ location ปัจจุบัน
  const hasAnyCountedAtActiveLoc = useCallback(() => {
    if (!activeLocKey) return false;
    const map = countByLoc[activeLocKey] || {};
    return Object.values(map).some((v) => Number(v) > 0);
  }, [countByLoc, activeLocKey]);

  // ✅ DONE/PROGRESS ต้องเช็คจากยอดรวมทุก location
  const isDoneRow = useCallback(
    (item: GoodsInType) => {
      const receive = getQtyReceive(item);
      const count = getEffectiveCount(item);
      return receive > 0 && count === receive;
    },
    [getEffectiveCount],
  );

  const isProgressRow = useCallback(
    (item: GoodsInType) => {
      const receive = getQtyReceive(item);
      const count = getEffectiveCount(item);
      return count > 0 && count !== receive;
    },
    [getEffectiveCount],
  );

  // ---------- sort helpers ----------
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

  const tableHeaders = [
    "No",
    <button
      type="button"
      className="th-sort-btn"
      onClick={() => toggleSort("code")}
      title="Sort Code"
      key="h-code"
    >
      สินค้า <SortIcon active={sort.key === "code"} dir={sort.dir} />
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
    "หน่วย",
    "QTY รับ",
    "QTY นับ",
    "Lot. Serial",
    "Expire Date",
    "Zone Temp",
    "เวลาที่ดำเนินการ",
    "Action",
  ];

  // ---------- dropdown helpers ----------
  const computeAndOpenDropdown = useCallback((itemId: string) => {
    const btn = buttonRef.current[itemId];
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    const menuHeight = dropdownRef.current?.offsetHeight ?? MENU_HEIGHT;
    const menuWidth = dropdownRef.current?.offsetWidth ?? MENU_WIDTH;

    let top = rect.bottom + GAP;
    let left = rect.right - menuWidth;

    if (top + menuHeight > window.innerHeight) {
      top = rect.top - menuHeight - GAP;
    }
    if (top < 8) top = 8;

    if (left + menuWidth > window.innerWidth) {
      left = window.innerWidth - menuWidth - 8;
    }
    if (left < 8) left = 8;

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

  // ✅ หา item ที่จะเพิ่ม qty:
  // - เพิ่ม “ที่ location ปัจจุบัน”
  // - แต่ “กันเกินจำนวนรับ” ด้วยยอดรวมทุก location
  const findItemToIncrement = useCallback(
    (scannedItem: GoodsInType): GoodsInType | null => {
      const items = getItems();

      const scannedId = String(scannedItem.id);
      const totalQty = getTotalCount(scannedId);
      const receiveQty = Number(
        scannedItem.quantity_receive ?? (scannedItem as any).qty ?? 0,
      );

      if (totalQty < receiveQty) return scannedItem;

      const scannedBarcode = getItemBarcode(scannedItem);
      if (!scannedBarcode) return null;

      const alt = items.find((it: any) => {
        const b = getItemBarcode(it);
        if (!b || b !== scannedBarcode) return false;

        const itemId = String(it.id);
        const itemTotal = getTotalCount(itemId);
        const itemReceive = Number(it.quantity_receive ?? it.qty ?? 0);

        return itemTotal < itemReceive;
      });

      return alt || null;
    },
    [getItems, getTotalCount],
  );

  const incrementQtyByScan = useCallback(
    (itemId: string): { success: boolean; targetItem?: GoodsInType } => {
      if (!activeLocKey) {
        warningAlert("กรุณา Scan Location ก่อน");
        return { success: false };
      }

      const items = getItems();
      const scannedItem = items.find((x) => String(x.id) === String(itemId));
      if (!scannedItem) return { success: false };

      // ✅ TEMP CHECK: ถ้า zone temp ไม่ตรงกับ location -> block + toast
      if (!isTempAllowedForItemAtLoc(scannedItem, activeLocKey)) {
        const locTemp = getTempFromLocation(activeLocKey) || "-";
        const itemTemp = (scannedItem as any)?.zone_type || "-";
        toast.error(
          `สแกนไม่ได้: Location Temp (${locTemp}) ไม่ตรงกับ Zone Temp (${itemTemp})`,
          { autoClose: 3500 },
        );
        return { success: false };
      }

      const targetItem = findItemToIncrement(scannedItem);
      if (!targetItem) {
        toast.warning("สินค้าทุก line นับครบแล้ว");
        return { success: false };
      }

      // ✅ ถ้า targetItem อาจเป็นอีก line เดียวกัน (barcode ซ้ำ) ก็เช็ค temp อีกทีให้ชัวร์
      if (!isTempAllowedForItemAtLoc(targetItem, activeLocKey)) {
        const locTemp = getTempFromLocation(activeLocKey) || "-";
        const itemTemp = (targetItem as any)?.zone_type || "-";
        toast.error(
          `สแกนไม่ได้: Location Temp (${locTemp}) ไม่ตรงกับ Zone Temp (${itemTemp})`,
          { autoClose: 3500 },
        );
        return { success: false };
      }

      const targetId = String(targetItem.id);

      const total = getTotalCount(targetId);
      const receive = Number(
        targetItem.quantity_receive ?? (targetItem as any).qty ?? 0,
      );

      if (total >= receive) {
        toast.warning("จำนวนที่นับครบแล้ว (เกินจำนวนรับไม่ได้)");
        return { success: false };
      }

      const currentAtLoc = getCountAtActiveLoc(targetId);
      const nextQtyAtLoc = currentAtLoc + 1;

      setCountWithHistoryAtActiveLoc(targetId, nextQtyAtLoc);

      if ((targetItem as any).input_number) {
        openInlineEdit(targetId, nextQtyAtLoc);
      }

      if (String(targetItem.id) !== String(itemId)) {
        toast.info(
          `เปลี่ยนรายการ (line) : ${targetItem.code || ""} / ${
            targetItem.lot || ""
          }`,
        );
      }

      return { success: true, targetItem };
    },
    [
      activeLocKey,
      getItems,
      findItemToIncrement,
      getTotalCount,
      getCountAtActiveLoc,
      setCountWithHistoryAtActiveLoc,
      openInlineEdit,
    ],
  );

  // =========================
  // ✅ Scan Location (อนุญาตหลาย location, ไม่รีเซ็ต countByLoc)
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

      const resp = await inboundApi.scanLocation(no, {
        location_full_name: fullName,
      });

      const payload = resp.data as any;
      const locName = payload.location.location_name ?? fullName;

      setConfirmedLocation({
        id: payload.location.location_id,
        full_name: locName,
      });

      setIsLocationScanOpen(false);
      setTimeout(() => scanBarcodeInputRef.current?.focus(), 0);

      setScanLocation(locName);

      // ✅ map lines ให้ "barcode_text + barcode" มาครบ
      setInboundItem((prev) => {
        if (!prev) return prev;

        const prevById = new Map(
          ((prev.items || prev.goods_ins || []) as GoodsInType[]).map((x) => [
            String(x.id),
            x,
          ]),
        );

        const lines = (payload.lines || []).map((l: any) => {
          const old = prevById.get(String(l.id));

          const barcode_text =
            l.barcode_text ??
            l.barcode?.barcode ??
            (old as any)?.barcode_text ??
            (old as any)?.barcode?.barcode ??
            null;

          const barcodeObj = l.barcode ?? (old as any)?.barcode ?? null;

          return {
            id: l.id,
            inbound_id: prev.id,
            code: l.code ?? old?.code ?? null,
            name: l.name ?? old?.name ?? "",
            unit: l.unit ?? old?.unit ?? "",

            zone_type: l.zone_type ?? old?.zone_type ?? null,

            lot_id: l.lot_id ?? old?.lot_id ?? null,
            lot: l.lot ?? (old as any)?.lot ?? "",
            lot_serial: l.lot_serial ?? (old as any)?.lot_serial ?? "",
            exp: l.exp ?? old?.exp ?? null,
            no_expiry: l.no_expiry ?? (old as any)?.no_expiry ?? false,

            quantity_receive:
              l.qty_receive ?? l.quantity_receive ?? old?.quantity_receive ?? 0,

            quantity_count:
              l.qty_count ?? l.quantity_count ?? old?.quantity_count ?? 0,

            sequence: l.sequence ?? old?.sequence ?? null,
            tracking: l.tracking ?? old?.tracking ?? null,
            qty: l.qty ?? (old as any)?.qty ?? 0,

            input_number: l.input_number ?? (old as any)?.input_number ?? false,

            barcode_text,
            barcode: barcodeObj,
          } as GoodsInType;
        });

        return {
          ...prev,
          scanned_location_full_name: locName,
          scanned_location_id: payload.location.location_id,
          items: lines,
          goods_ins: lines,
        };
      });

      toast.success(`Location OK: ${locName}`);
      setTimeout(() => scanBarcodeInputRef.current?.focus(), 100);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Scan Location ไม่สำเร็จ");
      setConfirmedLocation(null);
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // ✅ Scan Barcode / Serial
  // =========================
  const handleScanBarcodeKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    const isSubmitKey =
      e.key === "Enter" || e.key === "Tab" || e.code === "NumpadEnter";
    if (!isSubmitKey) return;

    e.preventDefault();

    if (!confirmedLocation) {
      warningAlert("กรุณา Scan Location ก่อน");
      return;
    }

    setTimeout(() => {
      const raw = scanBarcodeInputRef.current?.value ?? "";
      const scanned = normalize(raw);
      if (!scanned) return;

      const picked = findItemByScanSmart(scanned);

      if (!picked.item) {
        if (picked.reason === "AMBIGUOUS") {
          const scanDigits = digitsOnly(scanned);
          const scanToken = tokenOnly(scanned);
          console.log("SCAN token=", scanToken);
          console.log("SCAN digits=", scanDigits);
          console.log("AMBIGUOUS candidates =", picked.candidates);
          toast.error("สแกนไม่ได้: Lot/Exp ไม่ตรงหรือข้อมูลไม่พอแยก");
        }
        if (scanBarcodeInputRef.current) scanBarcodeInputRef.current.value = "";
        return;
      }

      const result = incrementQtyByScan(String(picked.item.id));

      if (scanBarcodeInputRef.current) {
        scanBarcodeInputRef.current.value = "";
        scanBarcodeInputRef.current.focus();
      }

      if (result.success && result.targetItem) {
        toast.success(
          `เพิ่ม QTY: ${result.targetItem.name || result.targetItem.code}`,
        );
      }
    }, 0);
  };

  // ---------- fetch ----------
  useEffect(() => {
    const fetchInboundData = async () => {
      if (!no) return;

      setLoading(true);
      try {
        const response = await inboundApi.getById(no);
        const data = response.data as unknown as InboundType;

        setInboundItem(data);

        // ✅ เคลียร์ history ได้
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

  // focus barcode input when location text has something
  useEffect(() => {
    if (scanLocation.trim() && scanBarcodeInputRef.current) {
      scanBarcodeInputRef.current.focus();
    }
  }, [scanLocation]);

  // Clean up button refs when rows change
  useEffect(() => {
    const currentIds = new Set(
      (inboundItem?.items || inboundItem?.goods_ins || []).map((item) =>
        String(item.id),
      ),
    );

    Object.keys(buttonRef.current).forEach((id) => {
      if (!currentIds.has(String(id))) delete buttonRef.current[id];
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

  // =========================
  // ✅ Modal actions: set/edit/undo/clear/delete “by location”
  // =========================

  // ✅ set qty by loc + enforce cap (รวมทุก location ต้องไม่เกิน qty_receive)
  const handleSetQtyForLoc = useCallback(
    (loc: string, itemId: string, nextQty: number) => {
      const item = findItemById(itemId);
      if (!item) return;

      if (Number.isNaN(nextQty) || nextQty < 0) {
        toast.error("กรุณาใส่ตัวเลขที่ถูกต้อง");
        return;
      }

      const receive = getQtyReceive(item);

      const currentAtLoc = getCountAtLoc(loc, itemId);
      const totalNow = getTotalCount(itemId);
      const totalWithoutThisLoc = Math.max(0, totalNow - currentAtLoc);

      if (totalWithoutThisLoc + nextQty > receive) {
        toast.error(
          `ห้ามเกินจำนวนรับ (${receive}) — ตอนนี้ Location อื่นนับไปแล้ว ${totalWithoutThisLoc}`,
        );
        return;
      }

      setCountWithHistoryForLoc(loc, itemId, nextQty);
      successAlert("อัปเดต QTY นับ สำเร็จแล้ว");
    },
    [
      findItemById,
      getCountAtLoc,
      getTotalCount,
      getQtyReceive,
      setCountWithHistoryForLoc,
    ],
  );

  const handleDeleteLocRow = useCallback((loc: string, itemId: string) => {
    setCountByLoc((prev) => {
      const lk = (loc || "").trim();
      const id = String(itemId);
      const locMap = { ...(prev[lk] || {}) };
      delete locMap[id];

      const next = { ...prev };
      if (Object.keys(locMap).length === 0) {
        delete next[lk];
        return next;
      }

      next[lk] = locMap;
      return next;
    });
  }, []);

  // ✅ undo เฉพาะ loc ที่เลือก (ใช้ history ของ loc นั้น)
  const handleUndoForLoc = useCallback(
    (loc: string, itemId: string): { ok: boolean; message: string } => {
      const lk = (loc || "").trim();
      const id = String(itemId);
      const hk = histKeyOf(lk, id);

      const history = qtyHistory[hk] || [];
      if (history.length === 0) {
        return { ok: false, message: "ไม่มีประวัติให้ย้อนกลับแล้ว" };
      }

      const prevQty = history[history.length - 1];

      // set without pushing new history
      setCountByLoc((prev) => {
        const currLocMap = prev[lk] || {};
        return {
          ...prev,
          [lk]: { ...currLocMap, [id]: prevQty },
        };
      });

      // pop history
      setQtyHistory((h) => ({
        ...h,
        [hk]: (h[hk] || []).slice(0, -1),
      }));

      return { ok: true, message: "ย้อนกลับ QTY นับ 1 ครั้งแล้ว" };
    },
    [histKeyOf, qtyHistory],
  );

  const handleClearForLoc = useCallback(
    (loc: string, itemId: string) => {
      setCountWithHistoryForLoc(loc, itemId, 0);
    },
    [setCountWithHistoryForLoc],
  );

  // ---------- edit qty (inline ในตาราง) ----------
  // const handleEditClick = (itemId: string, currentCountAtLoc: number) => {
  //   openInlineEdit(itemId, currentCountAtLoc);
  // };

  const handleEditSave = (itemId: string) => {
    if (!activeLocKey) {
      warningAlert("กรุณา Scan Location ก่อน");
      return;
    }

    const newValue = parseInt(editValue, 10);
    if (Number.isNaN(newValue) || newValue < 0) {
      toast.error("กรุณาใส่ตัวเลขที่ถูกต้อง");
      return;
    }

    const item = findItemById(itemId);
    if (!item) return;

    const receive = getQtyReceive(item);
    const currentAtLoc = getCountAtActiveLoc(String(itemId));
    const totalNow = getTotalCount(String(itemId));
    const totalWithoutThisLoc = Math.max(0, totalNow - currentAtLoc);

    if (totalWithoutThisLoc + newValue > receive) {
      toast.error(
        `ห้ามเกินจำนวนรับ (${receive}) — ตอนนี้ Location อื่นนับไปแล้ว ${totalWithoutThisLoc}`,
      );
      return;
    }

    setCountWithHistoryAtActiveLoc(String(itemId), newValue);

    setEditingItemId(null);
    setEditValue("");
    successAlert("แก้ไขจำนวน QTY นับ สำเร็จแล้ว");
  };

  const handleEditCancel = () => {
    setEditingItemId(null);
    setEditValue("");
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
      setQtyHistory({});
    } catch (error) {
      console.error("Error refreshing data:", error);
    }
  };

  // ---------- confirm (multi-location) ----------
  const handleConfirm = async () => {
    if (!no) return;

    // ✅ กันยืนยันซ้ำถ้าทั้งใบ done แล้ว
    if (isAllDoneBackend) {
      warningAlert("ดำเนินการเสร็จสิ้นแล้ว (ยืนยันซ้ำไม่ได้)");
      return;
    }

    const user_ref = getUserRef();
    if (!user_ref) {
      warningAlert(
        "ไม่พบชื่อผู้ใช้งาน (first_name/last_name) กรุณา login ใหม่",
      );
      return;
    }

    const locEntries = Object.entries(countByLoc || {}).filter(([_, map]) =>
      Object.values(map || {}).some((v) => Number(v) > 0),
    );

    if (locEntries.length === 0) {
      warningAlert("ยังไม่มีรายการที่นับ (QTY นับ = 0 ทั้งหมด)");
      return;
    }

    const payloadLocations = locEntries
      .map(([locFullName, map]) => ({
        location_full_name: locFullName,
        lines: Object.entries(map || {})
          .map(([goods_in_id, qty]) => ({
            goods_in_id: String(goods_in_id),
            quantity_count: Number(qty ?? 0),
          }))
          .filter((x) => x.quantity_count > 0),
      }))
      .filter((x) => x.lines.length > 0);

    console.log("payloadLocations", payloadLocations);

    const totalLines = payloadLocations.reduce((s, x) => s + x.lines.length, 0);

    const c = await confirmAlert(
      `ยืนยันนำสินค้าเข้า Stock ${totalLines} รายการ ใน ${payloadLocations.length} Location ใช่ไหม?`,
    );
    if (!c.isConfirmed) return;

    try {
      setIsConfirming(true);
      setLoading(true);

      await inboundApi.confirmToStockMulti(no, {
        user_ref,
        locations: payloadLocations,
      });

      await successAlert("ยืนยันเข้า Stock สำเร็จแล้ว");
      navigate("/inbound");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Confirm ไม่สำเร็จ");
    } finally {
      setLoading(false);
      setIsConfirming(false);
    }
  };

  const allRows = (inboundItem?.items ||
    inboundItem?.goods_ins ||
    []) as GoodsInType[];

  // ✅ “ทั้งใบเสร็จ” ต้องอิงจาก backend เท่านั้น
  const isAllDoneBackend =
    !!inboundItem &&
    allRows.length > 0 &&
    allRows.every((it) => {
      const receive = getQtyReceive(it);
      const backendCount = Number(it.quantity_count ?? 0);
      return receive > 0 && backendCount === receive;
    });

  // ✅ UI อาจ “ดูเหมือนเสร็จ” ได้จาก local แต่ห้ามเอาไป disable confirm
  const isAllDoneUI =
    !!inboundItem &&
    allRows.length > 0 &&
    allRows.every((it) => {
      const receive = getQtyReceive(it);
      const effective = getEffectiveCount(it); // local+backend
      return receive > 0 && effective === receive;
    });

  useEffect(() => {
    if (!isAllDoneBackend) return;

    // ✅ ปิดโหมดสแกน + เคลียร์ input
    setIsLocationScanOpen(false);
    setScanLocation("");
    setConfirmedLocation(null);

    if (scanBarcodeInputRef.current) scanBarcodeInputRef.current.value = "";

    // (optional) ปิด dropdown / modal ที่ไม่อยากให้เล่นต่อ
    setOpenDropdownId(null);
    setMenuPos(null);
  }, [isAllDoneBackend]);

  const barcodeFilteredRows = allRows.filter((item) => {
    const hasBarcode = item.barcode !== null;

    if (showHasBarcodeOnly && showBarcodeMissingOnly) return true;
    if (showHasBarcodeOnly) return hasBarcode;
    if (showBarcodeMissingOnly) return !hasBarcode;
    return true;
  });

  // 1) search filter
  const filteredRows = searchFilter.trim()
    ? barcodeFilteredRows.filter((item) => {
        const search = searchFilter.toLowerCase();
        const code = (item.code ?? "").toString().toLowerCase();
        const name = (item.name ?? "").toString().toLowerCase();
        const lot = (item.lot ?? "").toString().toLowerCase();
        return (
          code.includes(search) || name.includes(search) || lot.includes(search)
        );
      })
    : barcodeFilteredRows;

  const pendingCount = filteredRows.filter((x) => !isDoneRow(x)).length;
  const doneCount = filteredRows.filter(isDoneRow).length;

  useEffect(() => {
    if (pendingCount === 0 && doneCount > 0) {
      setViewMode("done");
    }
  }, [pendingCount, doneCount]);

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
              ref={scanLocationInputRef}
              type="text"
              className="inbound-scan-input"
              value={scanLocation}
              onChange={(e) => setScanLocation(e.target.value)}
              onKeyDown={handleScanLocationKeyDown}
              placeholder={
                isAllDoneBackend ? "ดำเนินการเสร็จสิ้นแล้ว" : "Scan Location"
              }
              disabled={!isLocationScanOpen || isAllDoneBackend}
              style={{
                borderColor: confirmedLocation ? "#4CAF50" : undefined,
                opacity: isLocationScanOpen && !isAllDoneBackend ? 1 : 0.6,
              }}
            />

            <button
              type="button"
              className={`inboundById-btn-scan-toggle ${isLocationScanOpen ? "active" : ""}`}
              onClick={toggleLocationScan}
              disabled={isAllDoneBackend}
              title={
                isAllDoneBackend
                  ? "ดำเนินการเสร็จสิ้นแล้ว ไม่สามารถสแกนได้"
                  : undefined
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

        <div className="inbound-info-row">
          <div className="inbound-info-item">
            <label>INV. Sup:</label>
            <span>{inboundItem.reference || "data"}</span>
          </div>
          <div className="inbound-info-item">
            <label>User :</label>
            <span>{resolveInboundUserRef() || "User"}</span>
          </div>
          <div className="inbound-info-item">
            <label>Scan Barcode/Serial :</label>
            <input
              ref={scanBarcodeInputRef}
              type="text"
              className="inbound-scan-input"
              onKeyDown={handleScanBarcodeKeyDown}
              placeholder={
                isAllDoneBackend
                  ? "ดำเนินการเสร็จสิ้นแล้ว"
                  : "Scan Barcode/Serial"
              }
              disabled={!confirmedLocation || isAllDoneBackend}
            />
          </div>
        </div>

        <hr className="inbound-detail-divider" />

        <div className="inbound-info-row">
          <div className="inbound-search-bar">
            {/* LEFT: Tabs */}
            <div className="inbound-search-left">
              <div className="inbound-view-tabs">
                {pendingCount > 0 && (
                  <button
                    type="button"
                    className={`inbound-tab ${viewMode === "pending" ? "active" : ""}`}
                    onClick={() => setViewMode("pending")}
                  >
                    ยังไม่ได้ดำเนินการ{" "}
                    <span className="badge">{pendingCount}</span>
                  </button>
                )}

                {doneCount > 0 && (
                  <button
                    type="button"
                    className={`inbound-tab ${viewMode === "done" ? "active" : ""}`}
                    onClick={() => setViewMode("done")}
                  >
                    ดำเนินการเสร็จสิ้นแล้ว{" "}
                    <span className="badge">{doneCount}</span>
                  </button>
                )}
              </div>

              {!isAllDoneBackend && isAllDoneUI ? (
                <div className="inbound-hint-done">
                  นับครบทุกบรรทัดแล้ว ✅ กด “ยืนยัน” เพื่อบันทึกเข้า Stock
                </div>
              ) : null}

              {confirmedLocation ? (
                <div className="inbound-hint-loc">
                  Location ปัจจุบัน: <b>{confirmedLocation.full_name}</b>{" "}
                  <span>
                    (Temp:{" "}
                    <b>
                      {getTempFromLocation(confirmedLocation.full_name) || "-"}
                    </b>
                    )
                  </span>
                  {hasAnyCountedAtActiveLoc() ? (
                    <span> (มีการนับใน Location นี้แล้ว)</span>
                  ) : (
                    <span> (ยังไม่มีการนับใน Location นี้)</span>
                  )}
                </div>
              ) : null}
            </div>

            {/* RIGHT: Barcode Filter + Search */}
            <div className="inbound-search-right">
              <div className="inbound-search-row">
                <div className="inbound-search-controls">
                  <label className="inbound-barcode-filter-option">
                    <input
                      type="checkbox"
                      checked={showHasBarcodeOnly}
                      onChange={() => setShowHasBarcodeOnly((prev) => !prev)}
                    />
                    <span>มี Barcode</span>
                  </label>

                  <label className="inbound-barcode-filter-option">
                    <input
                      type="checkbox"
                      checked={showBarcodeMissingOnly}
                      onChange={() =>
                        setShowBarcodeMissingOnly((prev) => !prev)
                      }
                    />
                    <span>ยังไม่ถูกสร้าง</span>
                  </label>
                </div>

                <div className="inbound-search-field">
                  <label className="inbound-search-label">Search</label>
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
                </div>
              </div>
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
            rows.map((item, index) => {
              const itemId = String(item.id);

              // const countAtLoc = getCountAtActiveLoc(itemId);
              const locBreakdown = getAllLocCountsForItem(itemId);
              const locTempMismatch =
                !!activeLocKey &&
                !isTempAllowedForItemAtLoc(item, activeLocKey);

              return (
                <tr
                  key={itemId || index}
                  className={[
                    isDoneRow(item)
                      ? "row-done"
                      : isProgressRow(item)
                        ? "row-progress"
                        : "",
                    locTempMismatch ? "row-temp-mismatch" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <td>{index + 1}</td>
                  <td style={{ minWidth: "200px" }}>{item.code || "--"}</td>
                  <td style={{ minWidth: "200px" }}>{item.name || "--"}</td>
                  <td>{item.unit || "--"}</td>
                  <td>{getQtyReceive(item)}</td>

                  <td>
                    {editingItemId === itemId ? (
                      <div className="edit-qty-container">
                        <input
                          ref={(el) => {
                            editInputRef.current[itemId] = el;
                          }}
                          type="number"
                          min={0}
                          max={getQtyReceive(item)}
                          className="edit-qty-input"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleEditSave(itemId);
                            if (e.key === "Escape") handleEditCancel();
                          }}
                        />
                        <button
                          className="btn-save-edit"
                          onClick={() => handleEditSave(itemId)}
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
                          const backendCount = Number(item.quantity_count ?? 0);
                          const localTotal = getTotalCount(itemId);
                          const totalCount = Math.max(backendCount, localTotal);

                          return (
                            <>
                              <div style={{ fontWeight: 700 }}>
                                {totalCount}
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
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </td>

                  <td>
                    {item.lot ? (
                      item.lot
                    ) : (
                      <span style={{ color: "red", fontWeight: "500" }}>
                        null
                      </span>
                    )}
                  </td>
                  <td>
                    {item.exp ? (
                      formatDateTime(item.exp)
                    ) : (
                      <span style={{ color: "red", fontWeight: "500" }}>
                        null
                      </span>
                    )}
                  </td>

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
                    {item.updated_at ? formatDateTime(item.updated_at) : "-"}
                  </td>

                  <td>
                    <div className="inbound-action-buttons">
                      <div className="inbound-dropdown-container">
                        <button
                          ref={(el) => {
                            buttonRef.current[itemId] = el;
                          }}
                          className="btn-dropdown-toggle"
                          onClick={() => toggleDropdown(itemId)}
                          title="เมนูเพิ่มเติม"
                        >
                          <i className="fa-solid fa-ellipsis-vertical"></i>
                        </button>

                        {openDropdownId === itemId &&
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
                                  setDetailItem(item);
                                  setIsDetailLocaOpen(true);
                                  closeDropdown();
                                }}
                              >
                                <span className="menu-icon">
                                  <i className="fa-solid fa-circle-info"></i>
                                </span>
                                Detail
                              </button>

                              {/* ✅ Edit (inline) ยังเป็น location ปัจจุบันเท่านั้น
                              {(item as any).input_number ? (
                                <button
                                  className="inbound-dropdown-item"
                                  onClick={() => {
                                    if (!activeLocKey) {
                                      warningAlert("กรุณา Scan Location ก่อน");
                                      closeDropdown();
                                      return;
                                    }
                                    handleEditClick(itemId, countAtLoc);
                                    closeDropdown();
                                  }}
                                >
                                  <span className="menu-icon">
                                    <i className="fa-solid fa-pen-to-square"></i>
                                  </span>
                                  Edit QTY (Location นี้)
                                </button>
                              ) : null} */}

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
              );
            })
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
          disabled={isConfirming || isAllDoneBackend}
          title={
            isAllDoneBackend
              ? "ดำเนินการเสร็จสิ้นแล้ว (ยืนยันซ้ำไม่ได้)"
              : undefined
          }
        >
          {isAllDoneBackend
            ? "ยืนยันแล้ว"
            : isConfirming
              ? "กำลังยืนยัน..."
              : "ยืนยัน"}
        </button>
      </div>

      <DetailLocaModal
        isOpen={isDetailLocaOpen}
        onClose={() => {
          setIsDetailLocaOpen(false);
          setDetailItem(null);
        }}
        item={detailItem}
        countByLoc={countByLoc}
        activeLocKey={activeLocKey}
        onSetQty={handleSetQtyForLoc}
        onClear={(loc, itemId) => handleClearForLoc(loc, itemId)}
        onUndo={(loc, itemId) => handleUndoForLoc(loc, itemId)}
        onDeleteRow={handleDeleteLocRow}
      />
    </div>
  );
};

export default InboundById;
