import React, { useEffect, useMemo, useRef, useState } from "react";
import Select from "react-select";
import "./editborrow_stock.css";
import CameraScanner from "../addborrow_stock/CameraScanner"; // ✅ ปรับ path ให้ตรงกับของคุณ
import { borrowStockApi } from "../../services/borrow_stock.api";
import { departmentApi } from "../../../department/services/department.api";
import { toast } from "react-toastify";

import { formatDateTime } from "../../../../components/Datetime/FormatDateTime";
type DepartmentOption = { id: number; short_name: string };
type SelectOption = { value: number; label: string; raw: DepartmentOption };

type RowItem = {
  id: number;
  code: string;
  name: string | null;
  lot_serial: string;
  expiration_date: string | null;
  system_qty: number;
  executed_qty: number;
};

type Props = {
  open: boolean;
  borrowStockId: number | null; // ✅ ต้องส่ง doc id มา
  onClose: () => void;
  onSuccess?: () => void;
  onRefresh?: () => void;

  mode?: "edit" | "view"; // ✅ เพิ่ม
};

function normalizeScanText(v: unknown) {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, "");
}

function formatDepartment(dep: any) {
  if (!dep) return "";
  if (typeof dep === "string") return dep;
  return String(dep?.short_name ?? dep?.full_name ?? "").trim();
}

const EditBorrowStockModal: React.FC<Props> = ({
  open,
  borrowStockId,
  onClose,
  onSuccess,
  onRefresh,
  mode = "edit",
}) => {
  const isView = mode === "view"; // ✅
  const [loading, setLoading] = useState(false);
  const [savingItemId, setSavingItemId] = useState<number | null>(null);

  const [locationFullName, setLocationFullName] = useState("");
  const [lockedLocation, setLockedLocation] = useState<{
    id: number;
    name: string;
  } | null>(null);

  // ✅ เพื่อให้หน้าตาเหมือน Add (แต่ใน Edit จะไม่ให้ scan เพิ่มรายการ)
  const [barcodeText, setBarcodeText] = useState("");

  const [departmentId, setDepartmentId] = useState<number | "">("");
  const [departmentOpt, setDepartmentOpt] = useState<SelectOption | null>(null);
  const [deptOptions, setDeptOptions] = useState<SelectOption[]>([]);
  const [deptLoading, setDeptLoading] = useState(false);

  const [remark, setRemark] = useState("");
  const [items, setItems] = useState<RowItem[]>([]);
  const [skuFilter, setSkuFilter] = useState("");

  const [openScanLocationCam, setOpenScanLocationCam] = useState(false);
  const [openScanBarcodeCam, setOpenScanBarcodeCam] = useState(false);

  const locationRef = useRef<HTMLInputElement | null>(null);
  const barcodeRef = useRef<HTMLInputElement | null>(null);

  // ================================
  // Reset (เมื่อเปิด/ปิด)
  // ================================
  useEffect(() => {
    if (!open) return;

    setLoading(false);
    setSavingItemId(null);

    setLocationFullName("");
    setLockedLocation(null);

    setBarcodeText("");

    setDepartmentId("");
    setDepartmentOpt(null);

    setRemark("");
    setItems([]);
    setSkuFilter("");

    setOpenScanLocationCam(false);
    setOpenScanBarcodeCam(false);

    setTimeout(() => locationRef.current?.focus(), 50);
  }, [open]);

  // ================================
  // Load Departments (ไว้แสดง dropdown เหมือน Add)
  // ================================
  useEffect(() => {
    if (!open) return;

    const load = async () => {
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

        const opts: SelectOption[] = list
          .filter((d) => Number(d?.id) > 0)
          .map((d) => ({
            value: Number(d.id),
            label: String(
              d?.short_name ?? d?.full_name ?? `Dept ${d?.id ?? ""}`,
            ),
            raw: { id: Number(d.id), short_name: String(d?.short_name ?? "") },
          }))
          .sort((a, b) => a.label.localeCompare(b.label));

        setDeptOptions(opts);
      } catch (e) {
        toast.error("โหลด Department ไม่สำเร็จ");
        setDeptOptions([]);
      } finally {
        setDeptLoading(false);
      }
    };

    load();
  }, [open]);

  // ================================
  // Load Borrow Stock by id
  // ================================
  useEffect(() => {
    if (!open) return;
    if (!borrowStockId) return;

    const loadDoc = async () => {
      setLoading(true);
      try {
        const res = await borrowStockApi.getById(String(borrowStockId));

        // ✅ รองรับหลาย shape ของ response
        const raw = res?.data as any;
        const doc =
          raw?.doc ??
          raw?.data ??
          raw?.borrow_stock ??
          (Array.isArray(raw?.data) ? raw?.data?.[0] : raw);

        if (!doc) {
          toast.error("ไม่พบเอกสาร Borrow Stock");
          onClose();
          return;
        }

        // location
        const locName = String(
          doc?.location_name ?? doc?.location_full_name ?? "",
        ).trim();
        const locId = Number(doc?.location_id ?? doc?.location?.id ?? 0) || 0;

        setLockedLocation(locName ? { id: locId, name: locName } : null);
        setLocationFullName(locName);

        // department
        const depId =
          Number(doc?.department_id ?? doc?.department?.id ?? 0) || 0;
        const depLabel =
          String(
            doc?.department?.short_name ?? doc?.department?.full_name ?? "",
          ).trim() || formatDepartment(doc?.department);

        if (depId) {
          setDepartmentId(depId);
          // ถ้ามี options แล้วจะ setOpt ให้ match; ถ้า options ยังไม่มา จะ set แบบ manual ไปก่อน
          setDepartmentOpt({
            value: depId,
            label: depLabel || `Dept ${depId}`,
            raw: { id: depId, short_name: depLabel },
          });
        }

        // remark (ถ้ามี)
        setRemark(String(doc?.remark ?? ""));

        // items
        const rawItems: any[] = (doc?.items ??
          doc?.borrow_stock_items ??
          doc?.details ??
          []) as any[];
        const mapped: RowItem[] = (Array.isArray(rawItems) ? rawItems : []).map(
          (it) => ({
            id: Number(it?.id ?? it?.item_id ?? 0) || 0,
            code: String(it?.code ?? it?.product_code ?? ""),
            name: it?.name ?? it?.product_name ?? null,
            lot_serial: String(it?.lot_serial ?? it?.lot_name ?? ""),
            expiration_date: it?.expiration_date ?? null,
            system_qty: Number(it?.system_qty ?? it?.quantity ?? 0) || 0,
            executed_qty:
              Number(it?.executed_qty ?? it?.qty_executed ?? 0) || 0,
          }),
        );

        setItems(mapped);
      } catch (e: any) {
        const msg = e?.response?.data?.message || "โหลดเอกสารไม่สำเร็จ";
        toast.error(msg);
        onClose();
      } finally {
        setLoading(false);
      }
    };

    loadDoc();
  }, [open, borrowStockId, onClose]);

  // ✅ ถ้า deptOptions มาแล้ว ให้ sync departmentOpt ให้ตรง options
  useEffect(() => {
    if (!open) return;
    if (!departmentId) return;
    if (!deptOptions.length) return;

    const found = deptOptions.find((x) => x.value === Number(departmentId));
    if (found) setDepartmentOpt(found);
  }, [open, departmentId, deptOptions]);

  const filteredItems = useMemo(() => {
    const q = skuFilter.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.code.toLowerCase().includes(q));
  }, [items, skuFilter]);

  // ================================
  // Edit qty executed (local state)
  // ================================
  const updateExecutedQtyLocal = (idx: number, value: string) => {
    const n = Number(value);
    const safe = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;

    setItems((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], executed_qty: safe };
      return copy;
    });
  };

  // ================================
  // Save 1 item (PATCH)
  // ================================
  const handleSaveItem = async (row: RowItem) => {
    if (!borrowStockId) return;
    if (!row?.id) return;

    if (savingItemId) return;
    setSavingItemId(row.id);

    try {
      await borrowStockApi.updateItem(borrowStockId, row.id, {
        executed_qty: row.executed_qty,
      } as any);

      toast.success("บันทึกรายการแล้ว");
      //   onSuccess?.();
      onRefresh?.();
    } catch (e: any) {
      const msg = e?.response?.data?.message || "บันทึกไม่สำเร็จ";
      toast.error(msg);
    } finally {
      setSavingItemId(null);
    }
  };

  // ================================
  // Delete item (optional)
  // ================================
  const handleDeleteItem = async (row: RowItem) => {
    if (!borrowStockId) return;
    if (!row?.id) return;
    const ok = confirm("ลบรายการนี้?");
    if (!ok) return;

    try {
      await borrowStockApi.deleteItem(borrowStockId, row.id);
      setItems((prev) => prev.filter((x) => x.id !== row.id));
      toast.success("ลบรายการแล้ว");
      onSuccess?.();
    } catch (e: any) {
      const msg = e?.response?.data?.message || "ลบไม่สำเร็จ";
      toast.error(msg);
    }
  };

  // ================================
  // Scan actions (disabled in Edit)
  // ================================
  const canScanLocation = false; // Edit: กันเปลี่ยน location
  const canScanBarcode = false; // Edit: กันเพิ่มรายการ (ยังไม่มี API add)

  const handleScanLocation = async () => {
    toast.info("หน้า Edit ยังไม่รองรับเปลี่ยน Location");
  };

  const handleScanBarcode = async () => {
    const bc = normalizeScanText(barcodeText);
    if (!bc) return;
    toast.info("หน้า Edit ยังไม่รองรับเพิ่มรายการด้วยการสแกน");
  };

  if (!open) return null;

  return (
    <div className="editborrow_backdrop" role="dialog" aria-modal="true">
      <div className="editborrow_modal">
        <div className="editborrow_header">
          <div className="editborrow_title">
            {isView ? "Borrow Stock Detail" : "Edit Borrow Stock"}
          </div>

          <button
            className="editborrow_close"
            onClick={onClose}
            type="button"
            disabled={loading}
          >
            ✕
          </button>
        </div>

        <div className="editborrow_body">
          {/* FORM */}
          <div className="editborrow_form">
            {/* Location */}
            <div className="editborrow_row">
              <label className="editborrow_label">Location</label>

              <div className="editborrow_inputwrap">
                <input
                  ref={locationRef}
                  className="editborrow_input"
                  placeholder="Scan Location"
                  value={locationFullName}
                  onChange={(e) => setLocationFullName(e.target.value)}
                  disabled={true} // ✅ lock เหมือน add ตอนล็อคแล้ว
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleScanLocation();
                    }
                  }}
                />

                <div className="editborrow_iconwrap">
                  <button
                    type="button"
                    className="editborrow_iconbtn"
                    onClick={() => setOpenScanLocationCam(true)}
                    disabled={!canScanLocation || loading}
                    title="(Disabled) Edit ยังไม่รองรับเปลี่ยน Location"
                  >
                    <i className="fa fa-qrcode" />
                  </button>

                  {lockedLocation && (
                    <button
                      type="button"
                      className="editborrow_iconbtn editborrow_iconbtn_warn"
                      onClick={() =>
                        toast.info("หน้า Edit ยังไม่รองรับปลดล็อค Location")
                      }
                      disabled
                      title="(Disabled)"
                    >
                      ↺
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Barcode */}
            <div className="editborrow_row">
              <label className="editborrow_label">Code / Serial</label>

              <div className="editborrow_inputwrap">
                <input
                  ref={barcodeRef}
                  className="editborrow_input"
                  placeholder="Scan Code/Serial"
                  value={barcodeText}
                  onChange={(e) => setBarcodeText(e.target.value)}
                  disabled={true} // ✅ กัน add item
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleScanBarcode();
                    }
                  }}
                />

                <div className="editborrow_iconwrap">
                  <button
                    type="button"
                    className="editborrow_iconbtn"
                    onClick={() => setOpenScanBarcodeCam(true)}
                    disabled={!canScanBarcode || loading}
                    title="(Disabled) Edit ยังไม่รองรับเพิ่มรายการ"
                  >
                    <i className="fa fa-qrcode" />
                  </button>
                </div>
              </div>
            </div>

            {/* Department */}
            <div className="editborrow_row">
              <label className="editborrow_label">Department</label>

              <Select
                classNamePrefix="rs"
                isSearchable
                isClearable={false}
                isDisabled={true} // ✅ กันเปลี่ยน department ใน edit (ตามแนวคิดเหมือน lock)
                isLoading={deptLoading}
                placeholder="Department"
                options={deptOptions}
                value={departmentOpt}
                getOptionLabel={(o) => o.label}
                getOptionValue={(o) => String(o.value)}
                onChange={(opt) => {
                  // disabled อยู่ เลยแทบไม่ถูกเรียก แต่ใส่ไว้ให้ครบ
                  const v = (opt as SelectOption | null) ?? null;
                  setDepartmentOpt(v);
                  setDepartmentId(v ? v.value : "");
                }}
                noOptionsMessage={() => "ไม่พบ Department"}
              />
            </div>

            {/* Remark (แสดงเหมือน Add แต่ยังไม่ส่ง update เพราะไม่มี endpoint ในชุดนี้) */}
            <div className="editborrow_row">
              <label className="editborrow_label">Remark</label>
              <input
                className="editborrow_input"
                placeholder="หมายเหตุ"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                disabled={true}
                title="(Readonly) ยังไม่มี API สำหรับแก้ Remark"
              />
            </div>
          </div>

          {/* TABLE */}
          <div className="editborrow_sectiontitle">Item Verification</div>

          <div className="editborrow_filterrow">
            <input
              className="editborrow_filterinput"
              placeholder="Filter SKU"
              value={skuFilter}
              onChange={(e) => setSkuFilter(e.target.value)}
            />
          </div>

          <div className="editborrow_tablewrap">
            <table className="editborrow_table">
              <thead>
                <tr>
                  <th style={{ width: 70 }}>No</th>
                  <th>SKU</th>
                  <th style={{ width: 160 }}>System QTY</th>
                  <th style={{ width: 180 }}>QTY Executed</th>
                  {!isView && <th style={{ width: 160 }}>Action</th>}
                </tr>
              </thead>

              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={isView ? 4 : 5} className="editborrow_nodata">
                      {loading ? "Loading..." : "ไม่มีรายการ"}
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((it, idx) => {
                    const busy = savingItemId === it.id;

                    return (
                      <tr
                        key={
                          it.id ||
                          `${it.code}-${it.lot_serial}-${it.expiration_date ?? ""}`
                        }
                      >
                        <td>{idx + 1}</td>

                        <td className="editborrow_sku">
                          <div className="editborrow_sku_code">{it.code}</div>
                          {it.name ? (
                            <div className="editborrow_sku_name">{it.name}</div>
                          ) : null}
                          <div className="editborrow_sku_meta">
                            LOT: {it.lot_serial || "-"} | EXP:{" "}
                            {it.expiration_date
                              ? formatDateTime(it.expiration_date)
                              : "-"}
                          </div>
                        </td>

                        <td className="editborrow_center">{it.system_qty}</td>

                        <td>
                          <input
                            className="editborrow_qtyinput"
                            inputMode="numeric"
                            value={String(it.executed_qty ?? 0)}
                            onChange={(e) =>
                              updateExecutedQtyLocal(idx, e.target.value)
                            }
                            disabled={loading || busy || isView} // ✅ เพิ่ม isView
                          />
                        </td>

                        {!isView && ( // ✅ ซ่อนทั้ง td actions
                          <td className="editborrow_center">
                            <div className="editborrow_actions">
                              <button
                                type="button"
                                className="editborrow_btn editborrow_btn_primary"
                                onClick={() => handleSaveItem(it)}
                                disabled={loading || busy}
                                title="Save"
                              >
                                {busy ? "Saving..." : "Save"}
                              </button>

                              <button
                                type="button"
                                className="editborrow_btn editborrow_btn_ghost"
                                onClick={() => handleDeleteItem(it)}
                                disabled={loading || busy}
                                title="Delete"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* FOOTER */}
          <div className="editborrow_footer">
            <button
              className="editborrow_btn editborrow_btn_ghost"
              type="button"
              onClick={onClose}
              disabled={loading}
            >
              Close
            </button>
{/* 
            {!isView && ( // ✅
              <button
                className="editborrow_btn editborrow_btn_primary"
                type="button"
                onClick={() => {
                  toast.info("หน้านี้บันทึกเป็นรายรายการด้วยปุ่ม Save");
                  onSuccess?.();
                }}
                disabled={loading}
              >
                Done
              </button>
            )} */}
          </div>
        </div>
      </div>

      {/* Camera scanners (ไว้ให้ UI เหมือน Add แต่ disabled อยู่) */}
      {!isView && (
        <>
          <CameraScanner
            open={openScanLocationCam}
            onClose={() => setOpenScanLocationCam(false)}
            onDetected={() =>
              toast.info("หน้า Edit ยังไม่รองรับเปลี่ยน Location")
            }
          />
          <CameraScanner
            open={openScanBarcodeCam}
            onClose={() => setOpenScanBarcodeCam(false)}
            onDetected={() =>
              toast.info("หน้า Edit ยังไม่รองรับเพิ่มรายการด้วยการสแกน")
            }
          />
        </>
      )}
    </div>
  );
};

export default EditBorrowStockModal;
