import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { createPortal } from "react-dom";
import type { InboundType, GoodsInType } from "../types/inbound.type";
import { inboundApi } from "../services/inbound.api";
import { ensureSharedBarcodeForGoodsInGroup } from "../services/barcodeGeneration";
import { printBarcodeLabels } from "../services/barcodePrint";
import BarcodeModal from "./BarcodeModal";
import AddBarcodeByGoodInIdModal from "./AddBarcodeByGoodInIdModal";

import { toast } from "react-toastify";
import { warningAlert, successAlert, confirmAlert } from "../../../utils/alert";

import Table from "../../../components/Table/Table";
import Modal from "../../../components/Modal/Modal";
import Loading from "../../../components/Loading/Loading";
import "../../../components/Button/button.css";
import "../../../components/Table/table.css";
import "../../../styles/component.css";
import "../inbound.css";

import { formatDateTime } from "../../../components/Datetime/FormatDateTime";
import DetailLocaModal from "./DetailLocaModal";

import { socket } from "../../../services/socket";
import Swal from "sweetalert2";

import DetailNavigator from "../../../components/DetailNavigator/DetailNavigator";

type MenuPos = { top: number; left: number };

// ✅ Sort types
type SortKey =
  | "code"
  | "name"
  | "unit"
  | "zone_type"
  | "total_count"
  | "total_receive"
  | null;
type SortDir = "asc" | "desc";
type SortState = { key: SortKey; dir: SortDir };

// ✅ View tabs
type ViewMode = "pending" | "done";

// ✅ Multi-location count (location_full_name -> goods_in_id -> qty)
type LocKey = string;
type CountByLoc = Record<LocKey, Record<string, number>>;

type GroupedRow = {
  groupKey: string;
  product_id: number | null;
  code: string | null;
  name: string;
  unit: string;
  zone_type: string | null;
  items: GoodsInType[];
};

type ConfirmedLocationState = {
  id: number | null;
  full_name: string;
};

const getInboundLocStorageKey = (docNo?: string | null) =>
  docNo ? `inbound_loc_${docNo}` : "";

const normalizeLocationState = (raw: any): ConfirmedLocationState | null => {
  const fullName = String(
    raw?.full_name ??
      raw?.scanned_location_full_name ??
      raw?.location_full_name ??
      raw?.location_name ??
      "",
  ).trim();

  if (!fullName) return null;

  const rawId = raw?.id ?? raw?.scanned_location_id ?? raw?.location_id ?? null;

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
  docNo: string | undefined,
  loc: ConfirmedLocationState | null,
) => {
  if (!docNo) return;

  const key = getInboundLocStorageKey(docNo);
  if (!key) return;

  if (!loc?.full_name) {
    localStorage.removeItem(key);
    return;
  }

  localStorage.setItem(key, JSON.stringify(loc));
};

const restoreConfirmedLocationFromStorage = (
  docNo: string | undefined,
): ConfirmedLocationState | null => {
  if (!docNo) return null;

  const key = getInboundLocStorageKey(docNo);
  if (!key) return null;

  const stored = localStorage.getItem(key);
  if (!stored) return null;

  try {
    return normalizeLocationState(JSON.parse(stored));
  } catch {
    return null;
  }
};

const InboundById = () => {
  const { no } = useParams<{ no: string }>();
  const navigate = useNavigate();

  const location = useLocation();
  const navStatus = location.state?.status as
    | "pending"
    | "completed"
    | undefined;
  const navState = (location.state as any) || {};
  const stateDetailList = Array.isArray(navState.detailList)
    ? navState.detailList
    : [];
  const stateDetailTotal = Number(navState.detailTotal ?? 0);

  const [inboundItem, setInboundItem] = useState<InboundType | null>(null);
  const [detailList, setDetailList] = useState<Array<{ no: string }>>([]);

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

  // Edit qty (inline ในตาราง)
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
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(null);
  const [selectedGroupKeys, setSelectedGroupKeys] = useState<string[]>([]);
  const [isGeneratingBarcodes, setIsGeneratingBarcodes] = useState(false);
  const [isPrintingBarcodes, setIsPrintingBarcodes] = useState(false);

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
  const [confirmedLocation, setConfirmedLocation] =
    useState<ConfirmedLocationState | null>(null);

  const scanLocationInputRef = useRef<HTMLInputElement>(null);
  const [isLocationScanOpen, setIsLocationScanOpen] = useState(false);

  // ✅ Detail location modal
  const [isDetailLocaOpen, setIsDetailLocaOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<GoodsInType | null>(null);

  const activeLocKey: string = (confirmedLocation?.full_name || "").trim();

  const CHANGE_LOCATION_TOKEN = "CHANGELOCATION";

  const normalizeCommandToken = (v: unknown) =>
    String(v ?? "")
      .replace(/\s+/g, "")
      .trim()
      .toUpperCase();

  const openChangeLocationPrintPopup = useCallback(() => {
    const printWindow = window.open("", "_blank", "width=900,height=900");
    if (!printWindow) return;

    const qrPayload = "ChangeLocation";
    const locationText = "ChangeLocation";
    const pageWidth = "10.16cm";
    const pageHeight = "10.16cm";
    const qrMm = 84;
    const paddingMm = 2;
    const dashInsetMm = 1;

    printWindow.document.open();
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Print ChangeLocation</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }

          @page {
            size: ${pageWidth} ${pageHeight};
            margin: 0;
          }

          html, body {
            width: ${pageWidth};
            height: ${pageHeight};
            margin: 0;
            padding: 0;
            overflow: hidden;
            background: #fff;
            font-family: Arial, sans-serif;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .root {
            width: 100%;
            height: 100%;
            padding: ${paddingMm}mm;
            position: relative;
            display: flex;
            flex-direction: column;
            background: #fff;
          }

          .root::before {
            content: "";
            position: absolute;
            left: ${dashInsetMm}mm;
            top: ${dashInsetMm}mm;
            right: ${dashInsetMm}mm;
            bottom: ${dashInsetMm}mm;
            border: 0.2mm dashed #000;
            opacity: 0.35;
            pointer-events: none;
          }

          .qr-wrap {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            padding-top: 4mm;
            padding-bottom: 2mm;
            position: relative;
            z-index: 1;
          }

          .qr {
            width: ${qrMm}mm;
            height: ${qrMm}mm;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .qr canvas, .qr img {
            width: 100% !important;
            height: 100% !important;
            display: block;
          }

          .fullname {
            width: 100%;
            min-height: 10mm;
            padding: 0 4mm 3mm;
            text-align: center;
            font-weight: 700;
            font-size: 12pt;
            line-height: 1.2;
            word-break: break-word;
            position: relative;
            z-index: 1;
          }
        </style>

        <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
      </head>
      <body>
        <div class="root">
          <div class="qr-wrap">
            <div class="qr" id="qrcode"></div>
          </div>
          <div class="fullname">${locationText}</div>
        </div>

        <script>
          new QRCode(document.getElementById("qrcode"), {
            text: ${JSON.stringify(qrPayload)},
            width: 1200,
            height: 1200,
            correctLevel: QRCode.CorrectLevel.M
          });

          setTimeout(() => {
            window.focus();
            window.print();
          }, 800);
        </script>
      </body>
      </html>
  `);
    printWindow.document.close();
  }, []);

  const getUserRef = () => {
    const first = (localStorage.getItem("first_name") || "").trim();
    const last = (localStorage.getItem("last_name") || "").trim();
    return `${first} ${last}`.trim();
  };

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

  const getCountAtActiveLoc = useCallback(
    (itemId: string) => {
      if (!activeLocKey) return 0;
      return getCountAtLoc(activeLocKey, itemId);
    },
    [activeLocKey, getCountAtLoc],
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
    (item: GoodsInType) => {
      const itemId = String(item.id);
      const backendCount = Number(item.quantity_count ?? 0);
      const localTotal = getTotalCount(itemId);
      return Math.max(backendCount, localTotal);
    },
    [getTotalCount],
  );

  const replaceInboundLinesFromPayload = useCallback((payload: any) => {
    const lines = Array.isArray(payload?.lines) ? payload.lines : [];

    setInboundItem((prev) => {
      if (!prev) return prev;

      const prevById = new Map(
        ((prev.items || prev.goods_ins || []) as GoodsInType[]).map((x) => [
          String(x.id),
          x,
        ]),
      );

      const nextLines = lines.map((l: any) => {
        const old = prevById.get(String(l.id));

        const barcode_text =
          l.barcode_text ??
          l.barcode?.barcode ??
          (old as any)?.barcode_text ??
          (old as any)?.barcode?.barcode ??
          null;

        const barcodeObj = l.barcode ?? (old as any)?.barcode ?? null;

        return {
          ...(old || {}),
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
          user_ref: l.user_ref ?? (old as any)?.user_ref ?? null,
          goods_in_location_confirms:
            l.goods_in_location_confirms ??
            (old as any)?.goods_in_location_confirms ??
            [],
        } as GoodsInType;
      });

      return {
        ...prev,
        items: nextLines,
        goods_ins: nextLines,
      };
    });
  }, []);

  const syncCountByLocFromPayload = useCallback((payload: any) => {
    const locName = String(payload?.location?.location_name ?? "").trim();
    if (!locName) return;

    const matchedLine = payload?.matchedLine;
    if (!matchedLine?.id) return;

    const itemId = String(matchedLine.id);
    const totalQty = Number(
      matchedLine.qty_count ?? matchedLine.quantity_count ?? 0,
    );

    setCountByLoc((prev) => {
      const prevLocMap = prev[locName] || {};
      const otherLocTotal = Object.entries(prev || {}).reduce(
        (sum, [loc, map]) => {
          if (loc === locName) return sum;
          return sum + Number(map?.[itemId] ?? 0);
        },
        0,
      );

      const nextAtLoc = Math.max(0, totalQty - otherLocTotal);

      return {
        ...prev,
        [locName]: {
          ...prevLocMap,
          [itemId]: nextAtLoc,
        },
      };
    });
  }, []);

  const hydrateCountByLocFromDbRows = useCallback((rows: GoodsInType[]) => {
    const next: CountByLoc = {};

    rows.forEach((item: any) => {
      const confirms = Array.isArray(item?.goods_in_location_confirms)
        ? item.goods_in_location_confirms
        : Array.isArray(item?.location_confirms)
          ? item.location_confirms
          : [];

      confirms.forEach((c: any) => {
        const locName = String(c?.location?.full_name ?? "").trim();
        const qty = Number(c?.confirmed_qty ?? 0);
        if (!locName || qty <= 0) return;

        if (!next[locName]) next[locName] = {};
        next[locName][String(item.id)] = qty;
      });
    });

    setCountByLoc(next);
  }, []);

  const applyInboundPayload = useCallback(
    (
      payload: any,
      options?: {
        syncLocalLocation?: boolean;
        persistLocalLocation?: boolean;
      },
    ) => {
      const syncLocalLocation = options?.syncLocalLocation ?? false;
      const persistLocalLocation = options?.persistLocalLocation ?? false;

      const loc = normalizeLocationState(payload?.location ?? payload);

      if (syncLocalLocation && loc?.full_name) {
        setConfirmedLocation(loc);
        setScanLocation(loc.full_name);

        if (persistLocalLocation) {
          persistConfirmedLocation(no, loc);
        }
      }

      replaceInboundLinesFromPayload(payload);

      if (payload?.matchedLine?.id) {
        syncCountByLocFromPayload(payload);
      } else {
        const rows = payload?.items || payload?.goods_ins || [];
        if (Array.isArray(rows)) {
          hydrateCountByLocFromDbRows(rows);
        }
      }
    },
    [
      no,
      replaceInboundLinesFromPayload,
      syncCountByLocFromPayload,
      hydrateCountByLocFromDbRows,
    ],
  );

  // =========================
  // ✅ SCAN helpers
  // =========================
  const normalize = (v: unknown) =>
    (v ?? "")
      .toString()
      .replace(/\s|\r|\n|\t/g, "")
      .trim();

  const digitsOnly = (v: unknown) => normalize(v).replace(/\D/g, "");

  const isTempToken = (s: string) => {
    const t = (s || "").trim().toUpperCase();
    if (!t) return false;
    return /^-?\d{1,2}([\-~]\d{1,2})?C$/.test(t);
  };

  const getTempFromLocation = (locFullName: string): string => {
    const s = (locFullName || "").trim();
    if (!s) return "Normal";

    const idx = s.lastIndexOf("_");
    if (idx === -1) return "Normal";

    const tail = s.slice(idx + 1).trim();
    if (!tail) return "Normal";

    return isTempToken(tail) ? tail : "Normal";
  };

  const normTemp = (v: unknown) =>
    (v ?? "")
      .toString()
      .replace(/\s+/g, "")
      .trim()
      .toUpperCase()
      .replace("~", "-");

  const isTempAllowedForItemAtLoc = (
    item: GoodsInType,
    locFullName: string,
  ) => {
    const locTemp = normTemp(getTempFromLocation(locFullName));
    const itemTemp = normTemp((item as any)?.zone_type ?? "");
    if (!itemTemp) return true;
    return itemTemp === locTemp;
  };

  const getItemBarcode = (it: any) =>
    String(it?.barcode?.barcode || it?.barcode_text || "")
      .toUpperCase()
      .replace(/\s|\r|\n|\t/g, "")
      .trim();

  /** ISO barcode = lot_start, lot_stop, exp_start, exp_stop ไม่ใช่ 0 ทั้งหมด → ไม่ต้อง print */
  const isIsoBarcode = (it: any): boolean => {
    const b = it?.barcode;
    if (!b) return false;
    return (
      Number(b.lot_start ?? 0) !== 0 &&
      Number(b.lot_stop ?? 0) !== 0 &&
      Number(b.exp_start ?? 0) !== 0 &&
      Number(b.exp_stop ?? 0) !== 0
    );
  };

  const tokenOnly = (v: unknown) =>
    (v ?? "")
      .toString()
      .toUpperCase()
      .replace(/\s|\r|\n|\t/g, "")
      .trim();

  const parseGs1LikeScan = (scanRaw: string) => {
    const raw = String(scanRaw ?? "");
    const noSymbology = raw.replace(/^\][A-Za-z0-9]/, "");
    const compact = noSymbology.replace(/\r|\n|\t/g, "").trim();
    const normalized = compact.replace(/\s+/g, "");

    const result = {
      normalized,
      token: tokenOnly(normalized),
      digits: digitsOnly(normalized),
      barcodePart: "",
      lotPart: "",
      expPart: "",
      canonical: "",
    };

    const aiValues: Record<string, string> = {};

    if (/\(\d{2}\)/.test(normalized)) {
      const aiRegex = /\((\d{2})\)([^()]*)/g;
      let match: RegExpExecArray | null;
      while ((match = aiRegex.exec(normalized)) !== null) {
        aiValues[match[1]] = match[2] || "";
      }
    } else {
      const ai01 = normalized.match(/01(\d{14})/);
      const ai17 = normalized.match(/17(\d{6})/);
      const ai15 = normalized.match(/15(\d{6})/);
      const ai11 = normalized.match(/11(\d{6})/);
      const ai10 = normalized.match(/10([^\u001d\u001e\u001f()]+)/);
      const ai21 = normalized.match(/21([^\u001d\u001e\u001f()]+)/);

      if (ai01?.[1]) aiValues["01"] = ai01[1];
      if (ai17?.[1]) aiValues["17"] = ai17[1];
      if (ai15?.[1]) aiValues["15"] = ai15[1];
      if (ai11?.[1]) aiValues["11"] = ai11[1];
      if (ai10?.[1]) aiValues["10"] = ai10[1];
      if (ai21?.[1]) aiValues["21"] = ai21[1];
    }

    const barcodePart = digitsOnly(aiValues["01"] || aiValues["02"] || "");
    const lotPart = tokenOnly(aiValues["10"] || aiValues["21"] || "");
    const expPart = digitsOnly(
      aiValues["17"] || aiValues["15"] || aiValues["11"] || "",
    ).slice(0, 6);
    const canonical =
      barcodePart && lotPart && expPart
        ? `${barcodePart}${lotPart}${expPart}`
        : "";

    return {
      ...result,
      barcodePart,
      lotPart,
      expPart,
      canonical,
    };
  };

  const expToYyyymmdd = (d: unknown) => {
    if (!d) return "";
    const dt = new Date(d as any);
    if (Number.isNaN(dt.getTime())) return "";
    const yy = String(dt.getFullYear()).slice(-2);
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${yy}${mm}${dd}`;
  };

  const LOT_NULL_TOKEN = "XXXXXX";
  const EXP_NULL_TOKEN = "999999";

  const getItemLotRule = (it: any) => {
    const v = it?.lot_serial;
    const s = v == null ? LOT_NULL_TOKEN : tokenOnly(v);
    return s || LOT_NULL_TOKEN;
  };

  const getItemExpRule = (it: any) => {
    const v = it?.exp;
    if (v == null) return EXP_NULL_TOKEN;
    const yyyymmdd = expToYyyymmdd(v);
    return yyyymmdd || EXP_NULL_TOKEN;
  };

  type ScanPickResult =
    | {
        item: GoodsInType;
        reason: "OK_SINGLE" | "OK_LOT_ID" | "OK_LOT_SERIAL";
      }
    | {
        item?: undefined;
        reason: "EMPTY" | "NO_BARCODE_MATCH" | "AMBIGUOUS";
        candidates?: Array<{
          id: string;
          code: string | null;
          lot_id: number | null;
          lot: string | null;
          barcode: string;
          exp?: any;
          exp_yyyymmdd?: string | null;
          lot_serial?: string | null;
          lot_rule?: string;
          exp_rule?: string;
        }>;
      };

  const findItemByScanSmart = useCallback(
    (scanRaw: string): ScanPickResult => {
      const parsedScan = parseGs1LikeScan(scanRaw);
      const scanDigits = parsedScan.digits;
      const scanToken = parsedScan.token;

      if (!scanDigits && !scanToken) return { reason: "EMPTY" };

      const items = (inboundItem?.items ||
        inboundItem?.goods_ins ||
        []) as GoodsInType[];

      const candidates = items.filter((it: any) => {
        const barcodeToken = getItemBarcode(it);
        if (!barcodeToken) return false;

        const barcodeDigits = digitsOnly(barcodeToken);

        if (scanToken.includes(barcodeToken)) return true;
        if (barcodeDigits && scanDigits.includes(barcodeDigits)) return true;
        if (
          parsedScan.barcodePart &&
          (parsedScan.barcodePart.includes(barcodeToken) ||
            (barcodeDigits && parsedScan.barcodePart.includes(barcodeDigits)))
        ) {
          return true;
        }
        return false;
      });

      if (candidates.length === 0) return { reason: "NO_BARCODE_MATCH" };

      const strictMatched = candidates.filter((it: any) => {
        const lotRule = getItemLotRule(it);
        const expRule = getItemExpRule(it);

        const lotOk = parsedScan.lotPart
          ? parsedScan.lotPart.includes(lotRule) ||
            lotRule.includes(parsedScan.lotPart)
          : scanToken.includes(lotRule);
        const expOk = parsedScan.expPart
          ? parsedScan.expPart === expRule
          : scanDigits.includes(expRule);

        return lotOk && expOk;
      });

      if (strictMatched.length === 1) {
        return { item: strictMatched[0], reason: "OK_LOT_SERIAL" };
      }

      if (strictMatched.length === 0) {
        return {
          reason: "AMBIGUOUS",
          candidates: candidates.map((x: any) => ({
            id: String(x.id),
            code: x.code ?? null,
            lot_id: x.lot_id ?? null,
            lot: x.lot ?? null,
            barcode: getItemBarcode(x),
            exp: x.exp ?? null,
          })),
        };
      }

      return {
        reason: "AMBIGUOUS",
        candidates: candidates.map((x: any) => ({
          id: String(x.id),
          code: x.code ?? null,
          barcode: getItemBarcode(x),
          lot_id: x.lot_id ?? null,
          lot: x.lot ?? null,
          lot_serial: x.lot_serial ?? null,
          exp: x.exp ?? null,
          exp_yyyymmdd: expToYyyymmdd(x.exp) || null,
          lot_rule:
            (x.lot_serial == null ? "XXXXXX" : tokenOnly(x.lot_serial)) ||
            "XXXXXX",
          exp_rule: x.exp == null ? "999999" : expToYyyymmdd(x.exp) || "999999",
        })),
      };
    },
    [inboundItem],
  );

  const allRows = (inboundItem?.items ||
    inboundItem?.goods_ins ||
    []) as GoodsInType[];

  const upsertQtyViaBackend = useCallback(
    async (itemId: string, nextQtyAtActiveLoc: number) => {
      if (!no) return;
      if (!confirmedLocation) {
        warningAlert("กรุณา Scan Location ก่อน");
        return;
      }

      persistConfirmedLocation(no, confirmedLocation);

      const item = findItemById(itemId);
      if (!item) return;

      if (!isTempAllowedForItemAtLoc(item, confirmedLocation.full_name)) {
        const locTemp = getTempFromLocation(confirmedLocation.full_name) || "-";
        const itemTemp = (item as any)?.zone_type || "-";
        toast.error(
          `สแกนไม่ได้: Location Temp (${locTemp}) ไม่ตรงกับ Zone Temp (${itemTemp})`,
          { autoClose: 3500 },
        );
        return;
      }

      const receive = getQtyReceive(item);
      const totalNow = getTotalCount(itemId);
      const currentAtLoc = getCountAtActiveLoc(itemId);
      const totalWithoutThisLoc = Math.max(0, totalNow - currentAtLoc);

      if (nextQtyAtActiveLoc < 0) {
        toast.error("QTY ต้องไม่น้อยกว่า 0");
        return;
      }

      if (totalWithoutThisLoc + nextQtyAtActiveLoc > receive) {
        toast.error(
          `ห้ามเกินจำนวนรับ (${receive}) — ตอนนี้ Location อื่นนับไปแล้ว ${totalWithoutThisLoc}`,
        );
        return;
      }

      const diff = nextQtyAtActiveLoc - currentAtLoc;

      if (diff === 0) {
        successAlert("อัปเดต QTY นับ สำเร็จแล้ว");
        return;
      }

      // ✅ ลดจำนวน → backend ใหม่เป็น undo ทีละ event
      if (diff < 0) {
        const undoTimes = Math.abs(diff);
        let lastResp: any = null;

        for (let i = 0; i < undoTimes; i++) {
          lastResp = await inboundApi.undoScanBarcode(no, {
            goods_in_id: String(itemId),
            location_full_name: confirmedLocation.full_name,
          });
        }

        if (lastResp?.data) {
          applyInboundPayload(lastResp.data, {
            syncLocalLocation: false,
            persistLocalLocation: false,
          });
        }

        return;
      }

      // ✅ เพิ่มจำนวน → ใช้ scan เดิม
      const barcodeText = String(
        (item as any).barcode_text ?? item?.barcode?.barcode ?? "",
      ).trim();

      if (!barcodeText) {
        toast.error("รายการนี้ยังไม่มี Barcode สำหรับเพิ่มจำนวน");
        return;
      }

      const resp = await inboundApi.scanBarcode(no, {
        barcode: barcodeText,
        location_full_name: confirmedLocation.full_name,
        qty_input: diff,
      });

      applyInboundPayload(resp.data, {
        syncLocalLocation: false,
        persistLocalLocation: false,
      });
    },
    [
      no,
      confirmedLocation,
      findItemById,
      getQtyReceive,
      getTotalCount,
      getCountAtActiveLoc,
      applyInboundPayload,
    ],
  );
  const buildCountByLocFromRows = (rows: GoodsInType[]): CountByLoc => {
    const next: CountByLoc = {};

    rows.forEach((item: any) => {
      const confirms = Array.isArray(item?.goods_in_location_confirms)
        ? item.goods_in_location_confirms
        : [];

      confirms.forEach((c: any) => {
        const locName = String(c?.location?.full_name ?? "").trim();
        const qty = Number(c?.confirmed_qty ?? 0);
        if (!locName || qty <= 0) return;

        if (!next[locName]) next[locName] = {};
        next[locName][String(item.id)] = qty;
      });
    });

    return next;
  };

  const resolvePreferredLocationFromRows = (
    rows: GoodsInType[],
    inboundSnapshot?: InboundType | null,
    docNo?: string,
  ): ConfirmedLocationState | null => {
    const fromStorage = restoreConfirmedLocationFromStorage(docNo);
    if (fromStorage?.full_name) return fromStorage;

    const locFromInbound = normalizeLocationState({
      full_name: (inboundSnapshot as any)?.scanned_location_full_name,
      id: (inboundSnapshot as any)?.scanned_location_id,
    });
    if (locFromInbound?.full_name) return locFromInbound;

    const locFromRow = normalizeLocationState(
      (rows as any[]).find(
        (it: any) => it?.scanned_location_full_name || it?.scanned_location_id,
      ),
    );
    if (locFromRow?.full_name) return locFromRow;

    return null;
  };

  const resolveInboundUserRef = useCallback((): string | null => {
    const items = (inboundItem?.items || inboundItem?.goods_ins || []) as any[];
    if (!Array.isArray(items) || items.length === 0) return null;

    const refs = items
      .map((x) => String(x?.user_ref ?? "").trim())
      .filter(Boolean);

    if (refs.length !== items.length) return null;

    const uniq = Array.from(new Set(refs));
    if (uniq.length !== 1) return null;

    return uniq[0] || null;
  }, [inboundItem]);

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

  const getQtyAtLocForItem = useCallback(
    (loc: string, itemId: string) => {
      return Number(countByLoc[(loc || "").trim()]?.[String(itemId)] ?? 0);
    },
    [countByLoc],
  );

  const getInboundCountStorageKey = (docNo?: string | null) =>
    docNo ? `inbound_count_${docNo}` : "";

  const persistCountByLoc = (docNo: string | undefined, value: CountByLoc) => {
    if (!docNo) return;
    const key = getInboundCountStorageKey(docNo);
    if (!key) return;

    const hasAny = Object.values(value || {}).some((m) =>
      Object.values(m || {}).some((v) => Number(v) > 0),
    );

    if (!hasAny) {
      localStorage.removeItem(key);
      return;
    }

    localStorage.setItem(key, JSON.stringify(value));
  };

  const restoreCountByLoc = (docNo: string | undefined): CountByLoc => {
    if (!docNo) return {};
    const key = getInboundCountStorageKey(docNo);
    if (!key) return {};

    const stored = localStorage.getItem(key);
    if (!stored) return {};

    try {
      const parsed = JSON.parse(stored);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  };

  const getApiErrorMessage = (
    err: any,
    fallback = "Scan Barcode ไม่สำเร็จ",
  ) => {
    const data = err?.response?.data;

    if (typeof data === "string" && data.trim()) return data;
    if (typeof data?.message === "string" && data.message.trim())
      return data.message;
    if (Array.isArray(data?.message) && data.message.length > 0) {
      return data.message.join(", ");
    }

    if (typeof err?.message === "string" && err.message.trim()) {
      return err.message;
    }

    return fallback;
  };

  // const setCountWithHistoryForLoc = useCallback(
  //   (loc: string, itemId: string, newQty: number) => {
  //     const lk = (loc || "").trim();
  //     if (!lk) return;

  //     const id = String(itemId);
  //     const currentQty = getCountAtLoc(lk, id);
  //     if (currentQty === newQty) return;

  //     const hk = histKeyOf(lk, id);
  //     setQtyHistory((h) => ({
  //       ...h,
  //       [hk]: [...(h[hk] || []), currentQty],
  //     }));

  //     setCountByLoc((prev) => {
  //       const currLocMap = prev[lk] || {};
  //       return {
  //         ...prev,
  //         [lk]: { ...currLocMap, [id]: newQty },
  //       };
  //     });
  //   },
  //   [getCountAtLoc, histKeyOf],
  // );

  const hasAnyCountedAtActiveLoc = useCallback(() => {
    if (!activeLocKey) return false;
    const map = countByLoc[activeLocKey] || {};
    return Object.values(map).some((v) => Number(v) > 0);
  }, [countByLoc, activeLocKey]);

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
        persistConfirmedLocation(no, null);

        if (scanBarcodeInputRef.current) scanBarcodeInputRef.current.value = "";

        setTimeout(() => scanLocationInputRef.current?.focus(), 0);
        return true;
      }

      const stored = restoreConfirmedLocationFromStorage(no);
      if (stored?.full_name) {
        setConfirmedLocation(stored);
        setScanLocation(stored.full_name);
      }

      setTimeout(() => {
        const restored =
          stored?.full_name || confirmedLocation?.full_name || scanLocation;
        if (restored) scanBarcodeInputRef.current?.focus();
        else scanLocationInputRef.current?.focus();
      }, 0);

      return false;
    });
  }, [confirmedLocation, no, scanLocation]);

  const beginChangeLocationMode = useCallback(() => {
    setConfirmedLocation(null);
    setScanLocation("");
    persistConfirmedLocation(no, null);

    setIsLocationScanOpen(true);

    if (scanBarcodeInputRef.current) {
      scanBarcodeInputRef.current.value = "";
    }

    setTimeout(() => {
      scanLocationInputRef.current?.focus();
    }, 0);
  }, [no]);

  const groupedItemHeaders = [
    "No",
    "Lot. Serial",
    "Expire Date",
    "Zone Temp",
    "QTY รับ",
    "QTY นับ",
    "Action",
  ];

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

  // =========================
  // ✅ Scan Location
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

      // sync เฉพาะ line/count จาก backend
      applyInboundPayload(resp.data, {
        syncLocalLocation: false,
        persistLocalLocation: false,
      });

      const nextLoc =
        normalizeLocationState({
          location_id: resp.data?.location?.location_id,
          location_name: resp.data?.location?.location_name ?? fullName,
        }) ?? normalizeLocationState({ full_name: fullName });

      // เปลี่ยน active location เฉพาะ browser นี้
      setConfirmedLocation(nextLoc);
      setScanLocation(nextLoc?.full_name ?? fullName);
      persistConfirmedLocation(no, nextLoc);

      setIsLocationScanOpen(false);
      toast.success(`Location OK: ${nextLoc?.full_name ?? fullName}`);

      setTimeout(() => scanBarcodeInputRef.current?.focus(), 100);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Scan Location ไม่สำเร็จ");
      setConfirmedLocation(null);
      persistConfirmedLocation(no, null);
    } finally {
      setLoading(false);
    }
  };

  const askQtyInputForScan = useCallback(
    async (item: GoodsInType): Promise<number | null> => {
      const itemId = String(item.id);
      const receive = Number(item.quantity_receive ?? (item as any).qty ?? 0);
      const totalNow = getTotalCount(itemId);
      const remain = Math.max(0, receive - totalNow);

      const result = await Swal.fire({
        title: "กรอกจำนวน",
        html: `
        <div style="text-align:left;font-size:14px">
          <div><b>สินค้า:</b> ${item.code ?? "-"} ${item.name ?? ""}</div>
          <div><b>Lot:</b> ${(item as any).lot_serial ?? (item as any).lot ?? "-"}</div>
          <div><b>QTY รับ:</b> ${receive}</div>
          <div><b>นับแล้ว:</b> ${totalNow}</div>
          <div><b>คงเหลือให้นับ:</b> ${remain}</div>
        </div>
      `,
        input: "number",
        inputValue: 1,
        inputAttributes: {
          min: "1",
          step: "1",
        },
        showCancelButton: true,
        confirmButtonText: "ตกลง",
        cancelButtonText: "ยกเลิก",
        reverseButtons: true,
        inputValidator: (value) => {
          const q = Number(value);
          if (!value) return "กรุณากรอกจำนวน";
          if (!Number.isFinite(q) || q <= 0) return "จำนวนต้องมากกว่า 0";
          if (!Number.isInteger(q)) return "จำนวนต้องเป็นจำนวนเต็ม";
          return undefined;
        },
      });

      if (!result.isConfirmed) return null;

      const qty = Number(result.value);
      if (!Number.isFinite(qty) || qty <= 0) return null;

      return Math.floor(qty);
    },
    [getTotalCount],
  );

  const resolveTargetItemForScan = useCallback(
    (scannedText: string): GoodsInType | null => {
      const picked = findItemByScanSmart(scannedText);

      if (!picked?.item) return null;

      const targetItem = findItemToIncrement(picked.item);
      if (!targetItem) return null;

      return targetItem;
    },
    [findItemByScanSmart, findItemToIncrement],
  );

  // =========================
  // ✅ Scan Barcode / Serial
  // =========================
  const handleScanBarcodeKeyDown = async (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key !== "Enter" && e.key !== "Tab") return;
    e.preventDefault();

    if (!no || isAllDoneReal) return;

    const inputEl = e.currentTarget as HTMLInputElement;
    const scannedRaw = String(inputEl?.value ?? "").trim();
    const commandToken = normalizeCommandToken(scannedRaw);

    if (!scannedRaw) return;

    // ✅ special command: ChangeLocation
    if (commandToken === CHANGE_LOCATION_TOKEN) {
      beginChangeLocationMode();
      toast.info("กรุณาสแกน Location ใหม่");
      return;
    }

    const parsedScan = parseGs1LikeScan(scannedRaw);
    const scanned = parsedScan.normalized || scannedRaw;

    const effectiveLoc = confirmedLocation;
    if (!effectiveLoc?.full_name) {
      toast.warning("กรุณาสแกน Location ก่อน");
      if (scanBarcodeInputRef.current) {
        scanBarcodeInputRef.current.value = "";
      }
      return;
    }

    const targetItem = resolveTargetItemForScan(scannedRaw);

    let qty_input: number | undefined = undefined;

    if (targetItem && (targetItem as any)?.input_number) {
      const itemId = String(targetItem.id);
      const receive = Number(
        targetItem.quantity_receive ?? (targetItem as any).qty ?? 0,
      );
      const totalNow = getTotalCount(itemId);
      const remain = Math.max(0, receive - totalNow);

      if (remain > 0) {
        const qty = await askQtyInputForScan(targetItem);
        if (qty == null) {
          if (scanBarcodeInputRef.current) {
            scanBarcodeInputRef.current.value = "";
            scanBarcodeInputRef.current.focus();
          }
          return;
        }
        qty_input = qty;
      }
    }

    try {
      const resp = await inboundApi.scanBarcode(no, {
        barcode: scanned,
        location_full_name: effectiveLoc.full_name,
        ...(qty_input != null ? { qty_input } : {}),
      });

      applyInboundPayload(resp.data, {
        syncLocalLocation: false,
        persistLocalLocation: false,
      });

      setConfirmedLocation(effectiveLoc);
      setScanLocation(effectiveLoc.full_name);
      persistConfirmedLocation(no, effectiveLoc);

      if (scanBarcodeInputRef.current) {
        scanBarcodeInputRef.current.value = "";
        scanBarcodeInputRef.current.focus();
      }
    } catch (err: any) {
      toast.error(getApiErrorMessage(err, "Scan Barcode ไม่สำเร็จ"));

      if (scanBarcodeInputRef.current) {
        scanBarcodeInputRef.current.value = "";
        scanBarcodeInputRef.current.focus();
      }
    } finally {
      setLoading(false);
    }
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

        const rows = ((data as any)?.items ||
          (data as any)?.goods_ins ||
          []) as GoodsInType[];
        hydrateCountByLocFromDbRows(rows);

        const restoredDraft = restoreCountByLoc(no);

        // ถ้า DB ยังไม่มี confirms ให้ใช้ draft จาก sessionStorage
        const hasDbConfirms = rows.some(
          (it: any) =>
            (Array.isArray(it?.goods_in_location_confirms) &&
              it.goods_in_location_confirms.length > 0) ||
            (Array.isArray(it?.location_confirms) &&
              it.location_confirms.length > 0),
        );

        if (!hasDbConfirms) {
          setCountByLoc(restoredDraft);
        }

        const bootLoc = resolvePreferredLocationFromRows(rows, data, no);

        if (bootLoc?.full_name) {
          setConfirmedLocation(bootLoc);
          setScanLocation(bootLoc.full_name);
          persistConfirmedLocation(no, bootLoc);
        }
      } catch (error) {
        console.error("Error fetching inbound data:", error);
        toast.error("Failed to load inbound data.");
      } finally {
        setLoading(false);
      }
    };

    fetchInboundData();
  }, [no, hydrateCountByLocFromDbRows]);

  // focus barcode input when location text has something
  useEffect(() => {
    if (
      scanLocation.trim() &&
      scanBarcodeInputRef.current &&
      confirmedLocation
    ) {
      scanBarcodeInputRef.current.focus();
    }
  }, [scanLocation, confirmedLocation]);

  // persist location ทุกครั้งที่เปลี่ยน
  useEffect(() => {
    if (!no) return;
    persistConfirmedLocation(no, confirmedLocation);
  }, [no, confirmedLocation]);

  // restore จาก sessionStorage ถ้ายังไม่มี
  useEffect(() => {
    if (!no) return;
    if (confirmedLocation?.full_name) return;

    const stored = restoreConfirmedLocationFromStorage(no);
    if (!stored?.full_name) return;

    setConfirmedLocation(stored);
    setScanLocation((prev) => prev || stored.full_name);
  }, [no, confirmedLocation]);

  // persist count draft ทุกครั้งที่แก้ไข countByLoc
  useEffect(() => {
    if (!no) return;
    persistCountByLoc(no, countByLoc);
  }, [no, countByLoc]);

  // fallback restore จาก backend item-level
  // useEffect(() => {
  //   if (!no) return;
  //   if (confirmedLocation?.full_name) return;

  //   const backendLoc =
  //     normalizeLocationState({
  //       scanned_location_full_name: (inboundItem as any)
  //         ?.scanned_location_full_name,
  //       scanned_location_id: (inboundItem as any)?.scanned_location_id,
  //     }) ??
  //     normalizeLocationState(
  //       (
  //         (inboundItem as any)?.items ||
  //         (inboundItem as any)?.goods_ins ||
  //         []
  //       ).find((it: any) => it?.scanned_location_full_name),
  //     );

  //   if (backendLoc?.full_name) {
  //     setConfirmedLocation(backendLoc);
  //     setScanLocation((prev) => prev || backendLoc.full_name);
  //     persistConfirmedLocation(no, backendLoc);
  //   }
  // }, [no, inboundItem, confirmedLocation]);

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
  // ✅ Modal actions
  // =========================
  const handleSetQtyForLoc = useCallback(
    async (loc: string, itemId: string, nextQty: number) => {
      const item = findItemById(itemId);
      if (!item) return;

      if (Number.isNaN(nextQty) || nextQty < 0) {
        toast.error("กรุณาใส่ตัวเลขที่ถูกต้อง");
        return;
      }

      if (!confirmedLocation || confirmedLocation.full_name !== loc) {
        const nextLoc = {
          id: confirmedLocation?.id ?? null,
          full_name: loc,
        };
        setConfirmedLocation(nextLoc);
        setScanLocation(loc);
        persistConfirmedLocation(no, nextLoc);
      }

      try {
        setLoading(true);
        await upsertQtyViaBackend(itemId, nextQty);
      } catch (err: any) {
        toast.error(err?.response?.data?.message || "อัปเดต QTY นับ ไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    },
    [findItemById, confirmedLocation, no, upsertQtyViaBackend],
  );

  const handleUndoForLoc = useCallback(
    async (
      loc: string,
      itemId: string,
    ): Promise<{ ok: boolean; message: string }> => {
      if (!no) {
        return { ok: false, message: "ไม่พบเลขที่เอกสาร" };
      }

      const currentQty = getQtyAtLocForItem(loc, itemId);
      if (currentQty <= 0) {
        return { ok: false, message: "ไม่มี QTY ให้ย้อนกลับแล้ว" };
      }

      try {
        const resp = await inboundApi.undoScanBarcode(no, {
          goods_in_id: String(itemId),
          location_full_name: loc,
        });

        applyInboundPayload(resp.data, {
          syncLocalLocation: false,
          persistLocalLocation: false,
        });

        return { ok: true, message: "ย้อนกลับ QTY นับล่าสุดแล้ว" };
      } catch (err: any) {
        return {
          ok: false,
          message: err?.response?.data?.message || "Undo ไม่สำเร็จ",
        };
      }
    },
    [no, getQtyAtLocForItem, applyInboundPayload],
  );
  const handleClearForLoc = useCallback(
    async (
      loc: string,
      itemId: string,
    ): Promise<{ ok: boolean; message: string }> => {
      if (!no) {
        return { ok: false, message: "ไม่พบเลขที่เอกสาร" };
      }

      const currentQty = getQtyAtLocForItem(loc, itemId);
      if (currentQty <= 0) {
        return { ok: false, message: "ไม่มี QTY ให้เคลียร์แล้ว" };
      }

      let lastSuccessResp: any = null;
      let successCount = 0;

      try {
        for (let i = 0; i < currentQty; i++) {
          const resp = await inboundApi.undoScanBarcode(no, {
            goods_in_id: String(itemId),
            location_full_name: loc,
          });
          lastSuccessResp = resp;
          successCount++;
        }

        if (lastSuccessResp?.data) {
          applyInboundPayload(lastSuccessResp.data, {
            syncLocalLocation: false,
            persistLocalLocation: false,
          });
        }

        return { ok: true, message: "เคลียร์แล้ว" };
      } catch (err: any) {
        // Sync state from last successful response (partial clear)
        if (lastSuccessResp?.data) {
          applyInboundPayload(lastSuccessResp.data, {
            syncLocalLocation: false,
            persistLocalLocation: false,
          });
        }

        // If no undo succeeded, backend likely already at 0 → refresh from server
        if (successCount === 0) {
          try {
            const response = await inboundApi.getById(no);
            const data = response.data as unknown as InboundType;
            setInboundItem(data);
            const rows = ((data as any)?.items ||
              (data as any)?.goods_ins ||
              []) as GoodsInType[];
            hydrateCountByLocFromDbRows(rows);
            return { ok: true, message: "เคลียร์แล้ว (ข้อมูลซิงค์จากระบบ)" };
          } catch {
            // ignore refresh error
          }
        }

        if (successCount > 0) {
          return { ok: true, message: "เคลียร์แล้ว" };
        }

        return {
          ok: false,
          message: err?.response?.data?.message || "Clear ไม่สำเร็จ",
        };
      }
    },
    [no, getQtyAtLocForItem, applyInboundPayload, hydrateCountByLocFromDbRows],
  );

  // ---------- edit qty ----------
  const handleEditSave = async (itemId: string) => {
    if (!activeLocKey) {
      warningAlert("กรุณา Scan Location ก่อน");
      return;
    }

    const newValue = parseInt(editValue, 10);
    if (Number.isNaN(newValue) || newValue < 0) {
      toast.error("กรุณาใส่ตัวเลขที่ถูกต้อง");
      return;
    }

    try {
      setLoading(true);
      await upsertQtyViaBackend(String(itemId), newValue);

      setEditingItemId(null);
      setEditValue("");
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || "แก้ไขจำนวน QTY นับ ไม่สำเร็จ",
      );
    } finally {
      setLoading(false);
    }
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

  const handleBarcodeCreated = (item: GoodsInType) => {
    setIsAddBarcodeOpen(false);
    setSelectedGoodsIn(item);
    setIsBarcodeModalOpen(true);
  };

  const handleBarcodeSuccess = async () => {
    if (!no) return;
    try {
      const response = await inboundApi.getById(no);
      const data = response.data as unknown as InboundType;
      setInboundItem(data);

      const rows = ((data as any)?.items ||
        (data as any)?.goods_ins ||
        []) as GoodsInType[];
      hydrateCountByLocFromDbRows(rows);

      const bootLoc = resolvePreferredLocationFromRows(rows, data, no);

      if (bootLoc?.full_name) {
        setConfirmedLocation(bootLoc);
        setScanLocation(bootLoc.full_name);
        persistConfirmedLocation(no, bootLoc);
      }
    } catch (error) {
      console.error("Error refreshing data:", error);
    }
  };

  // ---------- confirm (multi-location) ----------
  const handleConfirm = async () => {
    if (!no) return;

    if (isAllDoneReal) {
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

    let latestInbound: InboundType | null = null;
    let latestRows = allRows;
    let workingCountByLoc = countByLoc;

    try {
      const response = await inboundApi.getById(no);
      latestInbound = response.data as unknown as InboundType;
      latestRows = ((latestInbound as any)?.items ||
        (latestInbound as any)?.goods_ins ||
        []) as GoodsInType[];

      setInboundItem(latestInbound);

      const dbCountByLoc = buildCountByLocFromRows(latestRows);
      hydrateCountByLocFromDbRows(latestRows);

      const hasDbConfirms = Object.keys(dbCountByLoc).length > 0;
      workingCountByLoc = hasDbConfirms ? dbCountByLoc : restoreCountByLoc(no);
    } catch {
      toast.warning("ดึงข้อมูลล่าสุดจากระบบไม่สำเร็จ กำลังใช้ข้อมูลที่มีอยู่");
    }

    const locEntries = Object.entries(workingCountByLoc || {}).filter(
      ([_, map]) => Object.values(map || {}).some((v) => Number(v) > 0),
    );

    let payloadLocations: {
      location_full_name: string | null;
      lines: { goods_in_id: string; quantity_count: number }[];
    }[] = locEntries
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

    if (payloadLocations.length === 0) {
      const fallbackMap: Record<
        string,
        { goods_in_id: string; quantity_count: number }[]
      > = {};

      latestRows.forEach((item: any) => {
        const confirms = Array.isArray(item?.goods_in_location_confirms)
          ? item.goods_in_location_confirms
          : [];

        confirms.forEach((c: any) => {
          const locName = String(c?.location?.full_name ?? "").trim();
          const qty = Number(c?.confirmed_qty ?? 0);
          if (!locName || qty <= 0) return;

          if (!fallbackMap[locName]) fallbackMap[locName] = [];

          fallbackMap[locName].push({
            goods_in_id: String(item.id),
            quantity_count: qty,
          });
        });
      });

      payloadLocations = Object.entries(fallbackMap).map(([loc, lines]) => ({
        location_full_name: loc,
        lines,
      }));
    }

    if (payloadLocations.length === 0) {
      const backendLines = latestRows
        .map((it: any) => ({
          goods_in_id: String(it.id),
          quantity_count: Number(it.quantity_count ?? 0),
        }))
        .filter((x) => x.quantity_count > 0);

      const fallbackLocationName =
        resolvePreferredLocationFromRows(
          latestRows,
          latestInbound ?? inboundItem,
          no,
        )?.full_name ||
        confirmedLocation?.full_name ||
        "";

      if (backendLines.length > 0) {
        payloadLocations = [
          {
            location_full_name: fallbackLocationName || null,
            lines: backendLines,
          },
        ];
      }
    }

    if (payloadLocations.length === 0) {
      warningAlert(
        "ยังไม่มีรายการที่นับ (QTY นับ = 0 ทั้งหมด) หรือไม่พบ Location จากข้อมูลที่เคยนับไว้",
      );
      return;
    }

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
      persistConfirmedLocation(no, null);
      persistCountByLoc(no, {});
      navigate("/inbound");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Confirm ไม่สำเร็จ");
    } finally {
      setLoading(false);
      setIsConfirming(false);
    }
  };

  // ✅ “ทั้งใบเสร็จ” ต้องอิงจาก backend เท่านั้น
  // const isAllDoneBackend =
  //   !!inboundItem &&
  //   allRows.length > 0 &&
  //   allRows.every((it) => {
  //     const receive = getQtyReceive(it);
  //     const backendCount = Number(it.quantity_count ?? 0);
  //     return receive > 0 && backendCount === receive;
  //   });

  // const isAllDoneUI =
  //   !!inboundItem &&
  //   allRows.length > 0 &&
  //   allRows.every((it) => {
  //     const receive = getQtyReceive(it);
  //     const effective = getEffectiveCount(it);
  //     return receive > 0 && effective === receive;
  //   });

  const isAllDoneReal =
    !!inboundItem &&
    allRows.length > 0 &&
    allRows.every((it) => {
      const receive = getQtyReceive(it);
      const count = Number(it.quantity_count ?? 0);
      const inProcess = Boolean((it as any).in_process);
      return receive > 0 && count === receive && inProcess;
    });

  const isCompletedStatus =
    isAllDoneReal || String((inboundItem as any)?.status ?? "") === "completed";

  useEffect(() => {
    if (!isAllDoneReal) return;

    setIsLocationScanOpen(false);
    setScanLocation("");

    if (scanBarcodeInputRef.current) scanBarcodeInputRef.current.value = "";

    setOpenDropdownId(null);
    setMenuPos(null);
  }, [isAllDoneReal]);

  const barcodeFilteredRows = allRows.filter((item) => {
    const hasBarcode = item.barcode !== null;

    if (showHasBarcodeOnly && showBarcodeMissingOnly) return true;
    if (showHasBarcodeOnly) return hasBarcode;
    if (showBarcodeMissingOnly) return !hasBarcode;
    return true;
  });

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

  const groupedFilteredRows: GroupedRow[] = (() => {
    const map = new Map<string, GroupedRow>();

    filteredRows.forEach((item) => {
      const key = [
        String(item.product_id ?? "null"),
        norm(item.code),
        norm(item.name),
        norm(item.unit),
      ].join("||");

      const current = map.get(key);
      if (current) {
        current.items.push(item);
        return;
      }

      map.set(key, {
        groupKey: key,
        product_id: item.product_id ?? null,
        code: item.code ?? null,
        name: item.name || "",
        unit: item.unit || "",
        zone_type: item.zone_type ?? null,
        items: [item],
      });
    });

    return Array.from(map.values()).map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => {
        const lotA = String((a as any).lot_serial ?? a.lot ?? "");
        const lotB = String((b as any).lot_serial ?? b.lot ?? "");
        const lotCmp = lotA.localeCompare(lotB, "th", {
          numeric: true,
          sensitivity: "base",
        });
        if (lotCmp !== 0) return lotCmp;

        const expA = String(a.exp ?? "");
        const expB = String(b.exp ?? "");
        const expCmp = expA.localeCompare(expB, "th", {
          numeric: true,
          sensitivity: "base",
        });
        if (expCmp !== 0) return expCmp;

        return String(a.id).localeCompare(String(b.id), "th", {
          numeric: true,
          sensitivity: "base",
        });
      }),
    }));
  })();

  const getGroupTotalReceive = useCallback(
    (group: GroupedRow) =>
      group.items.reduce((sum, item) => sum + getQtyReceive(item), 0),
    [getQtyReceive],
  );

  const getGroupTotalCount = useCallback(
    (group: GroupedRow) =>
      group.items.reduce((sum, item) => sum + getEffectiveCount(item), 0),
    [getEffectiveCount],
  );

  const isDoneGroup = useCallback(
    (group: GroupedRow) => {
      const receive = getGroupTotalReceive(group);
      const count = getGroupTotalCount(group);
      return receive > 0 && count === receive;
    },
    [getGroupTotalCount, getGroupTotalReceive],
  );

  const isProgressGroup = useCallback(
    (group: GroupedRow) => {
      const receive = getGroupTotalReceive(group);
      const count = getGroupTotalCount(group);
      return count > 0 && count !== receive;
    },
    [getGroupTotalCount, getGroupTotalReceive],
  );

  const pendingCount = groupedFilteredRows.filter(
    (group) => !isDoneGroup(group),
  ).length;
  const doneCount = groupedFilteredRows.filter(isDoneGroup).length;
  const doneGroupCount = doneCount;

  useEffect(() => {
    if (pendingCount === 0 && doneCount > 0) {
      setViewMode("done");
    }
  }, [pendingCount, doneCount]);

  const groupedRows: GroupedRow[] = (() => {
    const grouped = groupedFilteredRows.filter((group) =>
      viewMode === "done" ? isDoneGroup(group) : !isDoneGroup(group),
    );

    grouped.sort((a, b) => {
      if (viewMode === "pending") {
        const aProgress = isProgressGroup(a) ? 0 : 1;
        const bProgress = isProgressGroup(b) ? 0 : 1;
        if (aProgress !== bProgress) return aProgress - bProgress;
      }

      if (!sort.key) return 0;

      if (sort.key === "total_count") {
        const aTotal = getGroupTotalCount(a);
        const bTotal = getGroupTotalCount(b);
        return sort.dir === "asc" ? aTotal - bTotal : bTotal - aTotal;
      }

      if (sort.key === "total_receive") {
        const aTotal = getGroupTotalReceive(a);
        const bTotal = getGroupTotalReceive(b);
        return sort.dir === "asc" ? aTotal - bTotal : bTotal - aTotal;
      }

      const aVal =
        sort.key === "code"
          ? norm(a.code)
          : sort.key === "name"
            ? norm(a.name)
            : sort.key === "unit"
              ? norm(a.unit)
              : norm(a.zone_type);

      const bVal =
        sort.key === "code"
          ? norm(b.code)
          : sort.key === "name"
            ? norm(b.name)
            : sort.key === "unit"
              ? norm(b.unit)
              : norm(b.zone_type);

      const cmp = aVal.localeCompare(bVal, "th", {
        numeric: true,
        sensitivity: "base",
      });
      return sort.dir === "asc" ? cmp : -cmp;
    });

    return grouped;
  })();

  const getGroupItemsByItemId = useCallback(
    (itemId: string) => {
      const foundGroup = groupedRows.find((group) =>
        group.items.some((item) => String(item.id) === String(itemId)),
      );

      return foundGroup?.items ?? [];
    },
    [groupedRows],
  );

  const visibleGroupKeys = groupedRows.map((group) => group.groupKey);

  const allVisibleGroupsSelected =
    visibleGroupKeys.length > 0 &&
    visibleGroupKeys.every((groupKey) => selectedGroupKeys.includes(groupKey));

  const toggleAllVisibleGroupSelections = useCallback(() => {
    setSelectedGroupKeys((prev) => {
      if (allVisibleGroupsSelected) {
        return prev.filter((groupKey) => !visibleGroupKeys.includes(groupKey));
      }

      const merged = new Set([...prev, ...visibleGroupKeys]);
      return Array.from(merged);
    });
  }, [allVisibleGroupsSelected, visibleGroupKeys]);

  const groupTableHeaders = [
    "No",
    <div key="h-code" className="inbound-id-product-table">
      <input
        type="checkbox"
        checked={allVisibleGroupsSelected}
        onChange={toggleAllVisibleGroupSelections}
        disabled={
          isPrintingBarcodes ||
          isGeneratingBarcodes ||
          visibleGroupKeys.length === 0
        }
        title="เลือกทั้งหมด"
      />
      <button
        type="button"
        className="th-sort-btn"
        onClick={() => toggleSort("code")}
        title="Sort Code"
      >
        สินค้า <SortIcon active={sort.key === "code"} dir={sort.dir} />
      </button>
    </div>,
    <button
      type="button"
      className="th-sort-btn"
      onClick={() => toggleSort("name")}
      title="Sort ชื่อ"
      key="h-name"
    >
      ชื่อ <SortIcon active={sort.key === "name"} dir={sort.dir} />
    </button>,
    <button
      type="button"
      className="th-sort-btn"
      onClick={() => toggleSort("unit")}
      title="Sort หน่วย"
      key="h-unit"
    >
      หน่วย <SortIcon active={sort.key === "unit"} dir={sort.dir} />
    </button>,
    <button
      type="button"
      className="th-sort-btn"
      onClick={() => toggleSort("zone_type")}
      title="Sort Zone Temp"
      key="h-zone"
    >
      Zone Temp <SortIcon active={sort.key === "zone_type"} dir={sort.dir} />
    </button>,
    <button
      type="button"
      className="th-sort-btn"
      onClick={() => toggleSort("total_count")}
      title="Sort จำนวนรวม"
      key="h-total-count"
    >
      จำนวนรวม <SortIcon active={sort.key === "total_count"} dir={sort.dir} />
    </button>,
    <button
      type="button"
      className="th-sort-btn"
      onClick={() => toggleSort("total_receive")}
      title="Sort จำนวนรับ"
      key="h-total-receive"
    >
      จำนวนรับ <SortIcon active={sort.key === "total_receive"} dir={sort.dir} />
    </button>,
    "Action",
  ];

  const selectableGroupKeys = groupedRows
    .filter((group) =>
      group.items.some((item) => !getItemBarcode(item) && !isIsoBarcode(item)),
    )
    .map((group) => group.groupKey);

  const allSelectableGroupsSelected =
    selectableGroupKeys.length > 0 &&
    selectableGroupKeys.every((groupKey) =>
      selectedGroupKeys.includes(groupKey),
    );

  const selectedGroup =
    openGroupKey == null
      ? null
      : groupedRows.find((g) => g.groupKey === openGroupKey) || null;

  const closeGroupModal = () => {
    setOpenGroupKey(null);
    closeDropdown();
  };

  const toggleGroupSelection = useCallback((groupKey: string) => {
    setSelectedGroupKeys((prev) =>
      prev.includes(groupKey)
        ? prev.filter((key) => key !== groupKey)
        : [...prev, groupKey],
    );
  }, []);

  const toggleAllGroupSelections = useCallback(() => {
    setSelectedGroupKeys((prev) => {
      if (allSelectableGroupsSelected) {
        return prev.filter(
          (groupKey) => !selectableGroupKeys.includes(groupKey),
        );
      }

      const merged = new Set([...prev, ...selectableGroupKeys]);
      return Array.from(merged);
    });
  }, [allSelectableGroupsSelected, selectableGroupKeys]);

  const groupedRowKeysJson = JSON.stringify(
    groupedRows.map((g) => g.groupKey).sort(),
  );

  useEffect(() => {
    if (!openGroupKey) return;
    const groupedRowKeys = new Set<string>(JSON.parse(groupedRowKeysJson));
    if (!groupedRowKeys.has(openGroupKey)) {
      setOpenGroupKey(null);
      closeDropdown();
    }
  }, [openGroupKey, groupedRowKeysJson, closeDropdown]);

  useEffect(() => {
    const groupedRowKeys = new Set<string>(JSON.parse(groupedRowKeysJson));
    setSelectedGroupKeys((prev) => {
      const next = prev.filter((key) => groupedRowKeys.has(key));
      if (next.length === prev.length) return prev;
      return next;
    });
  }, [groupedRowKeysJson]);

  const handleGenerateSelectedBarcodes = useCallback(async () => {
    if (selectedGroupKeys.length === 0) {
      warningAlert("กรุณาเลือกสินค้าอย่างน้อย 1 กลุ่ม");
      return;
    }

    const selectedGroups = groupedRows.filter((group) =>
      selectedGroupKeys.includes(group.groupKey),
    );

    const candidateGroups = selectedGroups.filter((group) =>
      group.items.some((item) => !getItemBarcode(item) && !isIsoBarcode(item)),
    );

    if (candidateGroups.length === 0) {
      warningAlert("สินค้าที่เลือกมี Barcode ครบแล้ว");
      return;
    }

    const confirmResult = await confirmAlert(
      `สร้าง Barcode ${candidateGroups.length} กลุ่มสินค้า ใช่ไหม?`,
    );
    if (!confirmResult.isConfirmed) return;

    const failures: { code: string; reason: string }[] = [];
    let successGroupCount = 0;
    let successItemCount = 0;

    try {
      setIsGeneratingBarcodes(true);
      setLoading(true);

      for (const group of candidateGroups) {
        try {
          const targetItem =
            group.items.find(
              (item) => !getItemBarcode(item) && !isIsoBarcode(item),
            ) ?? group.items[0];

          const affectedItems = group.items.filter(
            (item) => !getItemBarcode(item) && !isIsoBarcode(item),
          );

          await ensureSharedBarcodeForGoodsInGroup(targetItem, group.items);

          successGroupCount += 1;
          successItemCount += affectedItems.length;
        } catch (err: any) {
          failures.push({
            code: group.code || group.name || group.groupKey,
            reason:
              err?.response?.data?.message || err?.message || "สร้างไม่สำเร็จ",
          });
        }
      }

      if (successGroupCount > 0) {
        await handleBarcodeSuccess();
      }

      setSelectedGroupKeys([]);

      if (failures.length === 0) {
        await successAlert(
          "สร้าง Barcode สำเร็จ",
          `${successGroupCount} กลุ่ม / ${successItemCount} รายการ`,
        );
        return;
      }

      await Swal.fire({
        icon: successGroupCount > 0 ? "warning" : "error",
        title:
          successGroupCount > 0
            ? "สร้าง Barcode บางส่วน"
            : "สร้าง Barcode ไม่สำเร็จ",
        html: `
        <div style="text-align:left;font-size:14px">
          <div>สำเร็จ ${successGroupCount} กลุ่ม</div>
          <div>สำเร็จ ${successItemCount} รายการ</div>
          <div>ไม่สำเร็จ ${failures.length} กลุ่ม</div>
          <div style="margin-top:8px">
            ${failures
              .slice(0, 10)
              .map((item) => `<div>- ${item.code}: ${item.reason}</div>`)
              .join("")}
          </div>
        </div>
      `,
        confirmButtonText: "OK",
      });
    } finally {
      setLoading(false);
      setIsGeneratingBarcodes(false);
    }
  }, [getItemBarcode, groupedRows, handleBarcodeSuccess, selectedGroupKeys]);

  const getItemUniquePrintKey = (item: GoodsInType) =>
    [
      String(item.id),
      String(item.product_id ?? "null"),
      String((item as any).lot_serial ?? ""),
      String(item.exp ?? ""),
    ].join("||");

  const getItemCopiesForPrint = (item: GoodsInType) =>
    Math.max(0, Math.floor(Number(item.qty ?? item.quantity_receive ?? 0)));

  const handlePrintSelectedBarcodes = useCallback(async () => {
    if (selectedGroupKeys.length === 0) {
      warningAlert("กรุณาเลือกสินค้าอย่างน้อย 1 กลุ่ม");
      return;
    }

    const selectedGroups = groupedRows.filter((group) =>
      selectedGroupKeys.includes(group.groupKey),
    );

    const printableMap = new Map<string, GoodsInType>();
    const skippedItems: GoodsInType[] = [];

    selectedGroups.forEach((group) => {
      group.items.forEach((item) => {
        const key = getItemUniquePrintKey(item);
        const hasBarcode = !!getItemBarcode(item);
        const copies = getItemCopiesForPrint(item);

        if (isIsoBarcode(item)) {
          skippedItems.push(item); // ISO barcode ไม่ต้อง print
          return;
        }

        if (!hasBarcode || copies <= 0) {
          skippedItems.push(item);
          return;
        }

        printableMap.set(key, item);
      });
    });

    // ตรวจสอบว่ามี item ที่ยังไม่มี barcode (ไม่ใช่ ISO)
    const missingBarcodeItems = skippedItems.filter(
      (item) => !isIsoBarcode(item) && !getItemBarcode(item),
    );

    if (missingBarcodeItems.length > 0) {
      const itemNames = missingBarcodeItems
        .map((item) => `<b>${item.code}</b> - ${item.name}`)
        .slice(0, 10);
      const moreText =
        missingBarcodeItems.length > 10
          ? `<br/>...และอีก ${missingBarcodeItems.length - 10} รายการ`
          : "";

      await Swal.fire({
        icon: "warning",
        title: "ไม่สามารถปริ้นได้",
        html: `ยังมีสินค้าที่ยังไม่ได้สร้าง Barcode:<br/><br/>${itemNames.join("<br/>")}${moreText}<br/><br/>กรุณาสร้าง Barcode ให้ครบก่อนปริ้น`,
        confirmButtonText: "รับทราบ",
      });
      return;
    }

    const printableItems = Array.from(printableMap.values()).sort((a, b) => {
      const codeCmp = norm(a.code).localeCompare(norm(b.code), "th", {
        numeric: true,
        sensitivity: "base",
      });
      if (codeCmp !== 0) return codeCmp;

      const lotA = String((a as any).lot_serial ?? a.lot ?? "");
      const lotB = String((b as any).lot_serial ?? b.lot ?? "");
      const lotCmp = lotA.localeCompare(lotB, "th", {
        numeric: true,
        sensitivity: "base",
      });
      if (lotCmp !== 0) return lotCmp;

      const expCmp = String(a.exp ?? "").localeCompare(
        String(b.exp ?? ""),
        "th",
        {
          numeric: true,
          sensitivity: "base",
        },
      );
      if (expCmp !== 0) return expCmp;

      return String(a.id).localeCompare(String(b.id), "th", {
        numeric: true,
        sensitivity: "base",
      });
    });

    if (printableItems.length === 0) {
      warningAlert("สินค้าที่เลือกเป็น Barcode ISO ");
      return;
    }

    const printJobs = printableItems.map((item) => ({
      item,
      copies: getItemCopiesForPrint(item),
    }));

    const totalCopies = printJobs.reduce((sum, job) => sum + job.copies, 0);

    const confirmResult = await confirmAlert(
      `พิมพ์ Barcode ${printableItems.length} รายการ รวม ${totalCopies} ใช่ไหม?`,
    );
    if (!confirmResult.isConfirmed) return;

    try {
      setIsPrintingBarcodes(true);

      const status = await printBarcodeLabels(printJobs);

      if (status === "cancelled") {
        return;
      }

      if (skippedItems.length === 0) {
        toast.success("พิมพ์ Barcode ที่เลือกเสร็จแล้ว");
        return;
      }

      await Swal.fire({
        icon: "info",
        title: "พิมพ์ Barcode เสร็จแล้ว",
        html: `
        <div style="text-align:left;font-size:14px">
          <div>พิมพ์สำเร็จ ${printableItems.length} รายการ</div>
          <div>ข้าม ${skippedItems.length} รายการ (ไม่มี Barcode หรือจำนวนพิมพ์เป็น 0)</div>
        </div>
      `,
        confirmButtonText: "OK",
      });
    } catch (err: any) {
      await Swal.fire({
        icon: "error",
        title: "พิมพ์ Barcode ไม่สำเร็จ",
        text: err?.message || "เกิดข้อผิดพลาดระหว่างพิมพ์",
        confirmButtonText: "OK",
      });
    } finally {
      setIsPrintingBarcodes(false);
    }
  }, [getItemBarcode, groupedRows, norm, selectedGroupKeys]);

  useEffect(() => {
    if (!no) return;

    const roomNo = `inbound:${no}`;
    socket.emit("join", roomNo);

    const onScanLocation = (payload: any) => {
      console.log("socket inbound:scan_location", payload);

      applyInboundPayload(payload, {
        syncLocalLocation: false,
        persistLocalLocation: false,
      });
    };

    const onScanBarcode = (payload: any) => {
      applyInboundPayload(payload, {
        syncLocalLocation: false,
        persistLocalLocation: false,
      });

      setTimeout(() => {
        if (confirmedLocation?.full_name) {
          scanBarcodeInputRef.current?.focus();
        }
      }, 0);
    };

    socket.on("inbound:scan_location", onScanLocation);
    socket.on("inbound:scan_barcode", onScanBarcode);

    return () => {
      socket.off("inbound:scan_location", onScanLocation);
      socket.off("inbound:scan_barcode", onScanBarcode);
      socket.emit("leave", roomNo);
    };
  }, [no, applyInboundPayload, confirmedLocation?.full_name]);

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
          const resp = await inboundApi.getAllPaginated({
            page,
            limit,
            ...(navStatus ? { status: navStatus } : {}),
          });

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
        console.error("Error fetching inbound detail list:", error);
        setDetailList([]);
      }
    };

    fetchDetailList();
  }, [navStatus, stateDetailList, stateDetailTotal]);

  //logic navigator
  const currentIndex =
    detailList.findIndex((x) => String(x.no) === String(no)) + 1;

  const total = detailList.length;

  const handlePrev = useCallback(() => {
    const idx = detailList.findIndex((x) => String(x.no) === String(no));
    if (idx <= 0) return;

    const prevItem = detailList[idx - 1];
    navigate(`/inbound/${encodeURIComponent(prevItem.no)}`, {
      state: { status: navStatus },
    });
  }, [detailList, no, navigate, navStatus]);

  const handleNext = useCallback(() => {
    const idx = detailList.findIndex((x) => String(x.no) === String(no));
    if (idx < 0 || idx >= detailList.length - 1) return;

    const nextItem = detailList[idx + 1];
    navigate(`/inbound/${encodeURIComponent(nextItem.no)}`, {
      state: { status: navStatus },
    });
  }, [detailList, no, navigate, navStatus]);

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
      <div className="inbound-detail-header detail-header-with-nav">
        <h1 className="inbound-detail-title">{inboundItem.no || "GR"}</h1>

        <DetailNavigator
          currentIndex={currentIndex}
          total={total}
          onPrev={handlePrev}
          onNext={handleNext}
          disablePrev={currentIndex <= 1}
          disableNext={currentIndex >= total}
        />
      </div>

      <div className="inbound-detail-main-layout">
        <div className="inbound-meta-panel">
          <div className="inbound-info-row">
            <div className="inbound-info-item">
              <label>Department :</label>
              <span>{inboundItem.department || "data"}</span>
            </div>

            <div className="inbound-info-item">
              <label>PO No. :</label>
              <span>{inboundItem.origin || "data"}</span>
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
          </div>
        </div>

        {!isAllDoneReal && (
          <div className="inbound-scan-sticky-wrap">
            <div className="inbound-scan-panel">
              <div className="inbound-scan-row">
                <label>Scan Location :</label>

                <input
                  ref={scanLocationInputRef}
                  type="text"
                  className="inbound-scan-input"
                  value={scanLocation}
                  onChange={(e) => setScanLocation(e.target.value)}
                  onKeyDown={handleScanLocationKeyDown}
                  placeholder="Scan Location"
                  disabled={!isLocationScanOpen}
                  style={{
                    borderColor: confirmedLocation ? "#4CAF50" : undefined,
                    opacity: isLocationScanOpen ? 1 : 0.6,
                  }}
                />

                <button
                  type="button"
                  className={`inboundById-btn-scan-toggle ${
                    isLocationScanOpen ? "active" : ""
                  }`}
                  onClick={toggleLocationScan}
                >
                  {isLocationScanOpen ? (
                    <i className="fa-solid fa-xmark"></i>
                  ) : (
                    <i className="fa-solid fa-qrcode"></i>
                  )}
                </button>
              </div>

              <div className="inbound-scan-row">
                <label>Scan Barcode/Serial :</label>

                <input
                  ref={scanBarcodeInputRef}
                  type="text"
                  className="inbound-scan-input"
                  onKeyDown={handleScanBarcodeKeyDown}
                  placeholder="Scan Barcode/Serial"
                />
                <div className="inbound-scan-spacer" />
              </div>
            </div>
          </div>
        )}

        <div className="inbound-search-section">
          <hr className="inbound-detail-divider" />

          <div className="inbound-search-bar">
            <div className="inbound-search-left">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  flexWrap: "wrap",
                  marginBottom: "8px",
                }}
              >
                <div className="inbound-view-tabs">
                  {pendingCount > 0 && (
                    <button
                      type="button"
                      className={`inbound-tab ${
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
                      className={`inbound-tab ${
                        viewMode === "done" ? "active" : ""
                      } inbound-tab-done`}
                      onClick={() => setViewMode("done")}
                    >
                      ดำเนินการเสร็จสิ้นแล้ว{" "}
                      <span className="badge">{doneGroupCount}</span>
                    </button>
                  )}
                </div>
              </div>

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

            <div className="inbound-search-right">
              <div className="inbound-search-row">
                <div className="inbound-search-controls">
                  <button
                    type="button"
                    className="inbound-batch-generate-btn secondary"
                    onClick={toggleAllGroupSelections}
                    disabled={
                      isGeneratingBarcodes ||
                      isPrintingBarcodes ||
                      selectableGroupKeys.length === 0
                    }
                  >
                    {allSelectableGroupsSelected
                      ? "Clear Selected"
                      : "Select All Missing"}
                  </button>

                  <button
                    type="button"
                    className="inbound-batch-generate-btn secondary"
                    onClick={handlePrintSelectedBarcodes}
                    disabled={
                      isGeneratingBarcodes ||
                      isPrintingBarcodes ||
                      selectedGroupKeys.length === 0
                    }
                  >
                    {isPrintingBarcodes
                      ? "Printing..."
                      : `Print Selected (${selectedGroupKeys.length})`}
                  </button>

                  <button
                    type="button"
                    className="inbound-batch-generate-btn"
                    onClick={handleGenerateSelectedBarcodes}
                    disabled={
                      isGeneratingBarcodes ||
                      isPrintingBarcodes ||
                      selectedGroupKeys.length === 0
                    }
                  >
                    {isGeneratingBarcodes
                      ? "Generating..."
                      : `Gen Selected (${selectedGroupKeys.length})`}
                  </button>

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

        <div className="table__wrapper inbound-table-section">
          <Table headers={groupTableHeaders as any}>
            {groupedRows.length === 0 ? (
              <tr>
                <td colSpan={groupTableHeaders.length} className="no-data">
                  No items found.
                </td>
              </tr>
            ) : (
              groupedRows.map((group, index) => {
                const groupTotalQty = group.items.reduce(
                  (sum, row) => sum + getQtyReceive(row),
                  0,
                );
                const groupTotalCount = group.items.reduce(
                  (sum, row) => sum + getEffectiveCount(row),
                  0,
                );
                const groupTempMismatch =
                  !!activeLocKey &&
                  group.items.some(
                    (item) => !isTempAllowedForItemAtLoc(item, activeLocKey),
                  );

                return (
                  <tr
                    key={group.groupKey || index}
                    className={groupTempMismatch ? "row-temp-mismatch" : ""}
                  >
                    <td>{index + 1}</td>

                    <td style={{ minWidth: "200px" }}>
                      <label className="inbound-group-select-cell">
                        <input
                          type="checkbox"
                          className="inbound-group-checkbox"
                          checked={selectedGroupKeys.includes(group.groupKey)}
                          onChange={() => toggleGroupSelection(group.groupKey)}
                          disabled={isPrintingBarcodes || isGeneratingBarcodes}
                        />
                        <span>{group.code || "--"}</span>
                      </label>
                    </td>

                    <td style={{ minWidth: "200px" }}>{group.name || "--"}</td>
                    <td>{group.unit || "--"}</td>
                    <td>{group.zone_type || "--"}</td>
                    <td style={{ fontWeight: 700 }}>{groupTotalQty}</td>
                    <td style={{ fontWeight: 700 }}>{groupTotalCount}</td>

                    <td>
                      <button
                        type="button"
                        className="btn-dropdown-toggle"
                        onClick={() => setOpenGroupKey(group.groupKey)}
                        title="ดูรายการสินค้าในกลุ่ม"
                      >
                        <i className="fa-solid fa-bars"></i>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </Table>
        </div>
      </div>

      <Modal
        isOpen={!!selectedGroup}
        onClose={closeGroupModal}
        title="รายการสินค้าในกลุ่ม"
        width={1100}
      >
        {selectedGroup ? (
          <>
            <div className="inbound-group-modal-meta">
              <div>
                สินค้า: <b>{selectedGroup.code || "--"}</b>
              </div>
              <div>
                ชื่อ: <b>{selectedGroup.name || "--"}</b>
              </div>
              <div>
                หน่วย: <b>{selectedGroup.unit || "--"}</b>
              </div>
              <div>
                จำนวนรายการย่อย: <b>{selectedGroup.items.length}</b>
              </div>
            </div>

            <div className="table__wrapper inbound-group-table-wrapper">
              <Table headers={groupedItemHeaders as any}>
                {selectedGroup.items.map((item, index) => {
                  const itemId = String(item.id);
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

                      <td>
                        {(item as any).lot_serial || item.lot ? (
                          (item as any).lot_serial || item.lot
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
                              const backendCount = Number(
                                item.quantity_count ?? 0,
                              );
                              const localTotal = getTotalCount(itemId);
                              const totalCount = Math.max(
                                backendCount,
                                localTotal,
                              );

                              const rawConfirms: any[] = Array.isArray(
                                (item as any).goods_in_location_confirms,
                              )
                                ? (item as any).goods_in_location_confirms
                                : Array.isArray((item as any).location_confirms)
                                  ? (item as any).location_confirms
                                  : [];

                              const confirmBreakdown =
                                locBreakdown.length > 0
                                  ? locBreakdown
                                  : rawConfirms
                                      .filter(
                                        (c: any) =>
                                          Number(c?.confirmed_qty ?? 0) > 0,
                                      )
                                      .map((c: any) => ({
                                        loc: String(
                                          c?.location?.full_name ??
                                            c?.location_name ??
                                            "",
                                        ),
                                        qty: Number(c?.confirmed_qty ?? 0),
                                      }))
                                      .filter((x: any) => x.loc);

                              return (
                                <>
                                  <div style={{ fontWeight: 700 }}>
                                    {totalCount}
                                  </div>

                                  {confirmBreakdown.length > 0 && (
                                    <div
                                      style={{
                                        marginTop: 4,
                                        fontSize: 12,
                                        opacity: 0.75,
                                      }}
                                    >
                                      {confirmBreakdown.map((x: any) => (
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
                                  style={{
                                    top: menuPos.top,
                                    left: menuPos.left,
                                  }}
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
                })}
              </Table>
            </div>
          </>
        ) : null}
      </Modal>

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
        groupItems={
          selectedGoodsIn
            ? getGroupItemsByItemId(String(selectedGoodsIn.id))
            : []
        }
        onSuccess={handleBarcodeSuccess}
        onCreated={handleBarcodeCreated}
      />

      <div
        className="inbound-detail-footer"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <button
            type="button"
            className="inbound-batch-generate-btn secondary"
            onClick={openChangeLocationPrintPopup}
          >
            Print ChangeLocation 4×4
          </button>
        </div>

        <div style={{ display: "flex", gap: "12px" }}>
          <button
            className="inbound-btn-cancel"
            onClick={() =>
              navigate("/inbound", { state: { status: navStatus } })
            }
            disabled={isConfirming}
          >
            ย้อนกลับ
          </button>

          {!isCompletedStatus && (
            <button
              className="inbound-btn-confirm"
              onClick={handleConfirm}
              disabled={isConfirming}
            >
              {isConfirming ? "กำลังยืนยัน..." : "ยืนยัน"}
            </button>
          )}
        </div>
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
        onClear={handleClearForLoc}
        onUndo={handleUndoForLoc}
      />
    </div>
  );
};

export default InboundById;
