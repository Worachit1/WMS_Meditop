import React, { useEffect, useMemo, useRef, useState } from "react";
import Select from "react-select";
import "./add_borrow_stock.css";
import CameraScanner from "./CameraScanner";
import {
  borrowStockApi,
  locationApi,
  type BorrowLocationOption,
} from "../../services/borrow_stock.api";
import { departmentApi } from "../../../department/services/department.api";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import { confirmAlert } from "../../../../utils/alert";

import type { ScanBarcodePreviewResponse } from "../../types/borrow_stock.type";
import { formatDateTime } from "../../../../components/Datetime/FormatDateTime";

type DepartmentOption = {
  id: number;
  short_name: string;
};

type SelectOption = {
  value: number;
  label: string;
  raw: DepartmentOption;
};

type LocationSelectOption = {
  value: string;
  label: string;
  raw: BorrowLocationOption;
};

type DraftItem = {
  code: string;
  name: string | null;
  lot_serial: string;
  expiration_date: string | null;
  system_qty: number;
  executed_qty: number;
  scanned: boolean;
  barcode_text?: string | null;
  barcode?: string | null;

  // ✅ เพิ่ม
  is_outside_location?: boolean;
  row_style?: "warning-yellow" | "normal" | string;
  allow_manual_executed_qty?: boolean;
  outside_source_location_name?: string | null;
  outside_source_qty?: number | null;
};

function normalizeScanText(v: unknown) {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[-/]/g, "")
    .toLowerCase();
}

function itemKey(
  it: Pick<DraftItem, "code" | "lot_serial" | "expiration_date"> & {
    is_outside_location?: boolean;
  },
) {
  return `${it.code}__${it.lot_serial}__${it.expiration_date ?? ""}__${it.is_outside_location ? "outside" : "normal"}`;
}

function getUserDepartmentsFromStorage() {
  try {
    const raw = localStorage.getItem("departments");
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function getUserLevelFromStorage() {
  return String(localStorage.getItem("user_level") ?? "")
    .trim()
    .toLowerCase();
}

function hasGlobalDepartmentAccess() {
  const userLevel = getUserLevelFromStorage();
  if (userLevel === "admin") return true;

  const userDepartments = getUserDepartmentsFromStorage();

  return userDepartments.some(
    (d: any) =>
      String(d?.short_name ?? "")
        .trim()
        .toUpperCase() === "CNE",
  );
}

function isMatchedBarcode(item: DraftItem, scannedText: string) {
  const q = normalizeScanText(scannedText);
  if (!q) return false;

  const candidates = [
    item.code,
    item.lot_serial,
    item.name ?? "",
    item.barcode_text ?? "",
    item.barcode ?? "",
  ]
    .map((x) => normalizeScanText(x))
    .filter(Boolean);

  return candidates.some((x) => x === q || x.includes(q) || q.includes(x));
}

function isOutsideRow(item: DraftItem) {
  return Boolean(item.is_outside_location);
}

function isGlobalDepartmentOption(opt: SelectOption) {
  return (
    String(opt.raw.short_name ?? "")
      .trim()
      .toUpperCase() === "CNE"
  );
}

function isGlobalDepartmentsSelected(departments: SelectOption[]) {
  return departments.some((d) => isGlobalDepartmentOption(d));
}

const AddBorrowStock: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const [_locationFullName, setLocationFullName] = useState("");
  const [lockedLocation, setLockedLocation] = useState<{
    id: number;
    name: string;
  } | null>(null);

  const [locationOptions, setLocationOptions] = useState<
    LocationSelectOption[]
  >([]);
  const [locationOpt, setLocationOpt] = useState<LocationSelectOption | null>(
    null,
  );
  const [locationLoading, setLocationLoading] = useState(false);

  const [barcodeText, setBarcodeText] = useState("");

  const [selectedDepartments, setSelectedDepartments] = useState<
    SelectOption[]
  >([]);

  const [deptOptions, setDeptOptions] = useState<SelectOption[]>([]);
  const [deptLoading, setDeptLoading] = useState(false);

  const [remark, _setRemark] = useState("");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [skuFilter, setSkuFilter] = useState("");

  const [openScanBarcodeCam, setOpenScanBarcodeCam] = useState(false);

  const barcodeRef = useRef<HTMLInputElement | null>(null);
  const draftItemsRef = useRef<DraftItem[]>([]);

  useEffect(() => {
    draftItemsRef.current = draftItems;
  }, [draftItems]);

  useEffect(() => {
    setTimeout(() => barcodeRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    const loadDepartments = async () => {
      setDeptLoading(true);

      try {
        const res = await departmentApi.getAll();

        const raw = res?.data;
        const list: any[] = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.data)
            ? raw.data
            : Array.isArray(raw?.departments)
              ? raw.departments
              : [];

        const allOpts: SelectOption[] = list
          .filter((d) => Number(d?.id) > 0)
          .map((d) => ({
            value: Number(d.id),
            label: String(
              d?.short_name ?? d?.full_name ?? `Dept ${d?.id ?? ""}`,
            ),
            raw: {
              id: Number(d.id),
              short_name: String(d?.short_name ?? ""),
            },
          }))
          .sort((a, b) => a.label.localeCompare(b.label));

        const userDepartments = getUserDepartmentsFromStorage();
        const allowedIds = userDepartments.map((d: any) => Number(d.id));

        const canAccessAllDepartments = hasGlobalDepartmentAccess();

        const filteredOpts: SelectOption[] = canAccessAllDepartments
          ? allOpts
          : allOpts.filter((opt: SelectOption) =>
              allowedIds.includes(opt.value),
            );

        const allOption: SelectOption = {
          value: 0,
          label: "ทั้งหมด",
          raw: {
            id: 0,
            short_name: "ALL",
          },
        };

        const finalOptions: SelectOption[] = canAccessAllDepartments
          ? [allOption, ...filteredOpts]
          : filteredOpts;

        setDeptOptions(finalOptions);

        if (!canAccessAllDepartments && filteredOpts.length === 1) {
          const onlyDept = filteredOpts[0];
          setSelectedDepartments([onlyDept]);

          if (lockedLocation) {
            await reloadItems(lockedLocation.name, [onlyDept], false);
          }
        } else {
          setSelectedDepartments([]);
        }
      } catch {
        toast.error("โหลด Department ไม่สำเร็จ");
        setDeptOptions([]);
        setSelectedDepartments([]);
      } finally {
        setDeptLoading(false);
      }
    };

    loadDepartments();
  }, [lockedLocation]);

  useEffect(() => {
    const loadLocations = async () => {
      setLocationLoading(true);
      try {
        const res = await locationApi.getBylockno();
        const raw = res?.data;
        const list: BorrowLocationOption[] = Array.isArray(raw)
          ? raw
          : Array.isArray((raw as any)?.data)
            ? (raw as any).data
            : [];

        const opts: LocationSelectOption[] = list
          .filter((x) => Number(x?.id) > 0 && String(x?.full_name ?? "").trim())
          .map((x) => ({
            value: String(x.full_name),
            label: String(x.full_name),
            raw: x,
          }))
          .sort((a, b) => a.label.localeCompare(b.label, "th"));

        setLocationOptions(opts);
      } catch {
        toast.error("โหลด Location ไม่สำเร็จ");
        setLocationOptions([]);
      } finally {
        setLocationLoading(false);
      }
    };

    loadLocations();
  }, []);

  const canScanBarcode = !!lockedLocation;
  const hasSelectedDepartment = selectedDepartments.length > 0;

  const canConfirm =
    !!lockedLocation &&
    hasSelectedDepartment &&
    draftItems.some((x) => x.scanned) &&
    !loading;

  const filteredItems = useMemo(() => {
    const q = skuFilter.trim().toLowerCase();

    const base = !q
      ? draftItems
      : draftItems.filter((it) => {
          return (
            it.code.toLowerCase().includes(q) ||
            String(it.name ?? "")
              .toLowerCase()
              .includes(q) ||
            String(it.lot_serial ?? "")
              .toLowerCase()
              .includes(q) ||
            String(it.barcode_text ?? "")
              .toLowerCase()
              .includes(q) ||
            String(it.barcode ?? "")
              .toLowerCase()
              .includes(q)
          );
        });

    const normalItems = base.filter((it) => !it.is_outside_location);
    const outsideItems = base.filter((it) => it.is_outside_location);

    return [...normalItems, ...outsideItems];
  }, [draftItems, skuFilter]);

  const appendOutsideScannedItem = (preview: ScanBarcodePreviewResponse) => {
    const nextItem: DraftItem = {
      code: String(preview.item.code ?? ""),
      name: preview.item.name ?? null,
      lot_serial: String(preview.item.lot_serial ?? ""),
      expiration_date: preview.item.expiration_date ?? null,
      system_qty: 0,
      executed_qty:
        Number(preview.item.executed_qty ?? 0) > 0
          ? Number(preview.item.executed_qty)
          : 1,
      scanned: true,
      barcode_text:
        preview.scanned?.barcode_text ?? preview.goods_in?.barcode_text ?? null,
      barcode:
        preview.scanned?.payload ?? preview.scanned?.barcode_text ?? null,
      is_outside_location: true,
      row_style: preview.row_style ?? "warning-yellow",
      allow_manual_executed_qty: true,
      outside_source_location_name:
        preview.suggested_stock_source?.location_name ?? null,
      outside_source_qty: Number(preview.suggested_stock_source?.qty ?? 0) || 0,
    };

    const newKey = itemKey(nextItem);

    setDraftItems((prev) => {
      const existingIndex = prev.findIndex(
        (x) => itemKey(x) === newKey && Boolean(x.is_outside_location),
      );

      if (existingIndex >= 0) {
        const cloned = [...prev];
        const current = cloned[existingIndex];
        cloned[existingIndex] = {
          ...current,
          scanned: true,
          executed_qty: Number(current.executed_qty ?? 0) + 1,
        };
        return cloned;
      }

      return [...prev, nextItem];
    });
  };

  const isAllDepartmentsSelected = (departments: SelectOption[]) =>
    departments.some((d) => d.value === 0);

  const loadItemsByLocationAndDepartments = async (
    locName: string,
    departments: SelectOption[],
  ) => {
    const isGlobal =
      isGlobalDepartmentsSelected(departments) ||
      isAllDepartmentsSelected(departments);

    const res = await borrowStockApi.getItemsByLocation({
      location_name: locName,
      department_ids: isGlobal ? undefined : departments.map((d) => d.value),
      all_departments: isGlobal,
    });

    const raw = res?.data;
    const list: any[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.data)
        ? raw.data
        : Array.isArray(raw?.items)
          ? raw.items
          : [];

    const nextItems: DraftItem[] = list.map((it: any) => ({
      code: String(it.code ?? ""),
      name: it.name ?? null,
      lot_serial: String(it.lot_serial ?? ""),
      expiration_date: it.expiration_date ?? null,
      system_qty: Number(it.system_qty ?? 0),
      executed_qty: 0,
      scanned: false,
      barcode_text: it.barcode_text ?? it.barcode ?? null,
      barcode: it.barcode ?? null,
    }));

    setDraftItems(nextItems);
    return nextItems;
  };

  const reloadItems = async (
    locName: string,
    departments: SelectOption[],
    showToast = false,
  ) => {
    if (!locName || departments.length === 0) {
      setDraftItems([]);
      return;
    }

    setLoading(true);
    try {
      const nextItems = await loadItemsByLocationAndDepartments(
        locName,
        departments,
      );

      if (showToast) {
        if (nextItems.length === 0) {
          toast.warning("ไม่พบรายการในเงื่อนไขที่เลือก");
        }
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.message || err?.message || "โหลดรายการไม่สำเร็จ";
      toast.error(msg);
      setDraftItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDepartmentChange = async (
    opts: readonly SelectOption[] | null,
  ) => {
    const next = Array.isArray(opts) ? [...opts] : [];

    let finalDepartments: SelectOption[] = [];

    const allOpt = next.find((x) => x.value === 0);
    const globalOpt = next.find((x) => isGlobalDepartmentOption(x));

    if (allOpt) {
      finalDepartments = [allOpt];
    } else if (globalOpt) {
      finalDepartments = [globalOpt];
    } else {
      finalDepartments = next;
    }

    if (
      draftItemsRef.current.some((x) => x.scanned || x.executed_qty > 0) &&
      lockedLocation
    ) {
      const result = await confirmAlert(
        "ต้องการเปลี่ยน Department และล้างรายการที่สแกนแล้วใช่ไหม?",
      );
      if (!result.isConfirmed) return;
    }

    setSelectedDepartments(finalDepartments);
    setDraftItems([]);

    if (lockedLocation && finalDepartments.length > 0) {
      await reloadItems(lockedLocation.name, finalDepartments, true);
    }
  };

  const tryScanOutsideLocation = async (rawScannedText: string) => {
    if (!lockedLocation) return;

    if (selectedDepartments.length === 0) {
      toast.warning("กรุณาเลือก Department ก่อน");
      return;
    }

    try {
      const isAll =
        isAllDepartmentsSelected(selectedDepartments) ||
        isGlobalDepartmentsSelected(selectedDepartments);

      const res = await borrowStockApi.scanBarcodePreview({
        barcode: rawScannedText,
        location_full_name: lockedLocation.name,
        allow_outside_location: true,
        department_ids: isAll ? [] : selectedDepartments.map((d) => d.value),
        all_departments: isAll,
      });

      const preview = res?.data;

      if (!preview?.item?.code) {
        toast.warning("ไม่พบข้อมูลสินค้านี้ใน WMS");
        return;
      }

      appendOutsideScannedItem(preview);

      toast.warning(
        preview?.suggested_stock_source?.location_name
          ? `พบสินค้านอก Location ปัจจุบัน จาก ${preview.suggested_stock_source.location_name}`
          : "พบสินค้านอก Location ปัจจุบัน",
      );
    } catch (err: any) {
      const msg =
        err?.response?.data?.message || err?.message || "ไม่พบสินค้านี้ใน WMS";
      toast.error(msg);
    }
  };

  const handleSelectLocation = async (opt: LocationSelectOption | null) => {
    if (!opt) {
      setLocationOpt(null);
      setLocationFullName("");
      setLockedLocation(null);
      setDraftItems([]);
      return;
    }

    if (draftItemsRef.current.some((x) => x.scanned || x.executed_qty > 0)) {
      const result = await confirmAlert(
        "ต้องการเปลี่ยน Location และล้างรายการที่สแกนแล้วใช่ไหม?",
      );
      if (!result.isConfirmed) return;
    }

    const fullName = String(opt.raw.full_name ?? opt.label ?? "").trim();

    setLocationOpt(opt);
    setLocationFullName(fullName);
    setLockedLocation({
      id: Number(opt.raw.id),
      name: fullName,
    });

    await reloadItems(fullName, selectedDepartments, true);

    setTimeout(() => {
      barcodeRef.current?.focus();
      barcodeRef.current?.select?.();
    }, 50);
  };

  const handleScanBarcode = async (rawText?: string) => {
    if (!lockedLocation) {
      toast.warning("กรุณาเลือก Location ก่อน");
      return;
    }

    const bc = normalizeScanText(rawText ?? barcodeText);
    if (!bc) return;

    const matchedItem = draftItemsRef.current.find((item) =>
      isMatchedBarcode(item, bc),
    );

    // =========================
    // 1) ไม่พบในลิสต์ location ปัจจุบัน
    // =========================
    if (!matchedItem) {
      const result = await confirmAlert(
        `ไม่พบรายการนี้ใน Location ที่เลือก\nต้องการสแกนสินค้าจากที่อื่นใช่ไหม?`,
      );

      if (result.isConfirmed) {
        await tryScanOutsideLocation(rawText ?? barcodeText);
      } else {
        toast.warning(
          `ไม่พบรายการนี้ใน Location ที่เลือก (${rawText ?? barcodeText})`,
        );
      }

      setBarcodeText("");
      setTimeout(() => {
        barcodeRef.current?.focus();
        barcodeRef.current?.select?.();
      }, 30);
      return;
    }

    // =========================
    // 2) เป็น row นอก location อยู่แล้ว
    //    ให้เพิ่ม qty ได้เลย เพราะเป็น exception
    // =========================
    if (isOutsideRow(matchedItem)) {
      const targetKey = itemKey(matchedItem);

      setDraftItems((prev) => {
        const idx = prev.findIndex((item) => itemKey(item) === targetKey);
        if (idx === -1) return prev;

        const current = prev[idx];
        const updated: DraftItem = {
          ...current,
          scanned: true,
          executed_qty: Number(current.executed_qty ?? 0) + 1,
        };

        const cloned = [...prev];
        cloned[idx] = updated;
        return cloned;
      });

      setBarcodeText("");
      setTimeout(() => {
        barcodeRef.current?.focus();
        barcodeRef.current?.select?.();
      }, 30);
      return;
    }

    // =========================
    // 3) เจอในลิสต์ แต่จำนวนครบแล้ว
    // =========================
    if (matchedItem.executed_qty >= matchedItem.system_qty) {
      const result = await confirmAlert(
        `จำนวนครบตาม System QTY แล้ว\nต้องการสแกนสินค้าจากที่อื่นใช่ไหม?`,
      );

      if (result.isConfirmed) {
        await tryScanOutsideLocation(rawText ?? barcodeText);
      } else {
        toast.warning(`จำนวนเกิน System QTY ของ ${matchedItem.code}`);
      }

      setBarcodeText("");
      setTimeout(() => {
        barcodeRef.current?.focus();
        barcodeRef.current?.select?.();
      }, 30);
      return;
    }

    // =========================
    // 4) scan ปกติใน location เดิม
    // =========================
    const targetKey = itemKey(matchedItem);

    setDraftItems((prev) => {
      const idx = prev.findIndex((item) => itemKey(item) === targetKey);
      if (idx === -1) return prev;

      const current = prev[idx];
      const nextExecuted =
        current.scanned && current.executed_qty > 0
          ? Math.min(current.executed_qty + 1, current.system_qty)
          : 1;

      const updated: DraftItem = {
        ...current,
        scanned: true,
        executed_qty: nextExecuted,
      };

      const cloned = [...prev];
      cloned.splice(idx, 1);

      return [updated, ...cloned];
    });

    setBarcodeText("");

    setTimeout(() => {
      barcodeRef.current?.focus();
      barcodeRef.current?.select?.();
    }, 30);
  };

  const updateExecutedQtyByKey = (key: string, value: string) => {
    const n = Number(value);
    const safe = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;

    setDraftItems((prev) =>
      prev.map((item) => {
        if (itemKey(item) !== key || !item.scanned) return item;

        if (item.allow_manual_executed_qty || item.is_outside_location) {
          return {
            ...item,
            executed_qty: safe,
          };
        }

        return {
          ...item,
          executed_qty: Math.min(safe, item.system_qty),
        };
      }),
    );
  };

  const deleteDraftItemByKey = async (key: string) => {
    const result = await confirmAlert("ลบรายการนี้?");
    if (!result.isConfirmed) return;

    setDraftItems((prev) =>
      prev.map((item) =>
        itemKey(item) === key
          ? { ...item, scanned: false, executed_qty: 0 }
          : item,
      ),
    );
  };

  const handleConfirm = async () => {
    if (!lockedLocation) return alert("กรุณาเลือก Location ก่อน");
    if (selectedDepartments.length === 0) return alert("กรุณาเลือก Department");
    if (draftItems.length === 0) return alert("ไม่มีรายการ");

    const scannedItems = draftItemsRef.current.filter((x) => x.scanned);
    if (scannedItems.length === 0) {
      return alert("กรุณาสแกนรายการอย่างน้อย 1 รายการ");
    }

    const confirmResult = await confirmAlert("ยืนยันการสร้าง Borrow Stock?");
    if (!confirmResult.isConfirmed) return;

    const isAll =
      isAllDepartmentsSelected(selectedDepartments) ||
      isGlobalDepartmentsSelected(selectedDepartments);

    setLoading(true);
    try {
      await borrowStockApi.start({
        location_full_name: lockedLocation.name,
        department_ids: isAll ? [] : selectedDepartments.map((d) => d.value),
        all_departments: isAll,
        remark: remark ?? null,
        items: scannedItems.map((x) => ({
          code: x.code,
          name: x.name,
          lot_serial: x.lot_serial,
          expiration_date: x.expiration_date,
          system_qty: x.system_qty,
          executed_qty: x.executed_qty,
          is_outside_location: Boolean(x.is_outside_location),
        })),
      });

      toast.success("เริ่มต้น Borrow Stock เรียบร้อยแล้ว");
      navigate("/borrow_stock");
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "สร้าง Borrow Stock ไม่สำเร็จ";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div className="page-title">ADD Borrow Stock - Count</div>
      </div>

      <div className="add_borrow_stock_page">
        <div className="add_borrow_stock_page__card">
          <div className="add_borrow_stock_page__body">
            <div className="add_borrow_stock-form">
              <div className="add_borrow_stock-row">
                <label className="add_borrow_stock-label">Location</label>

                <div
                  className="add_borrow_stock-inputwrap"
                  style={{ display: "block" }}
                >
                  <Select
                    classNamePrefix="rs"
                    isSearchable={true}
                    isClearable={true}
                    isDisabled={loading || locationLoading}
                    isLoading={locationLoading}
                    placeholder="Select Location"
                    options={locationOptions}
                    value={locationOpt}
                    onChange={(opt) =>
                      handleSelectLocation(
                        (opt as LocationSelectOption | null) ?? null,
                      )
                    }
                    noOptionsMessage={() => "ไม่พบ Location"}
                    menuPortalTarget={document.body}
                    menuPosition="fixed"
                    styles={{
                      menuPortal: (base) => ({ ...base, zIndex: 99999 }),
                      menu: (base) => ({ ...base, zIndex: 99999 }),
                    }}
                  />
                </div>
              </div>

              <div className="add_borrow_stock-row">
                <label className="add_borrow_stock-label">Department</label>

                <div
                  className="add_borrow_stock-inputwrap"
                  style={{ display: "block" }}
                >
                  <Select
                    classNamePrefix="rs"
                    isMulti
                    isSearchable={true}
                    isClearable={true}
                    isDisabled={
                      deptLoading ||
                      loading ||
                      (!hasGlobalDepartmentAccess() && deptOptions.length === 1)
                    }
                    isLoading={deptLoading}
                    placeholder="เลือก Department"
                    options={deptOptions}
                    value={selectedDepartments}
                    getOptionLabel={(o) => o.label}
                    getOptionValue={(o) => String(o.value)}
                    onChange={(opts) =>
                      handleDepartmentChange(
                        (opts as readonly SelectOption[] | null) ?? null,
                      )
                    }
                    noOptionsMessage={() => "ไม่พบ Department"}
                    menuPortalTarget={document.body}
                    menuPosition="fixed"
                    styles={{
                      menuPortal: (base) => ({ ...base, zIndex: 99999 }),
                      menu: (base) => ({ ...base, zIndex: 99999 }),
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="add_borrow_stock-toolbar-sticky">
              <div className="add_borrow_stock-toolbar">
                <div className="add_borrow_stock-toolbar-col">
                  <label className="add_borrow_stock-toolbar-label">
                    Filter Product
                  </label>
                  <input
                    className="add_borrow_stock-filterinput"
                    placeholder="Filter SKU"
                    value={skuFilter}
                    onChange={(e) => setSkuFilter(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <div className="add_borrow_stock-toolbar-col add_borrow_stock-toolbar-col-right">
                  <label className="add_borrow_stock-toolbar-label add_borrow_stock-toolbar-label-right">
                    Code / Serial
                  </label>

                  <div className="add_borrow_stock-inputwrap add_borrow_stock-inputwrap-single">
                    <input
                      ref={barcodeRef}
                      className="add_borrow_stock-input"
                      placeholder="Scan Code/Serial"
                      value={barcodeText}
                      onChange={(e) => setBarcodeText(e.target.value)}
                      disabled={loading || !canScanBarcode}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleScanBarcode();
                        }
                      }}
                    />

                    <div className="add_borrow_stock-iconwrap add_borrow_stock-iconwrap-single">
                      <button
                        type="button"
                        className="add_borrow_stock-iconbtn"
                        onClick={() => setOpenScanBarcodeCam(true)}
                        disabled={loading || !canScanBarcode}
                      >
                        <i className="fa fa-qrcode" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <table className="add_borrow_stock-table">
              <thead>
                <tr>
                  <th style={{ width: 70 }}>No</th>
                  <th>สินค้า</th>
                  <th>ชื่อ</th>
                  <th>Lot / Serial</th>
                  <th>Expire Date</th>
                  <th style={{ width: 160 }}>System QTY</th>
                  <th style={{ width: 180 }}>QTY Executed</th>
                  <th style={{ width: 90 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="add_borrow_stock-nodata">
                      {lockedLocation
                        ? "ไม่พบรายการในเงื่อนไขที่เลือก"
                        : "เริ่มจากเลือก Location ก่อน"}
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((it, idx) => {
                    const key = itemKey(it);

                    return (
                      <tr
                        key={key}
                        className={[
                          it.scanned ? "add_borrow_stock-row-scanned" : "",
                          it.is_outside_location
                            ? "add_borrow_stock-row-outside"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        style={it.system_qty === 0 ? { backgroundColor: "#fffbea", color: "#e6ac00" } : undefined}
                      >
                        <td>{idx + 1}</td>
                        <td>
                          <div>{it.code}</div>
                          {it.barcode_text ? (
                            <div style={{ fontSize: 12, opacity: 0.7 }}>
                              Barcode: {it.barcode_text}
                              {it.is_outside_location ? (
                                <div className="add_borrow_stock-outside-text">
                                  สินค้านอก Location ปัจจุบัน
                                  {it.outside_source_location_name
                                    ? ` • พบที่ ${it.outside_source_location_name}`
                                    : ""}
                                  {typeof it.outside_source_qty === "number"
                                    ? ` • stock ${it.outside_source_qty}`
                                    : ""}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </td>
                        <td>{it.name}</td>
                        <td>{it.lot_serial}</td>
                        <td>{it.expiration_date ? formatDateTime(it.expiration_date) : "-"}</td>
                        <td>
                          {it.system_qty}
                        </td>
                        <td>
                          <input
                            className="add_borrow_stock-qtyinput"
                            value={String(it.executed_qty)}
                            disabled={!it.scanned}
                            onChange={(e) =>
                              updateExecutedQtyByKey(key, e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <button
                            className="add_borrow_stock-btn-danger"
                            type="button"
                            onClick={() => deleteDraftItemByKey(key)}
                            disabled={!it.scanned}
                          >
                            <i className="fa fa-trash" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="add_borrow_stock-footer">
            <button
              className="add_borrow_stock-btn add_borrow_stock-btn-ghost"
              onClick={() => navigate("/borrow_stock")}
              disabled={loading}
            >
              Cancel
            </button>

            <button
              className="add_borrow_stock-btn add_borrow_stock-btn-primary"
              onClick={handleConfirm}
              disabled={!canConfirm}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>

      <CameraScanner
        open={openScanBarcodeCam}
        onClose={() => setOpenScanBarcodeCam(false)}
        onDetected={(text) => {
          const scanned = normalizeScanText(text);
          setBarcodeText(scanned);
          setTimeout(() => handleScanBarcode(scanned), 0);
        }}
      />
    </>
  );
};

export default AddBorrowStock;
