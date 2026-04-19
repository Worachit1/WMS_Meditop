import React, { useRef, useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Swal from "sweetalert2";
import { packProductApi } from "../../services/outbound.api";
import { socket } from "../../../../services/socket";
import type {
  InvoiceData,
  GoodsOutItem,
  BatchItem,
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

type SortDir = "asc" | "desc" | null;
type ViewMode = "pending" | "done";

type BatchItemExt = BatchItem & {
  lot_serial?: string | null;
  lot_id?: number | null;
  status?: string;
  box_name?: string;
  boxId?: string;
  grouped_item_ids?: number[];
  outbound_nos?: string[];
  box_ids?: number[];
  box_nos?: number[];
  box_labels?: string[];
  box_codes?: string[];
  box_display?: string | null;
};

type CurrentOpenBoxState = {
  id: number;
  name?: string | null;
  box_no?: number | null;
  status?: string | null;
  opened_by?: string | null;
};

const getCurrentUserRef = () => {
  const first = (localStorage.getItem("first_name") || "").trim();
  const last = (localStorage.getItem("last_name") || "").trim();
  return `${first} ${last}`.trim().toLowerCase();
};

const getUserRef = () => {
  const first = (localStorage.getItem("first_name") || "").trim();
  const last = (localStorage.getItem("last_name") || "").trim();
  return `${first} ${last}`.trim();
};

const getCurrentBoxStorageKey = (scopeKey?: string | null) => {
  const userRef = getCurrentUserRef() || "anonymous";
  const scope = String(scopeKey || "").trim() || "default";
  return `pack_current_box_${scope}_${userRef}`;
};

const normalizeCurrentBox = (raw: any): CurrentOpenBoxState | null => {
  const id = Number(raw?.id ?? 0);
  if (!id) return null;

  return {
    id,
    name:
      raw?.name ??
      raw?.box_label ??
      raw?.box_name ??
      raw?.box_code ??
      raw?.code ??
      null,
    box_no: raw?.box_no ?? raw?.no ?? null,
    status: raw?.status ?? null,
    opened_by: raw?.opened_by ?? raw?.user_ref ?? raw?.updated_by ?? null,
  };
};

const persistCurrentBoxToStorage = (
  scopeKey: string | undefined,
  box: CurrentOpenBoxState | null,
) => {
  const key = getCurrentBoxStorageKey(scopeKey);

  if (!box?.id) {
    localStorage.removeItem(key);
    return;
  }

  localStorage.setItem(key, JSON.stringify(box));
};

const restoreCurrentBoxFromStorage = (
  scopeKey: string | undefined,
): CurrentOpenBoxState | null => {
  const key = getCurrentBoxStorageKey(scopeKey);
  const raw = localStorage.getItem(key);
  if (!raw) return null;

  try {
    return normalizeCurrentBox(JSON.parse(raw));
  } catch {
    return null;
  }
};

const clearCurrentBoxFromStorage = (scopeKey?: string | null) => {
  localStorage.removeItem(getCurrentBoxStorageKey(scopeKey));
};

const normalizePrefix = (v: string) =>
  v.replace(/\s+/g, " ").trim().toUpperCase();

const parseScannedPackBarcode = (raw: string) => {
  const match = raw.match(/(.+)_\s*(\d+)\s*\/\s*(\d+)/);
  if (!match) return null;

  return {
    prefixRaw: match[1].trim(),
    boxNo: Number(match[2]),
    boxMax: Number(match[3]),
  };
};

const isBoxStillOpen = (box: any) => {
  const status = String(box?.status ?? "")
    .trim()
    .toLowerCase();
  return status !== "closed" && status !== "done" && status !== "completed";
};

const isSameUserBox = (box: any) => {
  const currentUser = getCurrentUserRef();
  const openedBy = String(
    box?.opened_by ?? box?.user_ref ?? box?.updated_by ?? "",
  )
    .trim()
    .toLowerCase();

  if (!openedBy) return true;
  return openedBy === currentUser;
};

const ScanBox = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isReadOnly = searchParams.get("readonly") === "1";

  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const actionLoading = isSaving || isSubmitting;

  const [isLoading, setIsLoading] = useState(false);

  const [isScanActive, setIsScanActive] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const [invoiceList, setInvoiceList] = useState<InvoiceData[]>([]);
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(
    new Set(),
  );
  const [batchItems, setBatchItems] = useState<BatchItemExt[]>([]);

  const [currentBox, setCurrentBox] = useState<{
    id: number;
    box_code: string;
    box_name: string;
  } | null>(null);

  const [boxOpenScanInput, setBoxOpenScanInput] = useState("");
  const [itemScanInput, setItemScanInput] = useState("");

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
  const [_currentPrefix, setCurrentPrefix] = useState<string>("");

  const [viewMode, setViewMode] = useState<ViewMode>(
    isReadOnly ? "done" : "pending",
  );

  const hasLoadedRef = useRef(false);

  type MenuPos = { top: number; left: number };

  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<Record<string, HTMLButtonElement | null>>({});

  const getRowIdByIndex = (itemIndex: number) => String(itemIndex);

  const currentBoxScopeKey = useMemo(() => {
    return (
      String(
        packProduct?.id ??
          searchParams.get("packId") ??
          searchParams.get("prefix") ??
          searchParams.get("outbound") ??
          "",
      ).trim() || "default"
    );
  }, [packProduct?.id, searchParams]);

  const restoreCurrentBoxForView = (boxes: PackProductBox[]) => {
    const stored = restoreCurrentBoxFromStorage(currentBoxScopeKey);

    if (!stored?.id) {
      setCurrentBox(null);
      setCurrentPackBoxId(null);
      setIsBoxClosed(true);
      return;
    }

    const found = boxes.find(
      (b: any) => Number(b?.id ?? 0) === Number(stored.id),
    );
    if (!found) {
      clearCurrentBoxFromStorage(currentBoxScopeKey);
      setCurrentBox(null);
      setCurrentPackBoxId(null);
      setIsBoxClosed(true);
      return;
    }

    if (!isBoxStillOpen(found)) {
      clearCurrentBoxFromStorage(currentBoxScopeKey);
      setCurrentBox(null);
      setCurrentPackBoxId(null);
      setIsBoxClosed(true);
      return;
    }

    if (!isSameUserBox(found)) {
      clearCurrentBoxFromStorage(currentBoxScopeKey);
      setCurrentBox(null);
      setCurrentPackBoxId(null);
      setIsBoxClosed(true);
      return;
    }

    setCurrentBox({
      id: Number(found.id),
      box_code: String(found.box_code ?? ""),
      box_name: String(found.box_label || found.box_code || ""),
    });
    setCurrentPackBoxId(Number(found.id));
    setIsBoxClosed(false);
  };

  const setCurrentBoxFromOwnAction = (boxData: any | null) => {
    if (boxData && String(boxData.status ?? "").toLowerCase() === "open") {
      const localBox = {
        id: Number(boxData.id),
        box_code: String(boxData.box_code ?? ""),
        box_name: String(boxData.box_label || boxData.box_code || ""),
      };

      setCurrentBox(localBox);
      setCurrentPackBoxId(Number(boxData.id));
      setIsBoxClosed(false);
      setIsOpenBoxScanActive(false);

      persistCurrentBoxToStorage(currentBoxScopeKey, {
        id: Number(boxData.id),
        name: String(boxData.box_label || boxData.box_code || ""),
        box_no:
          boxData.box_no == null || Number.isNaN(Number(boxData.box_no))
            ? null
            : Number(boxData.box_no),
        status: String(boxData.status ?? "open"),
        opened_by:
          boxData.opened_by ?? boxData.user_ref ?? boxData.updated_by ?? null,
      });
      return;
    }

    setCurrentBox(null);
    setCurrentPackBoxId(null);
    setIsBoxClosed(true);
    clearCurrentBoxFromStorage(currentBoxScopeKey);
  };

  const reloadPackProductDetail = async (packProductId: number) => {
    const res = await packProductApi.getById(String(packProductId));
    applyPackDetailData(res.data, { preserveLocalBox: true });
  };

  const getCurrentOpenedBoxItemCount = () => {
    if (!currentPackBoxId) return 0;

    const foundBox = packBoxes.find(
      (box) => Number(box.id) === Number(currentPackBoxId),
    );

    if (!foundBox || !Array.isArray((foundBox as any).items)) return 0;

    return (foundBox as any).items.reduce((sum: number, item: any) => {
      return sum + Number(item?.quantity ?? 0);
    }, 0);
  };

  const rebuildBatchItemsFromPackOutbounds = (payload: any) => {
    const groupedItems = Array.isArray(payload?.grouped_items)
      ? payload.grouped_items
      : [];

    if (groupedItems.length > 0) {
      const items: BatchItemExt[] = groupedItems.map(
        (item: any, index: number) => {
          const boxIds = Array.isArray(item?.box_ids) ? item.box_ids : [];
          const boxNos = Array.isArray(item?.box_nos) ? item.box_nos : [];
          const boxLabels = Array.isArray(item?.box_labels)
            ? item.box_labels
            : [];
          const boxCodes = Array.isArray(item?.box_codes) ? item.box_codes : [];

          const boxDisplay =
            typeof item?.box_display === "string" && item.box_display.trim()
              ? item.box_display.trim()
              : boxLabels.length > 0
                ? boxLabels.join(", ")
                : boxIds.length > 0
                  ? boxIds.join(", ")
                  : "";

          return {
            invoice_item_id: Number(item?.grouped_item_ids?.[0] ?? index + 1),
            outbound_no: Array.isArray(item?.outbound_nos)
              ? item.outbound_nos.join(", ")
              : "",
            product_id: undefined,
            goods_out_id: String(
              item?.grouped_item_ids?.[0] ?? `group-${index}`,
            ),
            code: String(item?.code ?? ""),
            name: String(item?.name ?? ""),
            lock_no: null,
            lock_name: null,
            lot_id: undefined,
            lot_serial: item?.lot_serial ?? null,
            lot_no: item?.lot_serial ?? "",
            lot_name: item?.lot_serial ?? "",
            quantity: Number(item?.qty ?? 0),
            pick: Number(item?.pick ?? 0),
            pack: Number(item?.pack ?? 0),
            exp: null,
            status: String(item?.status ?? ""),
            batchId: undefined,
            boxId: boxIds.length > 0 ? boxIds.join(", ") : undefined,
            box_name: boxDisplay || undefined,
            box_ids: boxIds,
            box_nos: boxNos,
            box_labels: boxLabels,
            box_codes: boxCodes,
            box_display: boxDisplay || null,
            barcode: String(
              item?.sample_item?.barcode?.barcode ?? item?.code ?? "",
            ),
            barcode_text: String(
              item?.sample_item?.barcode_text ?? item?.code ?? "",
            ),
            sku: String(item?.code ?? ""),
            input_number: Boolean(item?.sample_item?.input_number),
            grouped_item_ids: Array.isArray(item?.grouped_item_ids)
              ? item.grouped_item_ids
              : [],
            outbound_nos: Array.isArray(item?.outbound_nos)
              ? item.outbound_nos
              : [],
          };
        },
      );

      setBatchItems(items);
      return;
    }

    const outbounds = Array.isArray(payload?.outbounds)
      ? payload.outbounds
      : payload || [];

    const items: BatchItemExt[] = [];

    outbounds.forEach((outbound: any) => {
      (outbound.items || []).forEach((item: GoodsOutItem) => {
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
          box_name: undefined,
          barcode: String(item.barcode?.barcode ?? item.code ?? ""),
          barcode_text: String((item as any).barcode_text ?? item.code ?? ""),
          sku: String(item.code ?? ""),
          input_number: Boolean((item as any).input_number),
        });
      });
    });

    setBatchItems(items);
  };

  const applySharedPackData = (root: any) => {
    const packHeader = root?.pack_product ?? {
      id: Number(root?.id ?? 0),
      name: String(root?.name ?? ""),
      scan_prefix: String(root?.scan_prefix ?? root?.parsed?.prefix ?? ""),
      max_box: Number(root?.max_box ?? 0),
      status: String(root?.status ?? ""),
      created_at: root?.created_at ?? null,
      updated_at: root?.updated_at ?? null,
    };

    const outbounds = Array.isArray(root?.outbounds) ? root.outbounds : [];
    const boxes = Array.isArray(root?.boxes) ? root.boxes : [];

    setPackProduct(packHeader);
    setPackBoxes(boxes);
    setCurrentPrefix(
      String(
        root?.parsed?.prefix ??
          root?.scan_prefix ??
          packHeader?.scan_prefix ??
          "",
      ),
    );

    const packInvoices: InvoiceData[] = outbounds.map((outbound: any) => ({
      no: String(outbound.no),
      invoice: String(outbound.invoice ?? ""),
      origin: String(outbound.origin ?? ""),
      outbound_barcode: String(outbound.outbound_barcode ?? outbound.no ?? ""),
      out_type: outbound.out_type || "sale",
      items: Array.isArray(outbound.items) ? outbound.items : [],
      created_at: outbound.created_at ?? new Date().toISOString(),
      updated_at: outbound.updated_at ?? null,
      deleted_at: null,
    }));

    setInvoiceList(packInvoices);
    setSelectedInvoices(new Set(packInvoices.map((x) => x.no)));
    rebuildBatchItemsFromPackOutbounds(root);

    return { boxes, packHeader };
  };

  const applyPackProductData = (
    data: any,
    options?: { preserveLocalBox?: boolean },
  ) => {
    if (!data) {
      console.error("applyPackProductData: data is undefined");
      return;
    }

    const { boxes } = applySharedPackData(data);

    if (options?.preserveLocalBox) {
      restoreCurrentBoxForView(boxes);
      return;
    }

    const currentBoxData = data?.current_box;
    setCurrentBoxFromOwnAction(currentBoxData);
  };

  const applyPackDetailData = (
    payload: any,
    options?: { preserveLocalBox?: boolean },
  ) => {
    const root = payload?.data ?? payload;
    const { boxes } = applySharedPackData(root);

    if (options?.preserveLocalBox) {
      restoreCurrentBoxForView(boxes);
      return;
    }

    restoreCurrentBoxForView(boxes);
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

    const packId = searchParams.get("packId");
    const prefix = searchParams.get("prefix");
    const outbound = searchParams.get("outbound");

    const load = async () => {
      try {
        setIsLoading(true);

        if (packId) {
          const res = await packProductApi.getById(packId);
          applyPackDetailData(res.data, { preserveLocalBox: false });
          return;
        }

        if (prefix) {
          const res = await packProductApi.getByPrefix(prefix);
          applyPackDetailData(res.data, { preserveLocalBox: false });
          return;
        }

        if (outbound) {
          const res = await packProductApi.getByPrefix(outbound);
          applyPackDetailData(res.data, { preserveLocalBox: false });
        }
      } catch {
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [searchParams]);

  useEffect(() => {
    if (!packProduct?.id) return;

    const roomPayload = { packProductId: packProduct.id };

    socket.emit("pack_product:join", roomPayload);

    const handlePackUpdated = (payload: any) => {
      if (Number(payload?.pack_product_id) !== Number(packProduct.id)) return;

      const root = payload?.data ?? payload;
      applyPackDetailData(root, { preserveLocalBox: true });
    };

    socket.on("pack_product:updated", handlePackUpdated);

    return () => {
      socket.off("pack_product:updated", handlePackUpdated);
      socket.emit("pack_product:leave", roomPayload);
    };
  }, [packProduct?.id]);

  useEffect(() => {
    if (isScanActive && inputRef.current) inputRef.current.focus();
  }, [isScanActive]);

  useEffect(() => {
    if (isOpenBoxScanActive && boxOpenScanRef.current) {
      boxOpenScanRef.current.focus();
    }
  }, [isOpenBoxScanActive]);

  useEffect(() => {
    if (!packProduct) return;

    if (!currentBox) {
      clearCurrentBoxFromStorage(currentBoxScopeKey);
      return;
    }

    persistCurrentBoxToStorage(currentBoxScopeKey, {
      id: Number(currentBox.id),
      name: String(currentBox.box_name || currentBox.box_code || ""),
      status: isBoxClosed ? "closed" : "open",
    });
  }, [currentBox, isBoxClosed, currentBoxScopeKey, packProduct]);

  const closeDropdown = () => {
    setOpenDropdownId(null);
    setMenuPos(null);
  };

  const computeAndOpenDropdown = (rowId: string) => {
    const btn = buttonRef.current[rowId];
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    const menuHeight = dropdownRef.current?.offsetHeight ?? 120;
    const menuWidth = dropdownRef.current?.offsetWidth ?? 190;

    let top = rect.bottom + 8;
    let left = rect.right - menuWidth;

    if (top + menuHeight > window.innerHeight) top = rect.top - menuHeight - 8;
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

  const isDone = (it: BatchItemExt) =>
    (it.pack || 0) > 0 && (it.pack || 0) === (it.quantity || 0);

  const pendingCount = batchItems.filter((it) => !isDone(it)).length;
  const doneCount = batchItems.filter((it) => isDone(it)).length;

  const [sortCodeDir, setSortCodeDir] = useState<SortDir>(null);
  const [selectedBoxFilter, setSelectedBoxFilter] = useState<string>("all");
  const [showBoxFilterDropdown, setShowBoxFilterDropdown] = useState(false);

  const boxFilterOptions = useMemo(() => {
    return packBoxes
      .filter((b) => b.box_label)
      .sort((a, b) => (a.box_no ?? 0) - (b.box_no ?? 0));
  }, [packBoxes]);

  const toggleSortCode = () => {
    setSortCodeDir((prev) =>
      prev === null ? "asc" : prev === "asc" ? "desc" : null,
    );
  };

  const visibleItems = batchItems
    .map((item, originalIndex) => ({ item, originalIndex }))
    .filter(({ item }) => (viewMode === "done" ? isDone(item) : !isDone(item)))
    .filter(({ item }) => {
      if (selectedBoxFilter === "all") return true;
      if (selectedBoxFilter === "none") {
        return !item.box_ids || item.box_ids.length === 0;
      }
      const boxId = Number(selectedBoxFilter);
      return Array.isArray(item.box_ids) && item.box_ids.includes(boxId);
    })
    .sort((a, b) => {
      if (!sortCodeDir) return 0;
      const codeA = String(a.item.code ?? "").toLowerCase();
      const codeB = String(b.item.code ?? "").toLowerCase();
      const cmp = codeA.localeCompare(codeB, "th", { numeric: true });
      return sortCodeDir === "asc" ? cmp : -cmp;
    });

  const toggleScanMode = () => setIsScanActive(!isScanActive);

  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;

    const scannedBarcode = barcodeInput.trim();

    try {
      const parsedLocal = parseScannedPackBarcode(scannedBarcode);
      if (!parsedLocal) {
        throw new Error("รูปแบบ barcode ไม่ถูกต้อง");
      }

      const { prefixRaw, boxNo, boxMax } = parsedLocal;

      const currentPrefixText = String(packProduct?.scan_prefix ?? "").trim();

      const samePrefix =
        !!currentPrefixText &&
        normalizePrefix(currentPrefixText) === normalizePrefix(prefixRaw);

      if (samePrefix) {
        const currentMax = Number(packProduct?.max_box ?? 0);

        if (currentMax > 0 && boxMax < currentMax) {
          await Swal.fire({
            icon: "error",
            title: "Scan ไม่สำเร็จ",
            text: `barcode นี้ระบุจำนวนกล่องรวม (${boxMax}) น้อยกว่า max เดิมของงาน (${currentMax})`,
          });
          return;
        }

        const existingBox = packBoxes.find(
          (box: any) =>
            Number(box.box_no) === boxNo && Number(box.box_max) === boxMax,
        );

        if (existingBox) {
          await Swal.fire({
            icon: "warning",
            title: "กล่องนี้มีอยู่แล้ว",
            text: `กล่อง ${boxNo}/${boxMax} ถูกสร้างในงานนี้แล้ว กรุณาใช้ Step 2 สำหรับเปิด/ปิดกล่อง`,
          });
          return;
        }
      }

      const res = await packProductApi.scan(
        scannedBarcode,
        getUserRef() || undefined,
      );

      const data = res?.data?.data;

      if (!data) {
        throw new Error(res?.data?.message || "ไม่พบข้อมูลจาก server");
      }

      applyPackProductData(data, { preserveLocalBox: false });

      if (
        data.current_box &&
        String(data.current_box.status ?? "").toLowerCase() === "open"
      ) {
        setTimeout(() => itemScanRef.current?.focus(), 100);
      }

      const packName = data?.pack_product?.name ?? packProduct?.name ?? "PACK";

      Swal.fire({
        icon: "success",
        title: "สำเร็จ",
        text:
          data.box_action === "closed"
            ? `ปิดกล่อง ${data.current_box?.box_label ?? ""}`
            : `เปิดงาน ${packName} กล่อง ${data.current_box?.box_label ?? ""}`,
        timer: 1200,
        showConfirmButton: false,
      });

      setBarcodeInput("");
      setIsScanActive(false);
    } catch (error: any) {
      Swal.fire({
        icon: "error",
        title: "Scan ไม่สำเร็จ",
        text:
          error?.response?.data?.message || error?.message || "เกิดข้อผิดพลาด",
      });
    }
  };

  const handleCheckboxChange = () => {
    warningAlert("รายการเอกสารถูกควบคุมจาก pack product แล้ว");
  };

  const isLastBox = () => {
    if (!currentPackBoxId) return false;
    const box = packBoxes.find(
      (b) => Number(b.id) === Number(currentPackBoxId),
    );
    if (!box) return false;
    return Number(box.box_no) === Number(box.box_max);
  };

  const hasUnfinishedItems = () => {
    return batchItems.some((it) => (it.pack || 0) < (it.quantity || 0));
  };

  const handleOpenBoxScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const scannedBoxCode = boxOpenScanInput.trim();
    if (!scannedBoxCode) return;

    // ถ้าสแกนรหัสกล่องเดิม = กำลังจะปิดกล่อง → เช็คว่าเป็นกล่องสุดท้ายหรือไม่
    if (
      currentBox &&
      !isBoxClosed &&
      scannedBoxCode === currentBox.box_code &&
      isLastBox() &&
      hasUnfinishedItems()
    ) {
      await Swal.fire({
        icon: "warning",
        title: "ไม่สามารถปิดกล่องสุดท้ายได้",
        text: "สินค้ายังสแกนเข้ากล่องไม่ครบ กรุณาสแกนสินค้าให้ครบก่อนปิดกล่องสุดท้าย",
      });
      setBoxOpenScanInput("");
      return;
    }

    try {
      const res = await packProductApi.scan(
        scannedBoxCode,
        getUserRef() || undefined,
      );
      const data = res.data.data;

      applyPackProductData(data, { preserveLocalBox: false });

      if (
        data.current_box &&
        String(data.current_box.status ?? "").toLowerCase() === "open"
      ) {
        toast.success(
          `เปิดกล่องสำเร็จ: ${data.current_box?.box_label || scannedBoxCode}`,
          { autoClose: 1200 },
        );
        setTimeout(() => itemScanRef.current?.focus(), 100);
      } else {
        toast.success(
          `ปิดกล่องสำเร็จ: ${currentBox?.box_name || scannedBoxCode}`,
          { autoClose: 1200 },
        );
        setTimeout(() => boxOpenScanRef.current?.focus(), 100);
      }

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
    if (!itemScanInput.trim()) return;
    if (!currentBox) {
      warningAlert("ยังไม่มีกล่องที่เปิดอยู่");
      return;
    }
    if (isBoxClosed) {
      warningAlert("กล่องนี้ถูกปิดอยู่");
      return;
    }
    if (!packProduct) {
      warningAlert("ไม่พบข้อมูลงาน pack กรุณา reload หน้า");
      return;
    }
    if (!currentPackBoxId) {
      warningAlert("ไม่พบ box id ของงานปัจจุบัน");
      return;
    }

    const scanned = itemScanInput.trim();

    if (scanned === currentBox.box_code) {
      const currentBoxItemCount = getCurrentOpenedBoxItemCount();

      if (currentBoxItemCount <= 0) {
        await Swal.fire({
          icon: "warning",
          title: "ยังปิดกล่องไม่ได้",
          text: "กล่องนี้ยังไม่มีสินค้า กรุณาสแกนสินค้าเข้ากล่องก่อนปิดกล่อง",
        });
        setItemScanInput("");
        return;
      }

      if (isLastBox() && hasUnfinishedItems()) {
        await Swal.fire({
          icon: "warning",
          title: "ไม่สามารถปิดกล่องสุดท้ายได้",
          text: "สินค้ายังสแกนเข้ากล่องไม่ครบ กรุณาสแกนสินค้าให้ครบก่อนปิดกล่องสุดท้าย",
        });
        setItemScanInput("");
        return;
      }

      try {
        const res = await packProductApi.scan(
          scanned,
          getUserRef() || undefined,
        );
        const data = res.data.data;

        applyPackProductData(data, { preserveLocalBox: false });

        toast.success(
          `ปิดกล่องสำเร็จ: ${data.current_box?.box_label || currentBox.box_name}`,
          { autoClose: 1200 },
        );

        setItemScanInput("");
        setIsOpenBoxScanActive(true);
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

      await reloadPackProductDetail(packProduct.id);
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
      await reloadPackProductDetail(packProduct.id);

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
      await reloadPackProductDetail(packProduct.id);

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

  const handleSaveDraft = async () => {
    setIsSaving(true);
    try {
      await successAlert("ข้อมูลล่าสุดถูกบันทึกแล้ว");
      navigate("/outbound");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!packProduct) {
      warningAlert("ยังไม่มีงาน pack");
      return;
    }

    const user_ref = getUserRef();
    if (!user_ref) {
      warningAlert("ไม่พบชื่อผู้ใช้งาน กรุณา login ใหม่");
      return;
    }

    setIsSubmitting(true);
    try {
      await packProductApi.finalize(packProduct.id, {
        user_ref,
        force: false,
      });

      await successAlert("ยืนยันจัดส่งสำเร็จ");
      navigate("/outbound");
    } catch (error: any) {
      const msg =
        error?.response?.data?.message || "ไม่สามารถยืนยันการจัดส่งได้";

      const isBoxError = msg?.includes("กล่อง");

      const retry = await Swal.fire({
        icon: "warning",
        title: "ยังปิดงานไม่ได้",
        html: `
    <div style="text-align:left">
      <b style="color:${isBoxError ? "#d32f2f" : "#333"}">สาเหตุ:</b><br/>
      ${msg}<br/><br/>
      ${isBoxError ? "👉 กรุณาปิดกล่องให้ครบก่อน หรือเลือกข้าม" : ""}
    </div>
  `,
        showCancelButton: true,
        confirmButtonText: "ข้ามและจัดส่ง",
        cancelButtonText: "ยกเลิก",
      });

      if (retry.isConfirmed) {
        await packProductApi.finalize(packProduct.id, {
          user_ref,
          force: true,
        });

        await successAlert("ข้ามและจัดส่งสำเร็จ");
        navigate("/outbound");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="scanbox-container">
      <div className="scanbox-header">
        <h3>Step 1 : Scan Invoice / Prefix กล่อง</h3>
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
                  placeholder="สแกน BO26-02985, 1576665_ 1/28"
                  className="scanbox-barcode-input"
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
                        onChange={() => handleCheckboxChange()}
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

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, padding: "0 20px" }}>
              <div className="groupOrder-view-tabs" style={{ marginTop: 0 }}>
                {!isReadOnly && (
                  <button
                    type="button"
                    className={`groupOrder-tab ${viewMode === "pending" ? "active" : ""}`}
                    onClick={() => setViewMode("pending")}
                  >
                    กำลังดำเนินการ{" "}
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

              {boxFilterOptions.length > 0 && (
                <div className="filter-wrap" style={{ position: "relative" }}>
                  <button
                    type="button"
                    className="filter-btn"
                    onClick={() => setShowBoxFilterDropdown((v) => !v)}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    <i className="fa fa-box"></i>{" "}
                    {selectedBoxFilter === "all"
                      ? "ทุกกล่อง"
                      : selectedBoxFilter === "none"
                        ? "ยังไม่มีกล่อง"
                        : boxFilterOptions.find((b) => String(b.id) === selectedBoxFilter)?.box_label ?? "กล่อง"}
                    <i className="fa fa-chevron-down" style={{ marginLeft: 6 }} />
                  </button>
                  {showBoxFilterDropdown && (
                    <div className="filter-dropdown-2" style={{ right: 0, left: "auto", minWidth: 180 }}>
                      <div className="filter-title">
                        Filter ตามกล่อง
                        <button
                          type="button"
                          className="filter-clear-btn"
                          onClick={() => {
                            setSelectedBoxFilter("all");
                            setShowBoxFilterDropdown(false);
                          }}
                        >
                          <i className="fa fa-xmark"></i>
                        </button>
                      </div>
                      <label
                        className="filter-option"
                        style={{ cursor: "pointer" }}
                        onClick={() => {
                          setSelectedBoxFilter("all");
                          setShowBoxFilterDropdown(false);
                        }}
                      >
                        <input
                          type="radio"
                          checked={selectedBoxFilter === "all"}
                          readOnly
                        />
                        <span>ทุกกล่อง</span>
                      </label>
                      <label
                        className="filter-option"
                        style={{ cursor: "pointer" }}
                        onClick={() => {
                          setSelectedBoxFilter("none");
                          setShowBoxFilterDropdown(false);
                        }}
                      >
                        <input
                          type="radio"
                          checked={selectedBoxFilter === "none"}
                          readOnly
                        />
                        <span>ยังไม่มีกล่อง</span>
                      </label>
                      {boxFilterOptions.map((box) => (
                        <label
                          className="filter-option"
                          key={box.id}
                          style={{ cursor: "pointer" }}
                          onClick={() => {
                            setSelectedBoxFilter(String(box.id));
                            setShowBoxFilterDropdown(false);
                          }}
                        >
                          <input
                            type="radio"
                            checked={selectedBoxFilter === String(box.id)}
                            readOnly
                          />
                          <span>{box.box_label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

          <div className="batch-panel">
            <div className="batch-table-container">
              <table className="batch-table">
                <thead>
                  <tr>
                    <th>No.</th>
                    <th
                      style={{ cursor: "pointer", userSelect: "none" }}
                      onClick={toggleSortCode}
                    >
                      สินค้า{" "}
                      {sortCodeDir === "asc" ? (
                        <i className="fa-solid fa-sort-up" />
                      ) : sortCodeDir === "desc" ? (
                        <i className="fa-solid fa-sort-down" />
                      ) : (
                        <i
                          className="fa-solid fa-sort"
                          style={{ opacity: 0.35 }}
                        />
                      )}
                    </th>
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
                        key={`${item.goods_out_id}-${item.code}-${item.lot_name}-${originalIndex}`}
                        className={rowClass}
                      >
                        <td>{index + 1}</td>
                        <td>{item.code || "-"}</td>
                        <td>{item.name || "-"}</td>
                        <td>{item.lot_name || "-"}</td>
                        <td className="qty-cell">{item.quantity || 0}</td>
                        <td className="qty-cell">{item.pick || 0}</td>
                        <td className="qty-cell">{item.pack || 0}</td>
                        <td>
                          {item.box_name
                            ? item.box_name.split(",").map((b, i) => (
                                <span key={i}>
                                  {i > 0 && <br />}
                                  {b.trim()}
                                </span>
                              ))
                            : "-"}
                        </td>

                        {!isReadOnly && (
                          <td className="groupOrder-action-buttons">
                            {(() => {
                              const itemIndex = originalIndex;
                              const rowId = getRowIdByIndex(itemIndex);

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
              {isReadOnly ? "กลับ" : "ย้อนกลับ"}
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
