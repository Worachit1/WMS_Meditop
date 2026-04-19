import React, { useEffect, useMemo, useRef, useState } from "react";
import "./edit_borrow_stock_page.css";
import "../addborrow_stock/add_borrow_stock.css";
import CameraScanner from "../addborrow_stock/CameraScanner";
import { borrowStockApi } from "../../services/borrow_stock.api";
import { toast } from "react-toastify";
import { formatDateTime } from "../../../../components/Datetime/FormatDateTime";
import { useNavigate, useParams } from "react-router-dom";
import { confirmAlert } from "../../../../utils/alert";

type RowItem = {
  id: number;
  code: string;
  name: string | null;
  lot_serial: string;
  expiration_date: string | null;
  system_qty: number;
  executed_qty: number;
  barcode_text?: string | null;
  barcode?: string | null;

  is_outside_location?: boolean;
  row_style?: "warning-yellow" | "normal" | string;
  allow_manual_executed_qty?: boolean;
  outside_source_location_name?: string | null;
  outside_source_qty?: number | null;
};

type Props = {
  view?: boolean;
};

function formatDepartment(dep: any) {
  if (!dep) return "";
  if (typeof dep === "string") return dep;
  return String(dep?.short_name ?? dep?.full_name ?? "").trim();
}

function normalizeScanText(v: unknown) {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[-/]/g, "")
    .toLowerCase();
}

// function itemKey(
//   it: Pick<RowItem, "code" | "lot_serial" | "expiration_date"> & {
//     is_outside_location?: boolean;
//   },
// ) {
//   return `${it.code}__${it.lot_serial}__${it.expiration_date ?? ""}__${it.is_outside_location ? "outside" : "normal"}`;
// }

function mapDocItemsToRows(doc: any): RowItem[] {
  const rawItems: any[] = (doc?.items ??
    doc?.borrow_stock_items ??
    doc?.details ??
    []) as any[];

  return (Array.isArray(rawItems) ? rawItems : []).map((it) => ({
    id: Number(it?.id ?? it?.item_id ?? 0) || 0,
    code: String(it?.code ?? it?.product_code ?? ""),
    name: it?.name ?? it?.product_name ?? null,
    lot_serial: String(it?.lot_serial ?? it?.lot_name ?? ""),
    expiration_date: it?.expiration_date ?? null,
    system_qty: Number(it?.system_qty ?? it?.quantity ?? 0) || 0,
    executed_qty: Number(it?.executed_qty ?? it?.qty_executed ?? 0) || 0,
    barcode_text: it?.barcode_text ?? it?.barcode ?? null,
    barcode: it?.barcode ?? null,
    is_outside_location: Boolean(it?.is_outside_location),
    allow_manual_executed_qty:
      Boolean(it?.allow_manual_executed_qty) || Boolean(it?.is_outside_location),
    outside_source_location_name: it?.outside_source_location_name ?? null,
    outside_source_qty:
      typeof it?.outside_source_qty === "number"
        ? Number(it.outside_source_qty)
        : null,
  }));
}

function isMatchedBarcode(item: RowItem, scannedText: string) {
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

function isOutsideRow(item: RowItem) {
  return Boolean(item.is_outside_location);
}

const EditBorrowStockPage: React.FC<Props> = ({ view = false }) => {
  const navigate = useNavigate();
  const { id } = useParams();

  const borrowStockId = Number(id);
  const isView = view;

  const [loading, setLoading] = useState(false);
  const [savingItemId, setSavingItemId] = useState<number | null>(null);

  const [locationFullName, setLocationFullName] = useState("");
  const [barcodeText, setBarcodeText] = useState("");
  const [departmentLabels, setDepartmentLabels] = useState<string[]>([]);
  const [departmentIds, setDepartmentIds] = useState<number[]>([]);
  const [allDepartments, setAllDepartments] = useState(false);

  const [items, setItems] = useState<RowItem[]>([]);
  const itemsRef = useRef<RowItem[]>([]);
  const [skuFilter, setSkuFilter] = useState("");
  const [openScanBarcodeCam, setOpenScanBarcodeCam] = useState(false);

  const barcodeRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    setTimeout(() => barcodeRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    if (!borrowStockId || Number.isNaN(borrowStockId)) {
      toast.error("ไม่พบ Borrow Stock ID");
      navigate("/borrow_stock");
      return;
    }

    const loadDoc = async () => {
      setLoading(true);
      try {
        const res = await borrowStockApi.getById(String(borrowStockId));

        const raw = res?.data as any;
        const doc =
          raw?.doc ??
          raw?.data ??
          raw?.borrow_stock ??
          (Array.isArray(raw?.data) ? raw?.data?.[0] : raw);

        if (!doc) {
          toast.error("ไม่พบเอกสาร Borrow Stock");
          navigate("/borrow_stock");
          return;
        }

        const locName = String(
          doc?.location_name ?? doc?.location_full_name ?? "",
        ).trim();

        setLocationFullName(locName);

        const depId =
          Number(doc?.department_id ?? doc?.department?.id ?? 0) || 0;
        const depLabel =
          String(
            doc?.department?.short_name ?? doc?.department?.full_name ?? "",
          ).trim() || formatDepartment(doc?.department);

        const rawDepts: any[] = Array.isArray(doc?.departments)
          ? doc.departments
          : depId
            ? [{ id: depId, short_name: depLabel || `Dept ${depId}` }]
            : [];

        const labels = rawDepts
          .map((d: any) => String(d?.short_name ?? d?.full_name ?? "").trim())
          .filter(Boolean);

        const ids = rawDepts
          .map((d: any) => Number(d?.id))
          .filter((x: number) => Number.isFinite(x) && x > 0);

        setDepartmentLabels(labels);
        setDepartmentIds(ids);
        setAllDepartments(Boolean(doc?.all_departments));
        setItems(mapDocItemsToRows(doc));
      } catch (e: any) {
        const msg = e?.response?.data?.message || "โหลดเอกสารไม่สำเร็จ";
        toast.error(msg);
        navigate("/borrow_stock");
      } finally {
        setLoading(false);
      }
    };

    loadDoc();
  }, [borrowStockId, navigate]);

  const filteredItems = useMemo(() => {
    const q = skuFilter.trim().toLowerCase();

    const base = !q
      ? items
      : items.filter((it) => {
          return (
            it.code.toLowerCase().includes(q) ||
            String(it.name ?? "").toLowerCase().includes(q) ||
            String(it.lot_serial ?? "").toLowerCase().includes(q) ||
            String(it.barcode_text ?? "").toLowerCase().includes(q) ||
            String(it.barcode ?? "").toLowerCase().includes(q)
          );
        });

    const normalItems = base.filter((it) => !it.is_outside_location);
    const outsideItems = base.filter((it) => it.is_outside_location);

    return [...normalItems, ...outsideItems];
  }, [items, skuFilter]);

  const updateExecutedQtyLocal = (rowId: number, value: string) => {
    const n = Number(value);
    const safe = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;

    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== rowId) return item;

        if (item.allow_manual_executed_qty || item.is_outside_location) {
          return { ...item, executed_qty: safe };
        }

        return {
          ...item,
          executed_qty: Math.min(safe, item.system_qty),
        };
      }),
    );
  };

  const reloadDoc = async () => {
    if (!borrowStockId || Number.isNaN(borrowStockId)) return;

    const res = await borrowStockApi.getById(String(borrowStockId));
    const raw = res?.data as any;
    const doc =
      raw?.doc ??
      raw?.data ??
      raw?.borrow_stock ??
      (Array.isArray(raw?.data) ? raw?.data?.[0] : raw);

    if (doc) {
      setItems(mapDocItemsToRows(doc));
    }
  };

  const handleSaveItem = async (row: RowItem) => {
    if (!borrowStockId || !row?.id || savingItemId) return;

    setSavingItemId(row.id);
    try {
      const res = await borrowStockApi.updateItem(borrowStockId, row.id, {
        executed_qty: row.executed_qty,
      } as any);

      const raw = res?.data as any;
      const doc = raw?.doc ?? raw?.data ?? null;

      if (doc) {
        setItems(mapDocItemsToRows(doc));
      }

      toast.success("บันทึกรายการแล้ว");
    } catch (e: any) {
      const msg = e?.response?.data?.message || "บันทึกไม่สำเร็จ";
      toast.error(msg);
    } finally {
      setSavingItemId(null);
    }
  };

  const handleDeleteItem = async (row: RowItem) => {
    if (!borrowStockId || !row?.id) return;

    const ok = window.confirm("ลบรายการนี้?");
    if (!ok) return;

    try {
      const res = await borrowStockApi.deleteItem(borrowStockId, row.id);
      const raw = res?.data as any;
      const doc = raw?.doc ?? raw?.data ?? null;

      if (doc) {
        setItems(mapDocItemsToRows(doc));
      } else {
        setItems((prev) => prev.filter((x) => x.id !== row.id));
      }

      toast.success("ลบรายการแล้ว");
    } catch (e: any) {
      const msg = e?.response?.data?.message || "ลบไม่สำเร็จ";
      toast.error(msg);
    }
  };

  const addOutsideItemToDocument = async (preview: any) => {
    if (!borrowStockId || Number.isNaN(borrowStockId)) {
      toast.error("ไม่พบ Borrow Stock ID");
      return;
    }

    if (!preview?.item?.code) {
      toast.warning("ไม่พบข้อมูลสินค้านี้ใน WMS");
      return;
    }

    // ต้องมี API ฝั่ง BE รองรับ
    const res = await (borrowStockApi as any).addScannedItem(borrowStockId, {
      code: String(preview.item.code ?? ""),
      name: preview.item.name ?? null,
      lot_serial: String(preview.item.lot_serial ?? ""),
      expiration_date: preview.item.expiration_date ?? null,
      system_qty: 0,
      executed_qty:
        Number(preview.item.executed_qty ?? 0) > 0
          ? Number(preview.item.executed_qty)
          : 1,
      is_outside_location: true,
      barcode_text:
        preview.scanned?.barcode_text ?? preview.goods_in?.barcode_text ?? null,
      barcode:
        preview.scanned?.payload ?? preview.scanned?.barcode_text ?? null,
      outside_source_location_name:
        preview?.suggested_stock_source?.location_name ?? null,
      outside_source_qty:
        Number(preview?.suggested_stock_source?.qty ?? 0) || 0,
    });

    const raw = res?.data as any;
    const doc = raw?.doc ?? raw?.data ?? null;

    if (doc) {
      setItems(mapDocItemsToRows(doc));
    } else {
      await reloadDoc();
    }

    toast.warning(
      preview?.suggested_stock_source?.location_name
        ? `พบสินค้านอก Location ปัจจุบัน จาก ${preview.suggested_stock_source.location_name}`
        : "พบสินค้านอก Location ปัจจุบัน",
    );
  };

  const tryScanOutsideLocation = async (rawScannedText: string) => {
    if (!locationFullName) return;

    if (!allDepartments && departmentIds.length === 0) {
      toast.warning("ไม่พบ Department ของเอกสาร");
      return;
    }

    try {
      const res = await borrowStockApi.scanBarcodePreview({
        barcode: rawScannedText,
        location_full_name: locationFullName,
        allow_outside_location: true,
        department_ids: allDepartments ? [] : departmentIds,
        all_departments: allDepartments,
      } as any);

      const preview = res?.data;
      await addOutsideItemToDocument(preview);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message || err?.message || "ไม่พบสินค้านี้ใน WMS";
      toast.error(msg);
    }
  };

  const handleScanBarcode = async (rawText?: string) => {
    if (!borrowStockId || Number.isNaN(borrowStockId)) {
      toast.error("ไม่พบ Borrow Stock ID");
      return;
    }

    if (!locationFullName) {
      toast.warning("ไม่พบ Location ของเอกสาร");
      return;
    }

    const bc = normalizeScanText(rawText ?? barcodeText);
    if (!bc) return;

    const matchedItem = itemsRef.current.find((item) =>
      isMatchedBarcode(item, bc),
    );

    if (!matchedItem) {
      const result = await confirmAlert(
        "ไม่พบรายการนี้ในเอกสารหรือใน Location/Department ปัจจุบัน\nต้องการสแกนสินค้าจากที่อื่นใช่ไหม?",
      );

      if (result.isConfirmed) {
        await tryScanOutsideLocation(rawText ?? barcodeText);
      } else {
        toast.warning(`ไม่พบรายการนี้ (${rawText ?? barcodeText})`);
      }

      setBarcodeText("");
      setTimeout(() => {
        barcodeRef.current?.focus();
        barcodeRef.current?.select?.();
      }, 30);
      return;
    }

    if (isOutsideRow(matchedItem)) {
      try {
        setLoading(true);

        const res = await borrowStockApi.updateItem(borrowStockId, matchedItem.id, {
          executed_qty: Number(matchedItem.executed_qty ?? 0) + 1,
        } as any);

        const raw = res?.data as any;
        const doc = raw?.doc ?? raw?.data ?? null;
        if (doc) {
          setItems(mapDocItemsToRows(doc));
        } else {
          await reloadDoc();
        }

        toast.success(`สแกน ${matchedItem.code} สำเร็จ (${Number(matchedItem.executed_qty ?? 0) + 1})`);
      } catch (e: any) {
        toast.error(e?.response?.data?.message || "บันทึกไม่สำเร็จ");
      } finally {
        setLoading(false);
        setBarcodeText("");
        setTimeout(() => {
          barcodeRef.current?.focus();
          barcodeRef.current?.select?.();
        }, 30);
      }
      return;
    }

    if (matchedItem.executed_qty >= matchedItem.system_qty && matchedItem.system_qty > 0) {
      const result = await confirmAlert(
        "จำนวนครบตาม System QTY แล้ว\nต้องการสแกนสินค้าจากที่อื่นใช่ไหม?",
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

    try {
      setLoading(true);

      const res = await borrowStockApi.scanBarcode(borrowStockId, {
        barcode: rawText ?? barcodeText,
        location_full_name: locationFullName,
      });

      const payload = res?.data as any;
      const nextDoc = payload?.doc ?? null;

      if (nextDoc) {
        setItems(mapDocItemsToRows(nextDoc));
      } else {
        await reloadDoc();
      }

      const action = String(payload?.action ?? "").trim();
      const code =
        payload?.matched_stock?.code ??
        payload?.scanned?.barcode_text ??
        bc;

      const executedQty = Number(payload?.matched_stock?.executed_qty ?? 0) || 0;

      if (action === "created_new_item") {
        toast.success(`เพิ่ม ${code} แล้ว (${executedQty})`);
      } else if (action === "incremented_existing_item") {
        toast.success(`สแกน ${code} สำเร็จ (${executedQty})`);
      } else {
        toast.success(`สแกน ${code} สำเร็จ`);
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "สแกนไม่สำเร็จ");
    } finally {
      setLoading(false);
      setBarcodeText("");
      setTimeout(() => {
        barcodeRef.current?.focus();
        barcodeRef.current?.select?.();
      }, 30);
    }
  };

  return (
    <>
      <div className="page-header">
        <div className="page-title">
          {isView ? "Borrow Stock Detail" : "Edit Borrow Stock"}
        </div>
      </div>

      <div className="edit_borrow_stock_page">
        <div className="edit_borrow_stock_page__card">
          <div className="edit_borrow_stock_page__header">
            <div className="edit_borrow_stock_page__title">
              {isView ? "Borrow Stock Detail" : "Edit Borrow Stock"}
            </div>

            <button
              className="edit_borrow_stock_page__close"
              onClick={() => navigate("/borrow_stock")}
              type="button"
              disabled={loading}
            >
              ✕
            </button>
          </div>

          <div className="edit_borrow_stock_page__body">
            <div className="editborrow_form">
              <div className="editborrow_row">
                <label className="editborrow_label">Location</label>

                <div
                  className="editborrow_input"
                  style={{
                    minHeight: 38,
                    display: "flex",
                    alignItems: "center",
                    background: "#f5f5f5",
                    borderRadius: 6,
                    padding: "6px 12px",
                    color: "#333",
                    flexWrap: "wrap",
                    gap: 4,
                  }}
                >
                  {locationFullName || "-"}
                </div>
              </div>

              <div className="editborrow_row">
                <label className="editborrow_label">Department</label>

                <div
                  className="editborrow_input"
                  style={{
                    minHeight: 38,
                    display: "flex",
                    alignItems: "center",
                    background: "#f5f5f5",
                    borderRadius: 6,
                    padding: "6px 12px",
                    color: "#333",
                    flexWrap: "wrap",
                    gap: 4,
                  }}
                >
                  {departmentLabels.length > 0 ? departmentLabels.join(", ") : "-"}
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

                {!isView && (
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
                        disabled={loading}
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
                          disabled={loading}
                        >
                          <i className="fa fa-qrcode" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="editborrow_tablewrap">
              <table className="editborrow_table">
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>No</th>
                    <th>สินค้า</th>
                    <th>ชื่อ</th>
                    <th>Lot / Serial</th>
                    <th>Expire Date</th>
                    <th style={{ width: 160 }}>System QTY</th>
                    <th style={{ width: 180 }}>QTY Executed</th>
                    {!isView && <th style={{ width: 160 }}>Action</th>}
                  </tr>
                </thead>

                <tbody>
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={isView ? 7 : 8} className="editborrow_nodata">
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
                            `${it.code}-${it.lot_serial}-${it.expiration_date ?? ""}-${it.is_outside_location ? "outside" : "normal"}`
                          }
                          className={[
                            it.is_outside_location ? "add_borrow_stock-row-outside" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          style={
                            it.system_qty === 0
                              ? { backgroundColor: "#fffbea", color: "#e6ac00" }
                              : undefined
                          }
                        >
                          <td>{idx + 1}</td>

                          <td className="editborrow_sku">
                            <div className="editborrow_sku_code">{it.code}</div>
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

                          <td>{it.name || "-"}</td>
                          <td>{it.lot_serial || "-"}</td>
                          <td>
                            {it.expiration_date
                              ? formatDateTime(it.expiration_date)
                              : "-"}
                          </td>

                          <td className="editborrow_center">{it.system_qty}</td>

                          <td>
                            <input
                              className="editborrow_qtyinput"
                              inputMode="numeric"
                              value={String(it.executed_qty ?? 0)}
                              onChange={(e) =>
                                updateExecutedQtyLocal(it.id, e.target.value)
                              }
                              disabled={loading || busy || isView}
                            />
                          </td>

                          {!isView && (
                            <td className="editborrow_center">
                              <div className="editborrow_actions">
                                <button
                                  type="button"
                                  className="editborrow_btn editborrow_btn_primary"
                                  onClick={() => handleSaveItem(it)}
                                  disabled={loading || busy}
                                >
                                  {busy ? "Saving..." : "Save"}
                                </button>

                                <button
                                  type="button"
                                  className="editborrow_btn editborrow_btn_ghost"
                                  onClick={() => handleDeleteItem(it)}
                                  disabled={loading || busy}
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
          </div>

          <div className="editborrow_footer">
            <button
              className="editborrow_btn editborrow_btn_ghost"
              type="button"
              onClick={() => navigate("/borrow_stock")}
              disabled={loading}
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {!isView && (
        <CameraScanner
          open={openScanBarcodeCam}
          onClose={() => setOpenScanBarcodeCam(false)}
          onDetected={(text) => {
            const scanned = normalizeScanText(text);
            setBarcodeText(scanned);
            setTimeout(() => handleScanBarcode(scanned), 0);
          }}
        />
      )}
    </>
  );
};

export default EditBorrowStockPage;