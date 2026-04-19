import React, { useRef, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Swal from "sweetalert2";
import { packProductApi } from "../../services/outbound.api";
import type {
  InvoiceData,
  GoodsOutItem,
  BatchItem,
  OutboundDetail,
  PackProductHeader,
  PackProductBox,
} from "../../types/outbound.type";
import {
  confirmAlert,
  successAlert,
  warningAlert,
} from "../../../../utils/alert";
import "./scanbox.css";
import { createPortal } from "react-dom";
import { toast } from "react-toastify";

type ViewMode = "pending" | "done";

const getUserRef = () => {
  const first = (localStorage.getItem("first_name") || "").trim();
  const last = (localStorage.getItem("last_name") || "").trim();
  return `${first} ${last}`.trim();
};

// ===== Rules เหมือน inboundById =====
const LOT_NULL_TOKEN = "XXXXXX";
const EXP_NULL_TOKEN = "999999";

// exp ในระบบ -> YYMMDD (6)
const expToYyMmDd6 = (d: unknown) => {
  if (!d) return "";
  const dt = new Date(d as any);
  if (Number.isNaN(dt.getTime())) return "";
  const yy = String(dt.getFullYear()).slice(-2);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
};

// token: ใช้เทียบ lot_serial แบบมีตัวอักษร
const tokenOnly = (v: unknown) =>
  (v ?? "")
    .toString()
    .toUpperCase()
    .replace(/\s|\r|\n|\t/g, "")
    .trim();

// ดึง exp6 = 6 ตัวท้าย (ต้องเป็น digit 6 ตัว)
const extractExp6Tail = (scanRaw: string) => {
  const s = tokenOnly(scanRaw);
  const exp6 = s.slice(-6);
  return /^\d{6}$/.test(exp6) ? exp6 : "";
};

// ดึง lot จาก "barcode_text + lot + exp6ท้าย"
// ถ้า lot ว่าง -> คืน XXXXXX
const extractLotByBarcodeTextTailExp = (
  scanRaw: string,
  barcodeText: string,
) => {
  const s = tokenOnly(scanRaw);
  const bt = tokenOnly(barcodeText);
  if (!s || !bt) return "";

  const exp6 = extractExp6Tail(s);
  if (!exp6) return "";

  const pos = s.indexOf(bt);
  if (pos < 0) return "";

  const startAt = pos + bt.length;
  const endAt = s.length - 6;
  if (startAt > endAt) return "";

  const lot = s.slice(startAt, endAt).trim();
  return lot || LOT_NULL_TOKEN;
};

type BatchItemExt = BatchItem & {
  lot_serial?: string | null;
  lot_id?: number | null;
  status?: string;
  box_name?: string;
  boxId?: string;
};

const getItemLotRule = (it: BatchItemExt) => {
  const lot = tokenOnly(it?.lot_serial ?? "");
  return lot || LOT_NULL_TOKEN;
};

const getItemExpRule = (it: BatchItemExt) => {
  if (it?.exp == null) return EXP_NULL_TOKEN;
  const exp6 = expToYyMmDd6(it.exp);
  return exp6 || EXP_NULL_TOKEN;
};

// STRICT: barcode_text + lot + exp match
function pickItemIndexByScan(scanRaw: string, batchItems: BatchItemExt[]) {
  const raw = tokenOnly(scanRaw);
  if (!raw) return { ok: false as const, reason: "EMPTY" as const };

  const expFromScan = extractExp6Tail(raw);
  if (!expFromScan) return { ok: false as const, reason: "NO_EXP" as const };

  const candidates = batchItems
    .map((it, index) => ({ it, index }))
    .filter(({ it }) => {
      const bt = tokenOnly((it as any).barcode_text ?? "");
      return bt ? raw.includes(bt) : false;
    });

  if (candidates.length === 0) {
    return { ok: false as const, reason: "NO_MATCH" as const };
  }

  const strictMatched = candidates.filter(({ it }) => {
    const bt = (it as any).barcode_text ?? "";
    const lotFromScan = extractLotByBarcodeTextTailExp(raw, bt);

    const lotRule = getItemLotRule(it);
    const expRule = getItemExpRule(it);

    return lotFromScan === lotRule && expFromScan === expRule;
  });

  if (strictMatched.length === 1) {
    return {
      ok: true as const,
      index: strictMatched[0].index,
      reason: "OK_STRICT" as const,
    };
  }

  if (strictMatched.length === 0) {
    return { ok: false as const, reason: "LOT_OR_EXP_MISMATCH" as const };
  }

  return { ok: false as const, reason: "AMBIGUOUS" as const };
}

const ScanBox = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isReadOnly = searchParams.get("readonly") === "1";

  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const actionLoading = isSaving || isSubmitting;

  const [isLoading, setIsLoading] = useState(false);

  // ===== Step 1: Scan Doc =====
  const [isScanActive, setIsScanActive] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const [invoiceList, setInvoiceList] = useState<InvoiceData[]>([]);
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(
    new Set(),
  );

  const [batchItems, setBatchItems] = useState<BatchItemExt[]>([]);

  // ===== Step 2: Open/Close Box + Item =====
  const [currentBox, setCurrentBox] = useState<{
    id: number;
    box_code: string;
    box_name: string;
  } | null>(null);

  const [boxOpenScanInput, setBoxOpenScanInput] = useState("");
  const [itemScanInput, setItemScanInput] = useState("");

  const [packHistory, setPackHistory] = useState<
    { itemIndex: number; boxCode: string; boxName: string }[]
  >([]);

  const [boxContents, setBoxContents] = useState<
    Map<string, { boxId: number; items: Map<number, number> }>
  >(new Map());

  const [isBoxClosed, setIsBoxClosed] = useState(true);

  const [isStep2Collapsed, setIsStep2Collapsed] = useState(false);

  const [isOpenBoxScanActive, setIsOpenBoxScanActive] = useState(false);

  const boxOpenScanRef = useRef<HTMLInputElement>(null);
  const itemScanRef = useRef<HTMLInputElement>(null);

  const [currentTimestamp, setCurrentTimestamp] = useState<string>("");

  const [packProduct, setPackProduct] = useState<PackProductHeader | null>(
    null,
  );
  const [packBoxes, setPackBoxes] = useState<PackProductBox[]>([]);
  const [currentPackBoxId, setCurrentPackBoxId] = useState<number | null>(null);
  const [currentPrefix, setCurrentPrefix] = useState<string>("");

  const [viewMode, setViewMode] = useState<ViewMode>(
    isReadOnly ? "done" : "pending",
  );

  const hasLoadedRef = useRef(false);

  // ===== Action popup =====
  type MenuPos = { top: number; left: number };

  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<Record<string, HTMLButtonElement | null>>({});

  const MENU_WIDTH = 190;
  const MENU_HEIGHT = 120;
  const GAP = 8;

  // ===== Inline edit pack =====
  const [editingPackRowId, setEditingPackRowId] = useState<string | null>(null);
  const [editPackValue, setEditPackValue] = useState<string>("");
  const editPackInputRef = useRef<Record<string, HTMLInputElement | null>>({});

  const rebuildBatchItemsFromPackOutbounds = (outbounds: any[]) => {
    const items: BatchItemExt[] = [];

    outbounds.forEach((outbound: any) => {
      (outbound.items || []).forEach((item: GoodsOutItem) => {
        const boxNameDisplay =
          item.boxes && Array.isArray(item.boxes) && item.boxes.length > 0
            ? item.boxes
                .map((b) => b.box?.box_name ?? (b as any).box_name)
                .filter(Boolean)
                .join(", ")
            : undefined;

        items.push({
          invoice_item_id: Number(item.id),
          outbound_no: String(outbound.no),
          product_id: Number(item.product_id) || undefined,
          goods_out_id: String(item.id),
          code: String(item.code ?? ""),
          name: String(item.name ?? ""),
          lock_no: item.lock_no,
          lock_name: item.lock_name,
          lot_id: item.lot_id,
          lot_serial: (item as any).lot_serial ?? null,
          lot_no: (item as any).lot_serial || "",
          lot_name: (item as any).lot_serial || "",
          quantity: item.qty,
          pick: item.pick,
          pack: item.pack || 0,
          exp: item.exp || null,
          status: item.status,
          batchId:
            item.outbound_id !== undefined
              ? String(item.outbound_id)
              : undefined,
          boxId:
            (item as any).box_id !== undefined
              ? String((item as any).box_id)
              : undefined,
          box_name: boxNameDisplay,
          barcode: String(item.barcode?.barcode ?? item.code ?? ""),
          barcode_text: String((item as any).barcode_text ?? item.code ?? ""),
          sku: String(item.code ?? ""),
          input_number: Boolean((item as any).input_number),
        });
      });
    });

    setBatchItems(items);
  };

  const getRowIdByIndex = (itemIndex: number) => String(itemIndex);
  const isInputNumber = (it: BatchItemExt) =>
    Boolean((it as any)?.input_number);

  const getPackedInBoxes = (
    contents: Map<string, { boxId: number; items: Map<number, number> }>,
    itemIndex: number,
  ) => {
    let sum = 0;
    contents.forEach((boxData) => {
      sum += Number(boxData.items.get(itemIndex) || 0);
    });
    return sum;
  };

  useEffect(() => {
    const now = new Date();
    const formattedDate = `${String(now.getDate()).padStart(2, "0")}/${String(
      now.getMonth() + 1,
    ).padStart(2, "0")}/${now.getFullYear() + 543}, ${String(
      now.getHours(),
    ).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(
      now.getSeconds(),
    ).padStart(2, "0")}`;
    setCurrentTimestamp(formattedDate);
  }, []);

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    const outboundNo = searchParams.get("outbound");
    const itemId = searchParams.get("item");

    if (!outboundNo) return;

    if (itemId) {
      loadExistingData(outboundNo, itemId);
    } else {
      loadExistingOutbound(outboundNo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isScanActive && inputRef.current) inputRef.current.focus();
  }, [isScanActive]);

  useEffect(() => {
    if (isOpenBoxScanActive && boxOpenScanRef.current) {
      boxOpenScanRef.current.focus();
    }
  }, [isOpenBoxScanActive]);

  const resetPackingState = () => {
    setPackHistory([]);
    setBoxContents(new Map());
    setCurrentBox(null);
    setIsBoxClosed(true);
    setBoxOpenScanInput("");
    setItemScanInput("");
    setIsOpenBoxScanActive(false);
  };

  const closeDropdown = () => {
    setOpenDropdownId(null);
    setMenuPos(null);
  };

  const computeAndOpenDropdown = (rowId: string) => {
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
  };

  const toggleDropdown = (rowId: string) => {
    if (openDropdownId === rowId) return closeDropdown();
    computeAndOpenDropdown(rowId);
  };

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
  }, [openDropdownId]);

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
  }, [openDropdownId]);

  useEffect(() => {
    const currentIds = new Set(
      batchItems.map((_, idx) => getRowIdByIndex(idx)),
    );
    Object.keys(buttonRef.current).forEach((id) => {
      if (!currentIds.has(id)) delete buttonRef.current[id];
    });
  }, [batchItems]);

  const getDocNo = (inv: any): string => {
    const candidates = [inv?.no, inv?.origin, inv?.origin?.no];

    for (const value of candidates) {
      if (value !== null && value !== undefined) {
        const text = String(value).trim();
        if (text !== "") return text;
      }
    }

    return "-";
  };

  const rebuildBatchItems = (
    selected: Set<string>,
    invoices: InvoiceData[] = invoiceList,
  ) => {
    const selectedInvs = invoices.filter((inv) => selected.has(inv.no));
    const items: BatchItemExt[] = [];

    selectedInvs.forEach((invoice) => {
      invoice.items.forEach((item: GoodsOutItem) => {
        let boxNameDisplay: string | undefined = undefined;
        if (item.boxes && Array.isArray(item.boxes) && item.boxes.length > 0) {
          boxNameDisplay = item.boxes
            .map((b) => b.box?.box_name ?? (b as any).box_name)
            .filter(Boolean)
            .join(", ");
        }

        items.push({
          invoice_item_id: Number(item.id),
          outbound_no: String(invoice.no),
          product_id: Number(item.product_id) || undefined,
          goods_out_id: String(item.id),
          code: String(item.code ?? ""),
          name: String(item.name ?? ""),
          lock_no: item.lock_no,
          lock_name: item.lock_name,
          lot_id: item.lot_id,
          lot_serial: (item as any).lot_serial ?? null,
          lot_no: (item as any).lot_serial || "",
          lot_name: (item as any).lot_serial || "",
          quantity: item.qty,
          pick: item.pick,
          pack: item.pack || 0,
          exp: item.exp || null,
          status: item.status,
          batchId:
            item.outbound_id !== undefined
              ? String(item.outbound_id)
              : undefined,
          boxId:
            (item as any).box_id !== undefined
              ? String((item as any).box_id)
              : undefined,
          box_name: boxNameDisplay,
          barcode: String(item.barcode?.barcode ?? item.code ?? ""),
          barcode_text: String((item as any).barcode_text ?? item.code ?? ""),
          sku: String(item.code ?? ""),
        });
      });
    });

    setBatchItems(items);
  };

  const calcBoxNameStr = (
    contents: Map<string, { boxId: number; items: Map<number, number> }>,
    itemIndex: number,
  ) => {
    const boxesUsed = new Set<string>();
    contents.forEach((boxData, boxCode) => {
      const q = boxData.items.get(itemIndex) || 0;
      if (q > 0) boxesUsed.add(boxCode);
    });
    return Array.from(boxesUsed).sort().join(", ") || undefined;
  };

  const loadExistingData = async (outboundNo: string, itemId: string) => {
    setIsLoading(true);
    try {
      const response = await goodsoutApi.getOutboundItem(
        outboundNo,
        Number(itemId),
      );
      const itemData: GoodsOutItem = response.data;

      const mockInvoice: InvoiceData = {
        no: outboundNo,
        invoice: (itemData as any).invoice || "",
        origin: (itemData as any).origin || "",
        outbound_barcode: outboundNo,
        out_type: (itemData as any).out_type || "sale",
        items: [itemData],
        created_at: itemData.created_at || new Date().toISOString(),
        updated_at: itemData.updated_at || null,
        deleted_at: null,
      };

      setInvoiceList([mockInvoice]);
      setSelectedInvoices(new Set([outboundNo]));

      const boxNameDisplay =
        itemData.boxes && itemData.boxes.length > 0
          ? itemData.boxes
              .map((box) => box.box?.box_name ?? (box as any).box_name)
              .filter(Boolean)
              .join(", ")
          : undefined;

      const batchItem: BatchItemExt = {
        invoice_item_id: Number(itemData.id),
        outbound_no: String(outboundNo),
        product_id: Number(itemData.product_id) || undefined,
        goods_out_id: String(itemData.id),
        code: String(itemData.code ?? ""),
        name: String(itemData.name ?? ""),
        lock_no: itemData.lock_no,
        lock_name: itemData.lock_name,
        lot_id: itemData.lot_id,
        lot_serial: (itemData as any).lot_serial ?? null,
        lot_no: (itemData as any).lot_serial || "",
        lot_name: (itemData as any).lot_serial || "",
        quantity: itemData.qty,
        pick: itemData.pick,
        pack: itemData.pack || 0,
        exp: itemData.exp || null,
        status: itemData.status,
        batchId:
          itemData.outbound_id !== undefined
            ? String(itemData.outbound_id)
            : undefined,
        boxId:
          (itemData as any).box_id !== undefined
            ? String((itemData as any).box_id)
            : undefined,
        box_name: boxNameDisplay,
        barcode: String(itemData.barcode?.barcode ?? itemData.code ?? ""),
        barcode_text: String(
          (itemData as any).barcode_text ?? itemData.code ?? "",
        ),
        sku: String(itemData.code ?? ""),
      };

      setBatchItems([batchItem]);

      if (itemData.boxes && itemData.boxes.length > 0) {
        const newBoxContents = new Map<
          string,
          { boxId: number; items: Map<number, number> }
        >();
        itemData.boxes.forEach((box) => {
          const boxCode =
            box.box?.box_code ??
            (box as any).box_code ??
            (box as any).box_name ??
            String(box.id ?? "");
          if (!newBoxContents.has(boxCode)) {
            newBoxContents.set(boxCode, {
              boxId: box.id ?? 0,
              items: new Map(),
            });
          }
          const boxData = newBoxContents.get(boxCode)!;
          boxData.items.set(0, box.quantity ?? 0);
        });
        setBoxContents(newBoxContents);
      }

      toast.success(`โหลดข้อมูลสำเร็จ: ${itemData.name} (${outboundNo})`, {
        position: "top-right",
        autoClose: 2000,
      });
    } catch (error: any) {
      toast.error(
        `ไม่สามารถโหลดข้อมูลได้: ${error?.response?.data?.message || "กรุณาลองใหม่อีกครั้ง"}`,
        {
          position: "top-right",
          autoClose: 3000,
        },
      );
      navigate("/outbound");
    } finally {
      setIsLoading(false);
    }
  };

  const loadExistingOutbound = async (outboundNo: string) => {
    setIsLoading(true);
    try {
      const response = await getInvoiceByBarcode(outboundNo);
      const outboundData: OutboundDetail = response;

      const items: GoodsOutItem[] = Array.isArray(outboundData?.items)
        ? outboundData.items
        : [];

      if (items.length === 0) {
        Swal.fire({
          icon: "warning",
          title: "ไม่พบรายการสินค้า",
          text: `เอกสาร ${outboundNo} ไม่มีรายการสำหรับ Packing`,
        });
        navigate("/outbound");
        return;
      }

      const mockInvoice: InvoiceData = {
        no: String(outboundData?.no ?? outboundNo),
        invoice: String(outboundData?.invoice ?? ""),
        origin: String(outboundData?.origin ?? ""),
        outbound_barcode: String(outboundData?.outbound_barcode ?? outboundNo),
        out_type: outboundData?.out_type || "sale",
        items,
        created_at: outboundData?.created_at || new Date().toISOString(),
        updated_at: outboundData?.updated_at || null,
        deleted_at: outboundData?.deleted_at || null,
      };

      setInvoiceList([mockInvoice]);
      setSelectedInvoices(new Set([mockInvoice.no]));

      const rebuiltItems: BatchItemExt[] = items.map((item) => {
        const boxNameDisplay =
          item.boxes && Array.isArray(item.boxes) && item.boxes.length > 0
            ? item.boxes
                .map((b) => b.box?.box_name ?? (b as any).box_name)
                .filter(Boolean)
                .join(", ")
            : undefined;

        return {
          invoice_item_id: Number(item.id),
          outbound_no: String(outboundData?.no ?? outboundNo),
          product_id: Number(item.product_id) || undefined,
          goods_out_id: String(item.id),
          code: String(item.code ?? ""),
          name: String(item.name ?? ""),
          lock_no: item.lock_no,
          lock_name: item.lock_name,
          lot_id: item.lot_id,
          lot_serial: (item as any).lot_serial ?? null,
          lot_no: (item as any).lot_serial || "",
          lot_name: (item as any).lot_serial || "",
          quantity: item.qty,
          pick: item.pick,
          pack: item.pack || 0,
          exp: item.exp || null,
          status: item.status,
          batchId:
            item.outbound_id !== undefined
              ? String(item.outbound_id)
              : undefined,
          boxId:
            (item as any).box_id !== undefined
              ? String((item as any).box_id)
              : undefined,
          box_name: boxNameDisplay,
          barcode: String(item.barcode?.barcode ?? item.code ?? ""),
          barcode_text: String((item as any).barcode_text ?? item.code ?? ""),
          sku: String(item.code ?? ""),
        };
      });

      setBatchItems(rebuiltItems);

      const newBoxContents = new Map<
        string,
        { boxId: number; items: Map<number, number> }
      >();

      rebuiltItems.forEach((_, itemIndex) => {
        const item = items[itemIndex];
        if (!item?.boxes || !Array.isArray(item.boxes)) return;

        item.boxes.forEach((box) => {
          const boxCode =
            box.box?.box_code ??
            (box as any).box_code ??
            (box as any).box_name ??
            String(box.id ?? "");
          const boxId = Number(box.id ?? box.box?.id ?? 0);
          const qty = Number(box.quantity ?? 0);

          if (!boxCode || qty <= 0) return;

          if (!newBoxContents.has(boxCode)) {
            newBoxContents.set(boxCode, {
              boxId,
              items: new Map(),
            });
          }

          const boxData = newBoxContents.get(boxCode)!;
          boxData.items.set(itemIndex, qty);
        });
      });

      setBoxContents(newBoxContents);

      toast.success(
        `โหลดข้อมูลสำเร็จ: เอกสาร ${outboundNo} พร้อม ${items.length} รายการ`,
        {
          position: "top-right",
          autoClose: 2000,
        },
      );
    } catch (error: any) {
      Swal.fire({
        icon: "error",
        title: "ไม่สามารถโหลดข้อมูลได้",
        text: error?.response?.data?.message || "กรุณาลองใหม่อีกครั้ง",
      });
      toast.error(
        `ไม่สามารถโหลดข้อมูลได้: ${error?.response?.data?.message || "กรุณาลองใหม่อีกครั้ง"}`,
        {
          position: "top-right",
          autoClose: 3000,
        },
      );
      navigate("/outbound");
    } finally {
      setIsLoading(false);
    }
  };

  const isDone = (it: BatchItemExt) =>
    (it.pack || 0) > 0 && (it.pack || 0) === (it.quantity || 0);
  const pendingCount = batchItems.filter((it) => !isDone(it)).length;
  const doneCount = batchItems.filter((it) => isDone(it)).length;

  const visibleItems = batchItems
    .map((item, originalIndex) => ({ item, originalIndex }))
    .filter(({ item }) => (viewMode === "done" ? isDone(item) : !isDone(item)));

  const toggleScanMode = () => setIsScanActive(!isScanActive);

  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;

    const scannedBarcode = barcodeInput.trim();

    try {
      const res = await packProductApi.scan(
        scannedBarcode,
        getUserRef() || undefined,
      );
      const data = res.data.data;

      setPackProduct(data.pack_product);
      setPackBoxes(data.boxes || []);
      setCurrentPrefix(data.parsed.prefix);

      const currentBox = data.current_box;
      if (currentBox && currentBox.status === "open") {
        setCurrentBox({
          id: Number(currentBox.id),
          box_code: String(currentBox.box_code),
          box_name: String(currentBox.box_label || currentBox.box_code),
        });
        setCurrentPackBoxId(Number(currentBox.id));
        setIsBoxClosed(false);
        setIsOpenBoxScanActive(false);

        setTimeout(() => itemScanRef.current?.focus(), 100);
      } else {
        setCurrentBox(null);
        setCurrentPackBoxId(null);
        setIsBoxClosed(true);
      }

      const packInvoices: InvoiceData[] = (data.outbounds || []).map(
        (outbound: any) => ({
          no: String(outbound.no),
          invoice: String(outbound.invoice ?? ""),
          origin: String(outbound.origin ?? ""),
          outbound_barcode: String(outbound.no ?? ""),
          out_type: outbound.out_type || "sale",
          items: Array.isArray(outbound.items) ? outbound.items : [],
          created_at: new Date().toISOString(),
          updated_at: null,
          deleted_at: null,
        }),
      );

      setInvoiceList(packInvoices);
      setSelectedInvoices(new Set(packInvoices.map((x) => x.no)));
      rebuildBatchItemsFromPackOutbounds(data.outbounds || []);

      Swal.fire({
        icon: "success",
        title: "สำเร็จ",
        text:
          data.box_action === "closed"
            ? `ปิดกล่อง ${data.current_box?.box_label ?? ""}`
            : `เปิดงาน ${data.pack_product.name} กล่อง ${data.current_box?.box_label ?? ""}`,
        timer: 1200,
        showConfirmButton: false,
      });

      setBarcodeInput("");
      setIsScanActive(false);
    } catch (error: any) {
      Swal.fire({
        icon: "error",
        title: "ไม่พบเอกสาร",
        text: error?.response?.data?.message || "Barcode ไม่ถูกต้อง",
      });
    }
  };

  const handleCheckboxChange = (invoiceNo: string) => {
    const newSelected = new Set(selectedInvoices);
    if (newSelected.has(invoiceNo)) newSelected.delete(invoiceNo);
    else newSelected.add(invoiceNo);

    setSelectedInvoices(newSelected);
    resetPackingState();
    rebuildBatchItems(newSelected);
  };

  const handleOpenBoxScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const scannedBoxCode = boxOpenScanInput.trim();
    if (!scannedBoxCode) return;

    try {
      const res = await packProductApi.scan(
        scannedBoxCode,
        getUserRef() || undefined,
      );
      const data = res.data.data;

      setPackProduct(data.pack_product);
      setPackBoxes(data.boxes || []);
      setCurrentPrefix(data.parsed.prefix);

      const currentBox = data.current_box;
      if (currentBox && currentBox.status === "open") {
        setCurrentBox({
          id: Number(currentBox.id),
          box_code: String(currentBox.box_code),
          box_name: String(currentBox.box_label || currentBox.box_code),
        });
        setCurrentPackBoxId(Number(currentBox.id));
        setIsBoxClosed(false);
        setIsOpenBoxScanActive(false);
        setTimeout(() => itemScanRef.current?.focus(), 100);
      } else {
        setCurrentBox(null);
        setCurrentPackBoxId(null);
        setIsBoxClosed(true);
        setIsOpenBoxScanActive(true);
        setTimeout(() => boxOpenScanRef.current?.focus(), 100);
      }

      const packInvoices: InvoiceData[] = (data.outbounds || []).map(
        (outbound: any) => ({
          no: String(outbound.no),
          invoice: String(outbound.invoice ?? ""),
          origin: String(outbound.origin ?? ""),
          outbound_barcode: String(outbound.no ?? ""),
          out_type: outbound.out_type || "sale",
          items: Array.isArray(outbound.items) ? outbound.items : [],
          created_at: new Date().toISOString(),
          updated_at: null,
          deleted_at: null,
        }),
      );

      setInvoiceList(packInvoices);
      setSelectedInvoices(new Set(packInvoices.map((x) => x.no)));
      rebuildBatchItemsFromPackOutbounds(data.outbounds || []);

      Swal.fire({
        icon: "success",
        title:
          data.box_action === "closed" ? "ปิดกล่องสำเร็จ" : "เปิดกล่องสำเร็จ",
        text: data.current_box?.box_label || scannedBoxCode,
        timer: 1200,
        showConfirmButton: false,
      });

      setBoxOpenScanInput("");
    } catch (error: any) {
      Swal.fire({
        icon: "error",
        title: "ไม่สามารถเปิด/ปิดกล่องได้",
        text: error?.response?.data?.message || "กรุณาลองใหม่อีกครั้ง",
      });
      setBoxOpenScanInput("");
    }
  };

  const handleItemScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !itemScanInput.trim() ||
      !currentBox ||
      isBoxClosed ||
      !packProduct ||
      !currentPackBoxId
    ) {
      return;
    }

    const scanned = itemScanInput.trim();

    if (scanned === currentBox.box_code) {
      try {
        const res = await packProductApi.scan(
          scanned,
          getUserRef() || undefined,
        );
        const data = res.data.data;

        setPackBoxes(data.boxes || []);
        setCurrentBox(null);
        setCurrentPackBoxId(null);
        setIsBoxClosed(true);
        setItemScanInput("");
        setIsOpenBoxScanActive(true);

        Swal.fire({
          icon: "success",
          title: "ปิดกล่องสำเร็จ",
          text: data.current_box?.box_label || currentBox.box_name,
          timer: 1200,
          showConfirmButton: false,
        });

        setTimeout(() => boxOpenScanRef.current?.focus(), 100);
        return;
      } catch (error: any) {
        Swal.fire({
          icon: "error",
          title: "ปิดกล่องไม่สำเร็จ",
          text: error?.response?.data?.message || "กรุณาลองใหม่อีกครั้ง",
        });
        return;
      }
    }

    try {
      const res = await packProductApi.scanItem(
        packProduct.id,
        currentPackBoxId,
        {
          barcode: scanned,
          qty_input: 1,
          user_ref: getUserRef() || undefined,
        },
      );

      const data = res.data.data;

      setBatchItems((prev) =>
        prev.map((it) => {
          if (String(it.goods_out_id) !== String(data.matched_item.id))
            return it;
          return {
            ...it,
            pack: Number(
              data.synced_item?.pack ??
                data.matched_item.pack_after ??
                it.pack ??
                0,
            ),
            status: String(
              data.synced_item?.status ??
                data.matched_item.status_after ??
                it.status ??
                "",
            ),
            box_name: currentBox.box_name,
          };
        }),
      );

      setPackHistory((prev) => [
        ...prev,
        {
          itemIndex: batchItems.findIndex(
            (x) => String(x.goods_out_id) === String(data.matched_item.id),
          ),
          boxCode: currentBox.box_code,
          boxName: currentBox.box_name,
        },
      ]);

      setItemScanInput("");

      toast.success(
        `เพิ่มสินค้า ${data.matched_item.name ?? ""} สำเร็จ (Pack: ${data.synced_item?.pack ?? data.matched_item.pack_after ?? 0}/${data.matched_item.qty ?? 0})`,
        { autoClose: 1200 },
      );
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "ไม่สามารถสแกนสินค้าเข้ากล่องได้",
      );
      setItemScanInput("");
    }
  };

  const handleUndoItem = async (itemIndex: number) => {
    const item = batchItems[itemIndex];
    if (!item || !packProduct || !currentPackBoxId) return;

    const result = await confirmAlert(
      "คุณต้องการยกเลิกรายการล่าสุดของแถวนี้ใช่หรือไม่?",
    );
    if (!result.isConfirmed) return;

    try {
      const barcodeToUse = String(
        item.barcode_text ?? item.barcode ?? item.code ?? "",
      ).trim();

      const res = await packProductApi.scanReturn(
        packProduct.id,
        currentPackBoxId,
        {
          barcode: barcodeToUse,
          qty_input: 1,
          user_ref: getUserRef() || undefined,
        },
      );

      const data = res.data.data;

      setBatchItems((prev) =>
        prev.map((it) => {
          if (String(it.goods_out_id) !== String(data.matched_item.id))
            return it;
          return {
            ...it,
            pack: Number(data.synced_item?.pack ?? 0),
            status: String(data.synced_item?.status ?? it.status ?? ""),
          };
        }),
      );

      Swal.fire({
        icon: "success",
        title: "ยกเลิกสำเร็จ",
        text: `ย้อนกลับ 1 ชิ้น`,
        timer: 800,
        showConfirmButton: false,
      });
    } catch (error: any) {
      Swal.fire({
        icon: "error",
        title: "ย้อนกลับไม่สำเร็จ",
        text: error?.response?.data?.message || "กรุณาลองใหม่อีกครั้ง",
      });
    }
  };

  const handleClearItem = async (itemIndex: number) => {
    const item = batchItems[itemIndex];
    if (!item || !packProduct || !currentPackBoxId || (item.pack || 0) <= 0) {
      Swal.fire({
        icon: "info",
        title: "ไม่มีรายการ",
        text: "แถวนี้ยังไม่มี Pack ให้เคลียร์",
      });
      return;
    }

    const result = await confirmAlert(
      "คุณต้องการเคลียร์จำนวน Pack ของแถวนี้ทั้งหมดใช่หรือไม่?",
    );
    if (!result.isConfirmed) return;

    try {
      const barcodeToUse = String(
        item.barcode_text ?? item.barcode ?? item.code ?? "",
      ).trim();

      await packProductApi.scanReturn(packProduct.id, currentPackBoxId, {
        barcode: barcodeToUse,
        qty_input: Number(item.pack || 0),
        user_ref: getUserRef() || undefined,
      });

      setBatchItems((prev) =>
        prev.map((it, idx) =>
          idx === itemIndex
            ? {
                ...it,
                pack: 0,
              }
            : it,
        ),
      );

      Swal.fire({
        icon: "success",
        title: "เคลียร์สำเร็จ",
        timer: 900,
        showConfirmButton: false,
      });
    } catch (error: any) {
      Swal.fire({
        icon: "error",
        title: "เคลียร์ไม่สำเร็จ",
        text: error?.response?.data?.message || "กรุณาลองใหม่อีกครั้ง",
      });
    }
  };

  const openInlinePackEdit = (itemIndex: number) => {
    const rowId = getRowIdByIndex(itemIndex);
    const current = Number(batchItems[itemIndex]?.pack ?? 0);

    setEditingPackRowId(rowId);
    setEditPackValue(String(current));

    setTimeout(() => {
      const el = editPackInputRef.current[rowId];
      el?.focus();
      el?.select();
    }, 0);
  };

  const cancelInlinePackEdit = () => {
    setEditingPackRowId(null);
    setEditPackValue("");
  };

  const saveInlinePackEdit = async (itemIndex: number) => {
    const it = batchItems[itemIndex];
    if (!it) return;

    const nextPack = parseInt(editPackValue, 10);
    if (Number.isNaN(nextPack) || nextPack < 0) {
      Swal.fire({ icon: "error", title: "กรุณาใส่ตัวเลขที่ถูกต้อง" });
      return;
    }

    const pickQty = Number((it as any).pick ?? 0);
    const qty = Number((it as any).quantity ?? 0);

    if (nextPack > pickQty) {
      Swal.fire({
        icon: "warning",
        title: "Pack เกิน Pick ไม่ได้",
        text: `Pick = ${pickQty}`,
      });
      return;
    }
    if (nextPack > qty) {
      Swal.fire({
        icon: "warning",
        title: "Pack เกิน QTY ไม่ได้",
        text: `QTY = ${qty}`,
      });
      return;
    }

    const packedInBoxes = getPackedInBoxes(boxContents, itemIndex);

    if (packedInBoxes > 0 && nextPack !== Number(it.pack ?? 0)) {
      const c = await confirmAlert(
        "การแก้ Pack จะล้างข้อมูลกล่อง (Box) ของแถวนี้ เพื่อป้องกันจำนวนต่อกล่องไม่ตรง ต้องการทำต่อใช่ไหม?",
      );
      if (!c.isConfirmed) return;

      const newBoxContents = new Map(boxContents);
      newBoxContents.forEach((boxData, boxCode) => {
        if (boxData.items.has(itemIndex)) {
          boxData.items.delete(itemIndex);
          if (boxData.items.size === 0) newBoxContents.delete(boxCode);
        }
      });

      const newHistory = packHistory.filter((h) => h.itemIndex !== itemIndex);

      const updatedItems = [...batchItems];
      updatedItems[itemIndex] = {
        ...updatedItems[itemIndex],
        pack: nextPack,
        box_name: undefined,
      };

      setBoxContents(newBoxContents);
      setPackHistory(newHistory);
      setBatchItems(updatedItems);
    } else {
      const updatedItems = [...batchItems];
      updatedItems[itemIndex] = {
        ...updatedItems[itemIndex],
        pack: nextPack,
      };
      setBatchItems(updatedItems);
    }

    setEditingPackRowId(null);
    setEditPackValue("");

    Swal.fire({
      icon: "success",
      title: "แก้ไข Pack สำเร็จ",
      timer: 900,
      showConfirmButton: false,
    });
  };

  // const handleSaveDraft = async () => {
  //   const result = await confirmAlert("คุณต้องการบันทึกร่างใช่หรือไม่?");
  //   if (!result.isConfirmed) return;

  //   setIsSaving(true);
  //   const user_ref = getUserRef();
  //   if (!user_ref) {
  //     warningAlert(
  //       "ไม่พบชื่อผู้ใช้งาน (first_name/last_name) กรุณา login ใหม่",
  //     );
  //     setIsSaving(false);
  //     return;
  //   }

  //   try {
  //     const updatePromises: Promise<any>[] = [];

  //     batchItems.forEach((item) => {
  //       if ((item.pack || 0) > 0 && item.goods_out_id && item.outbound_no) {
  //         const goodsOutId = String(item.goods_out_id);
  //         const outboundNo = item.outbound_no;

  //         updatePromises.push(
  //           goodsoutApi.patchOutboundItem(outboundNo, goodsOutId, {
  //             pack: item.pack,
  //             user_ref: getUserRef() || undefined,
  //           }),
  //         );

  //         const itemIndex = batchItems.indexOf(item);
  //         boxContents.forEach((boxData) => {
  //           const qtyInBox = boxData.items.get(itemIndex);
  //           if (qtyInBox && qtyInBox > 0) {
  //             updatePromises.push(
  //               goodsoutApi.addBoxToItem(outboundNo, goodsOutId, {
  //                 box_id: boxData.boxId,
  //                 quantity: qtyInBox,
  //               }),
  //             );
  //           }
  //         });
  //       }
  //     });

  //     await Promise.all(updatePromises);
  //     await successAlert("บันทึกร่างสำเร็จ");
  //     navigate("/outbound");
  //   } catch (error: any) {
  //     Swal.fire({
  //       icon: "error",
  //       title: "เกิดข้อผิดพลาด",
  //       text: error?.response?.data?.message || "ไม่สามารถบันทึกร่างได้",
  //     });
  //   } finally {
  //     setIsSaving(false);
  //   }
  // };

  // const handleSubmit = async () => {
  //   const incompleteItems = batchItems.filter(
  //     (item) =>
  //       (item.pack || 0) !== (item.quantity || 0) && (item.pack || 0) > 0,
  //   );

  //   const user_ref = getUserRef();
  //   if (!user_ref) {
  //     warningAlert(
  //       "ไม่พบชื่อผู้ใช้งาน (first_name/last_name) กรุณา login ใหม่",
  //     );
  //     return;
  //   }

  //   if (incompleteItems.length > 0) {
  //     const result = await confirmAlert(
  //       "สินค้าไม่ครบตามจำนวนที่ต้องจัดส่ง คุณต้องการยืนยันการจัดส่งใช่หรือไม่?",
  //     );
  //     if (!result.isConfirmed) return;
  //   }

  //   const invalidItems = batchItems.filter(
  //     (item) => (item.pack || 0) > (item.pick || 0),
  //   );
  //   if (invalidItems.length > 0) {
  //     Swal.fire({
  //       icon: "error",
  //       title: "ข้อผิดพลาด",
  //       text: "มีสินค้าที่ Pack มากกว่า Pick ไม่สามารถยืนยันได้",
  //     });
  //     return;
  //   }

  //   setIsSubmitting(true);
  //   try {
  //     const updatePromises: Promise<any>[] = [];

  //     batchItems.forEach((item) => {
  //       if ((item.pack || 0) > 0 && item.goods_out_id && item.outbound_no) {
  //         const goodsOutId = String(item.goods_out_id);
  //         const outboundNo = item.outbound_no;

  //         updatePromises.push(
  //           goodsoutApi.patchOutboundItem(outboundNo, goodsOutId, {
  //             pack: item.pack,
  //             status: "completed",
  //             user_ref: getUserRef() || undefined,
  //           }),
  //         );

  //         const itemIndex = batchItems.indexOf(item);
  //         boxContents.forEach((boxData) => {
  //           const qtyInBox = boxData.items.get(itemIndex);
  //           if (qtyInBox && qtyInBox > 0) {
  //             updatePromises.push(
  //               goodsoutApi.addBoxToItem(outboundNo, goodsOutId, {
  //                 box_id: boxData.boxId,
  //                 quantity: qtyInBox,
  //               }),
  //             );
  //           }
  //         });
  //       }
  //     });

  //     await Promise.all(updatePromises);

  //     setBatchItems((prev) =>
  //       prev.map((item) =>
  //         (item.pack || 0) > 0
  //           ? {
  //               ...item,
  //               status: "completed",
  //             }
  //           : item,
  //       ),
  //     );

  //     setIsBoxClosed(true);
  //     setIsOpenBoxScanActive(false);
  //     setBoxOpenScanInput("");
  //     setItemScanInput("");

  //     await successAlert("ยืนยันการจัดส่งสำเร็จ");

  //     // รีเซ็ตหน้าจอเพื่อเริ่มสแกน invoice ใหม่
  //     setInvoiceList([]);
  //     setSelectedInvoices(new Set());
  //     setBatchItems([]);
  //     resetPackingState();
  //     setIsScanActive(false);
  //   } catch (error: any) {
  //     Swal.fire({
  //       icon: "error",
  //       title: "เกิดข้อผิดพลาด",
  //       text: error?.response?.data?.message || "ไม่สามารถยืนยันการจัดส่งได้",
  //     });
  //   } finally {
  //     setIsSubmitting(false);
  //   }
  // };

  const handleSaveDraft = async () => {
    await successAlert("บันทึกข้อมูลล่าสุดแล้ว");
    navigate("/outbound");
  };

  const handleSubmit = async () => {
    await successAlert("ข้อมูลถูกบันทึกแล้ว");
    navigate("/outbound");
  };

  return (
    <div className="scanbox-container">
      <div className="scanbox-header">
        <h3>Step 1 : Scan Invoice (สามารถมีมากกว่า 1)</h3>
      </div>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: "50px" }}>
          <i
            className="fas fa-spinner fa-spin"
            style={{ fontSize: "48px", color: "#007bff" }}
          ></i>
          <p style={{ marginTop: "20px" }}>กำลังโหลดข้อมูล...</p>
        </div>
      ) : (
        <>
          <div className="scan-section">
            {!isReadOnly && (
              <button
                className={`scan-button ${isScanActive ? "active" : ""}`}
                onClick={toggleScanMode}
                type="button"
              >
                <i
                  className={`fas ${isScanActive ? "fa-stop" : "fa-barcode"}`}
                ></i>
                {isScanActive ? "ปิดสแกน" : "สแกนบาร์โค้ด"}
              </button>
            )}

            {isScanActive && !isReadOnly && (
              <form onSubmit={handleBarcodeSubmit} className="barcode-form">
                <input
                  ref={inputRef}
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  placeholder="สแกน outbound barcode..."
                  className="barcode-input"
                />
                <button type="submit" className="submit-barcode">
                  เพิ่ม
                </button>
              </form>
            )}
          </div>

          <div className="scanbox-doc-list">
            <table className="scanbox-doc-table">
              <thead>
                <tr>
                  <th>Select</th>
                  <th>No</th>
                  <th>Doc No.</th>
                  <th>Invoice</th>
                  <th>Origin</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {invoiceList.map((inv, idx) => (
                  <tr key={inv.no}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedInvoices.has(inv.no)}
                        onChange={() => handleCheckboxChange(inv.no)}
                      />
                    </td>
                    <td>{idx + 1}</td>
                    <td>{getDocNo(inv)}</td>
                    <td>{inv.invoice || "-"}</td>
                    <td>{inv.origin || "-"}</td>
                    <td>{inv.out_type || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="batch-panel">
            <div className="batch-table-container">
              <div className="groupOrder-view-tabs" style={{ marginTop: 10 }}>
                {!isReadOnly && (
                  <button
                    type="button"
                    className={`groupOrder-tab ${viewMode === "pending" ? "active" : ""}`}
                    onClick={() => setViewMode("pending")}
                  >
                    ยังไม่ได้ดำเนินการ{" "}
                    <span className="badge">{pendingCount}</span>
                  </button>
                )}

                <button
                  type="button"
                  className={`groupOrder-tab ${viewMode === "done" ? "active" : ""}`}
                  onClick={() => setViewMode("done")}
                >
                  ดำเนินการเสร็จสิ้นแล้ว{" "}
                  <span className="badge">{doneCount}</span>
                </button>
              </div>
              <br />

              <table className="batch-table">
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>สินค้า</th>
                    <th>ชื่อ</th>
                    <th>Lot Serial.</th>
                    <th>QTY</th>
                    <th>Pick</th>
                    <th>Pack</th>
                    <th>Box ID</th>
                    {!isReadOnly && <th>Action</th>}
                  </tr>
                </thead>

                <tbody>
                  {visibleItems.map(({ item, originalIndex }, index) => {
                    let rowClass = "";
                    if ((item.pack || 0) === 0) rowClass = "row-white";
                    else if ((item.pack || 0) === (item.quantity || 0))
                      rowClass = "row-green";
                    else rowClass = "row-yellow";

                    return (
                      <tr
                        key={`${item.goods_out_id}-${item.code}-${item.lock_no}-${item.lot_name}-${originalIndex}`}
                        className={rowClass}
                      >
                        <td>{index + 1}</td>
                        <td>{item.code || "-"}</td>
                        <td>{item.name || "-"}</td>
                        <td>{item.lot_name || "-"}</td>
                        <td className="qty-cell">{item.quantity || 0}</td>
                        <td className="qty-cell">{item.pick || 0}</td>

                        <td className="qty-cell">
                          {(() => {
                            const itemIndex = originalIndex;
                            const rowId = getRowIdByIndex(itemIndex);

                            if (editingPackRowId === rowId) {
                              return (
                                <div className="edit-qty-container">
                                  <input
                                    ref={(el) => {
                                      editPackInputRef.current[rowId] = el;
                                    }}
                                    type="number"
                                    min={0}
                                    max={Number(item.quantity ?? 0)}
                                    className="edit-qty-input"
                                    value={editPackValue}
                                    onChange={(e) =>
                                      setEditPackValue(e.target.value)
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter")
                                        saveInlinePackEdit(itemIndex);
                                      if (e.key === "Escape")
                                        cancelInlinePackEdit();
                                    }}
                                  />
                                  <button
                                    className="btn-save-edit"
                                    onClick={() =>
                                      saveInlinePackEdit(itemIndex)
                                    }
                                    type="button"
                                  >
                                    ✓
                                  </button>
                                  <button
                                    className="btn-cancel-edit"
                                    onClick={cancelInlinePackEdit}
                                    type="button"
                                  >
                                    ✕
                                  </button>
                                </div>
                              );
                            }

                            return <>{item.pack}</>;
                          })()}
                        </td>

                        <td>
                          {item.box_name
                            ? item.box_name
                                .split(", ")
                                .map((name, i) => <div key={i}>{name}</div>)
                            : "-"}
                        </td>

                        {!isReadOnly && (
                          <td className="groupOrder-action-buttons">
                            {(() => {
                              const itemIndex = originalIndex;
                              const rowId = getRowIdByIndex(itemIndex);
                              const canEdit = isInputNumber(item);

                              return (
                                <div className="grouporder-dropdown-container">
                                  <button
                                    ref={(el) => {
                                      buttonRef.current[rowId] = el;
                                    }}
                                    onClick={() => toggleDropdown(rowId)}
                                    className="btn-dropdown-toggle"
                                    title="เมนูเพิ่มเติม"
                                    type="button"
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
                                          onClick={async () => {
                                            closeDropdown();
                                            await handleUndoItem(itemIndex);
                                          }}
                                          type="button"
                                          disabled={(item.pack || 0) <= 0}
                                        >
                                          <span className="menu-icon">
                                            <i className="fas fa-undo"></i>
                                          </span>
                                          ย้อนกลับ
                                        </button>

                                        <button
                                          className="grouporder-dropdown-item"
                                          onClick={async () => {
                                            closeDropdown();
                                            await handleClearItem(itemIndex);
                                          }}
                                          type="button"
                                          disabled={(item.pack || 0) <= 0}
                                        >
                                          <span className="menu-icon">
                                            <i className="fas fa-trash-alt"></i>
                                          </span>
                                          รีเซ็ต
                                        </button>

                                        {canEdit ? (
                                          <button
                                            className="grouporder-dropdown-item"
                                            onClick={() => {
                                              closeDropdown();
                                              openInlinePackEdit(itemIndex);
                                            }}
                                            type="button"
                                          >
                                            <span className="menu-icon">
                                              <i className="fa-solid fa-pen-to-square"></i>
                                            </span>
                                            Edit Pack
                                          </button>
                                        ) : null}
                                      </div>,
                                      document.body,
                                    )}
                                </div>
                              );
                            })()}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {!isReadOnly && (
            <div className="scanbox-step-section">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "20px",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "10px" }}
                >
                  <h3 style={{ margin: 0 }}>
                    Step 2 : Scan เปิด/ปิดกล่อง และสแกนสินค้า
                  </h3>
                </div>
                <button
                  className="collapse-btn"
                  onClick={() => setIsStep2Collapsed(!isStep2Collapsed)}
                  type="button"
                >
                  <i
                    className={`fas fa-chevron-${isStep2Collapsed ? "down" : "up"}`}
                  ></i>
                </button>
              </div>

              {!isStep2Collapsed && (
                <>
                  <div className="scanbox-box-display">
                    <span className="scanbox-box-title">
                      {currentBox?.box_name || "-"}
                    </span>
                  </div>

                  <p style={{ marginTop: 8, color: "#666" }}>
                    เปิดกล่องด้วยการสแกนครั้งแรก
                    และสแกนรหัสกล่องเดิมซ้ำอีกครั้งเพื่อปิดกล่อง
                  </p>

                  <div className="scanbox-scan-row">
                    <button
                      className={`scan-button ${isOpenBoxScanActive ? "active" : ""}`}
                      onClick={() =>
                        setIsOpenBoxScanActive(!isOpenBoxScanActive)
                      }
                      type="button"
                    >
                      <i
                        className={`fas ${isOpenBoxScanActive ? "fa-stop" : "fa-box-open"}`}
                      ></i>
                      {isOpenBoxScanActive ? "ปิดสแกน" : "สแกนเปิด/ปิดกล่อง"}
                    </button>

                    {isOpenBoxScanActive && (
                      <form
                        onSubmit={handleOpenBoxScan}
                        className="barcode-form"
                      >
                        <input
                          ref={boxOpenScanRef}
                          type="text"
                          value={boxOpenScanInput}
                          onChange={(e) => setBoxOpenScanInput(e.target.value)}
                          placeholder="Scan Box Code to Open / Scan same box again to Close"
                          className="barcode-input"
                        />
                        <button type="submit" className="submit-barcode">
                          ยืนยัน
                        </button>
                      </form>
                    )}
                  </div>

                  {currentBox && !isBoxClosed && (
                    <div
                      className="scanbox-scan-row"
                      style={{
                        marginTop: "15px",
                        backgroundColor: "#E8F5E9",
                        padding: "15px",
                        borderRadius: "5px",
                        border: "2px solid #4CAF50",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          marginBottom: "10px",
                        }}
                      >
                        <label
                          style={{
                            fontWeight: "bold",
                            color: "#2E7D32",
                            margin: 0,
                          }}
                        >
                          Scan Item
                        </label>
                      </div>
                      <form onSubmit={handleItemScan}>
                        <input
                          ref={itemScanRef}
                          type="text"
                          value={itemScanInput}
                          onChange={(e) => setItemScanInput(e.target.value)}
                          placeholder="Scan Item Barcode"
                          className="scanbox-scan-input"
                        />
                      </form>
                    </div>
                  )}

                  <div className="scanbox-info-row">
                    <span>User : {getUserRef() || "ref. login"}</span>
                    <span>Date : {currentTimestamp}</span>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="order-footer">
            {!isReadOnly && (
              <button
                className="scanbox-btn-draft"
                onClick={handleSaveDraft}
                type="button"
                disabled={actionLoading}
              >
                {isSaving ? "Saving..." : "Save Draft"}
              </button>
            )}

            <button
              className="scanbox-btn-cancel"
              onClick={() => navigate(-1)}
              type="button"
              disabled={actionLoading}
            >
              {isReadOnly ? "กลับ" : "ยกเลิก"}
            </button>

            {!isReadOnly && (
              <button
                className="scanbox-btn-submit"
                onClick={handleSubmit}
                type="button"
                disabled={actionLoading}
              >
                {isSubmitting ? "Submitting..." : "ยืนยันจัดส่ง"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ScanBox;
