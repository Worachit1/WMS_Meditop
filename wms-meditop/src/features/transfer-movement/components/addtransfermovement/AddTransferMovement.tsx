import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

import Select from "react-select";

import { formatDateTime } from "../../../../components/Datetime/FormatDateTime";
import {
  confirmAlert,
  successAlert,
  warningAlert,
} from "../../../../utils/alert";
import "./addtransfermovement.css";

// ✅ ปรับ path import ตามโครงโปรเจกต์คุณ
import { departmentApi } from "../../../department/services/department.api";
import { userApi } from "../../../user/services/user.api";
import { stockApi } from "../../../stock/services/stock.api";
import { transferApi } from "../../services/transfer.api"; // ใช้ gen running

type Department = { id: number; short_name: string; full_name?: string };

type User = {
  id: number;
  first_name: string;
  last_name: string;
  departments?: Department[]; // ✅ เพิ่ม
};

const selectPortalTarget =
  typeof document !== "undefined" ? document.body : null;

const selectStyles = {
  menuPortal: (base: any) => ({ ...base, zIndex: 99999 }),
};

// ✅ Stock mapping ล่าสุด
// Code = product_code
// ชื่อ = product_name
// Lock No. = location_name
// Lot Serial. = lot_name
// QTY = quantity (default)
// หน่วย = unit
// Expire Date = expiration_date
type StockItem = {
  id: number;
  product_id: number; // ✅ เพิ่มบรรทัดนี้

  product_code: string;
  product_name: string;

  location_name: string;
  lot_name: string | null;

  quantity: number;
  unit: string;
  expiration_date: string;
};

type MovementDoc = {
  move_no?: string;
  no?: string;
  name?: string;
};

type Row = {
  rowId: string;

  productCode: string | null; // product_code
  lockNo: string | null; // location_name
  lotSerial: string | null; // lot_name

  stockId: number | null; // set ตอนเลือก lot แล้ว
  qty: number | "";
  isEditing: boolean;
  actionOpen: boolean;
};

function uuid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatYyMm(d: Date) {
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return { yy, mm, yymm: `${yy}${mm}` };
}

function parseRunning(docNo: string) {
  // MYYMM-### เช่น M2603-001
  const m = /^M(\d{2})(\d{2})-(\d{3})$/.exec((docNo || "").trim());
  if (!m) return null;
  return { yy: m[1], mm: m[2], run: Number(m[3]) };
}

function AddTransferMovement() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [moveNo, setMoveNo] = useState<string>("M---- ---");
  const [departmentId, setDepartmentId] = useState<number[]>([]);
  const [userId, setUserId] = useState<number[]>([]);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [stocks, setStocks] = useState<StockItem[]>([]);

  const [rows, setRows] = useState<Row[]>([
    {
      rowId: uuid(),
      productCode: null,
      lockNo: null,
      lotSerial: null,
      stockId: null,
      qty: "",
      isEditing: true,
      actionOpen: false,
    },
  ]);

  // ปิด action menu เมื่อคลิกนอก
  const pageRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (!pageRef.current?.contains(el)) return;
      setRows((prev) => prev.map((r) => ({ ...r, actionOpen: false })));
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const stockById = useMemo(() => {
    const map = new Map<number, StockItem>();
    stocks.forEach((s) => map.set(s.id, s));
    return map;
  }, [stocks]);

  // ===== options =====

  const productOptions = useMemo(
    () =>
      Array.from(new Set(stocks.map((s) => s.product_code).filter(Boolean)))
        .sort()
        .map((code) => ({ value: code, label: code })),
    [stocks],
  );

  const lockOptionsByCode = useMemo(() => {
    return (code: string | null) => {
      if (!code) return [];
      const locks = Array.from(
        new Set(
          stocks
            .filter((s) => s.product_code === code)
            .map((s) => s.location_name)
            .filter(Boolean),
        ),
      ).sort();

      return locks.map((x) => ({ value: x, label: x }));
    };
  }, [stocks]);

  const NO_LOT = "__NO_LOT__"; // sentinel สำหรับ null

  const getStocksByCodeLock = (
    stocks: StockItem[],
    code: string | null,
    lock: string | null,
  ) => {
    if (!code || !lock) return [];
    return stocks.filter(
      (s) => s.product_code === code && s.location_name === lock,
    );
  };

  const hasOnlyNoLotOption = (
    stocks: StockItem[],
    code: string | null,
    lock: string | null,
  ) => {
    const matched = getStocksByCodeLock(stocks, code, lock);
    if (matched.length === 0) return false;

    const uniqueLots = Array.from(
      new Set(matched.map((s) => s.lot_name ?? NO_LOT)),
    );

    return uniqueLots.length === 1 && uniqueLots[0] === NO_LOT;
  };

  const findDefaultStockByCodeLock = (
    stocks: StockItem[],
    code: string | null,
    lock: string | null,
  ) => {
    const matched = getStocksByCodeLock(stocks, code, lock);
    if (matched.length === 0) return null;

    // ถ้ามีแต่ no lot อย่างเดียว ให้เลือกตัวแรกได้เลย
    const noLotOnly = hasOnlyNoLotOption(stocks, code, lock);
    if (noLotOnly) return matched[0];

    return null;
  };

  const lotOptionsByCodeLock = useMemo(() => {
    return (code: string | null, lock: string | null) => {
      if (!code || !lock) return [];

      const rawLots = stocks
        .filter((s) => s.product_code === code && s.location_name === lock)
        .map((s) => s.lot_name ?? NO_LOT); // ✅ keep null as sentinel

      const unique = Array.from(new Set(rawLots));

      // จัดเรียง: ให้ "(No Lot)" อยู่บนสุด
      unique.sort((a, b) => {
        if (a === NO_LOT && b !== NO_LOT) return -1;
        if (a !== NO_LOT && b === NO_LOT) return 1;
        return String(a).localeCompare(String(b));
      });

      return unique.map((v) => ({
        value: v,
        label: v === NO_LOT ? "(No Lot)" : v,
      }));
    };
  }, [stocks]);

  const departmentOptions = useMemo(
    () =>
      departments.map((d) => ({
        value: d.id,
        label: d.short_name,
      })),
    [departments],
  );

  const filteredUsers = useMemo(() => {
    if (departmentId.length === 0) return [];
    return users.filter(
      (u) =>
        Array.isArray(u.departments) &&
        u.departments.some((d) => departmentId.includes(d.id)),
    );
  }, [users, departmentId]);

  const userOptions = useMemo(
    () =>
      filteredUsers.map((u) => ({
        value: u.id,
        label: `${u.first_name} ${u.last_name}`,
      })),
    [filteredUsers],
  );

  // ===== gen move no =====
  const generateMoveNo = (docs: MovementDoc[]) => {
    const now = new Date();
    const { yymm } = formatYyMm(now);

    const existingNos = docs
      .map((d) => d.move_no || d.no || d.name || "")
      .filter(Boolean);

    let maxRun = 0;
    for (const no of existingNos) {
      const p = parseRunning(no);
      if (!p) continue;
      if (`${p.yy}${p.mm}` !== yymm) continue;
      if (Number.isFinite(p.run)) maxRun = Math.max(maxRun, p.run);
    }

    const nextRun = String(maxRun + 1).padStart(3, "0");
    return `M${yymm}-${nextRun}`;
  };

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);

        const [depRes, userRes, stockRes, mvRes] = await Promise.all([
          departmentApi.getAll(),
          userApi.getAll(),
          stockApi.getAll(),
          transferApi.getAll(),
        ]);

        const depData: Department[] =
          (depRes as any)?.data?.data ?? (depRes as any)?.data ?? [];
        const userData: User[] =
          (userRes as any)?.data?.data ?? (userRes as any)?.data ?? [];
        const stockData: StockItem[] =
          (stockRes as any)?.data?.data ?? (stockRes as any)?.data ?? [];
        const mvData: MovementDoc[] =
          (mvRes as any)?.data?.data ?? (mvRes as any)?.data ?? [];

        setDepartments(Array.isArray(depData) ? depData : []);
        setUsers(Array.isArray(userData) ? userData : []);
        setStocks(Array.isArray(stockData) ? stockData : []);
        setMoveNo(generateMoveNo(Array.isArray(mvData) ? mvData : []));
      } catch (e: any) {
        console.error(e);
        toast.error(e?.response?.data?.message || "โหลดข้อมูลไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== row handlers =====

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        rowId: uuid(),
        productCode: null,
        lockNo: null,
        lotSerial: null,
        stockId: null,
        qty: "",
        isEditing: true,
        actionOpen: false,
      },
    ]);
  };

  const deleteRow = (rowId: string) => {
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));
  };

  const toggleAction = (rowId: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.rowId === rowId
          ? { ...r, actionOpen: !r.actionOpen }
          : { ...r, actionOpen: false },
      ),
    );
  };

  const setRowEditing = (rowId: string, isEditing: boolean) => {
    setRows((prev) =>
      prev.map((r) =>
        r.rowId === rowId ? { ...r, isEditing, actionOpen: false } : r,
      ),
    );
  };

  const setRowProductCode = (rowId: string, code: string | null) => {
    setRows((prev) =>
      prev.map((r) =>
        r.rowId === rowId
          ? {
              ...r,
              productCode: code,
              lockNo: null,
              lotSerial: null,
              stockId: null,
              qty: "",
            }
          : r,
      ),
    );
  };

  const setRowLockNo = (rowId: string, lock: string | null) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.rowId !== rowId) return r;

        const next: Row = {
          ...r,
          lockNo: lock,
          lotSerial: null,
          stockId: null,
          qty: "",
        };

        if (!next.productCode || !lock) return next;

        const defaultStock = findDefaultStockByCodeLock(
          stocks,
          next.productCode,
          lock,
        );

        if (defaultStock) {
          return {
            ...next,
            lotSerial: NO_LOT,
            stockId: defaultStock.id,
          };
        }

        return next;
      }),
    );
  };

  const setRowLotSerial = (rowId: string, lot: string | null) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.rowId !== rowId) return r;

        const code = r.productCode;
        const lock = r.lockNo;

        const selected = lot === NO_LOT ? null : lot;

        const matched = stocks.find(
          (s) =>
            s.product_code === code &&
            s.location_name === lock &&
            (s.lot_name ?? null) === selected,
        );

        return {
          ...r,
          lotSerial: lot, // เก็บ sentinel ไว้เพื่อให้ Select แสดง label ได้
          stockId: matched?.id ?? null,
          qty: r.qty,
        };
      }),
    );
  };

  const setRowQty = (rowId: string, v: string) => {
    const cleaned = v.replace(/[^\d.]/g, "");
    const num = cleaned === "" ? "" : Number(cleaned);
    setRows((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, qty: num } : r)),
    );
  };

  // ===== footer actions =====

  const handleCancel = () => navigate("/tf-movement");

  // const handleSaveDraft = () => {
  //   toast.info("Save Draft (ยังไม่ทำงาน)");
  // };

  const handleConfirm = async () => {
    if (!departmentId) return warningAlert("กรุณาเลือก Department");
    if (!userId) return warningAlert("กรุณาเลือก User");

    const validRows = rows.filter(
      (r) => r.stockId && r.qty !== "" && Number(r.qty) > 0,
    );
    if (validRows.length === 0) {
      return warningAlert("กรุณาเลือกสินค้าและกรอกจำนวนอย่างน้อย 1 รายการ");
    }

    const items = validRows.map((r) => {
      const s = r.stockId ? stockById.get(r.stockId) : undefined;
      if (!s) throw new Error("ไม่พบ stock ของรายการที่เลือก");

      const lotSerial = r.lotSerial === NO_LOT ? null : (r.lotSerial ?? null);

      return {
        product_id: s.product_id,
        code: s.product_code,
        name: s.product_name,
        lot_serial: lotSerial,
        lock_no: s.location_name,
        unit: s.unit,
        expire_date: s.expiration_date || null,
        qty: Number(r.qty),
      };
    });

    const creatorId =
      Number(localStorage.getItem("user_id")) ||
      Number(localStorage.getItem("id")) ||
      0;
    const payload = {
      number: moveNo,

      department_id: departmentId[0],
      user_work_id: userId[0],

      department_ids: departmentId,
      user_work_ids: userId,

      user_id: creatorId,
      items,
    };
    const { isConfirmed } = await confirmAlert(`ยืนยันสร้าง MOVE ${moveNo} ?`);
    if (!isConfirmed) return;

    try {
      setBusy(true);
      await transferApi.createMovementInvoice(payload);
      successAlert("สร้าง MOVE สำเร็จ");
      navigate("/tf-movement");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.response?.data?.message || "สร้าง MOVE ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="Add-tf-M-page" ref={pageRef}>
      <div className="Add-tf-M-top">
        <div className="Add-tf-M-title">
          <span className="Add-tf-M-title-strong">MOVE : {moveNo}</span>
        </div>

        <div className="Add-tf-M-form">
          <div className="Add-tf-M-form-row">
            <label className="Add-tf-M-label">Department :</label>
            <Select
              className="Add-tf-M-react-select"
              classNamePrefix="Add-tf-M-rs"
              menuPortalTarget={selectPortalTarget ?? undefined}
              menuPosition="fixed"
              styles={selectStyles}
              options={departmentOptions}
              isMulti
              value={departmentOptions.filter((o) =>
                departmentId.includes(Number(o.value)),
              )}
              onChange={(options: any) => {
                const nextIds = Array.isArray(options)
                  ? options.map((o) => Number(o.value))
                  : [];
                setDepartmentId(nextIds);

                // ✅ reset user ทุกครั้งที่เปลี่ยน department (เหมือนเดิม)
                setUserId([]);
              }}
              isClearable
              isDisabled={loading}
              placeholder="Select Department..."
            />
          </div>

          <div className="Add-tf-M-form-row">
            <label className="Add-tf-M-label">เจ้าหน้าที่ปฏิบัติงาน :</label>
            <Select
              className="Add-tf-M-react-select"
              classNamePrefix="Add-tf-M-rs"
              menuPortalTarget={selectPortalTarget ?? undefined}
              menuPosition="fixed"
              styles={selectStyles}
              options={userOptions}
              isMulti
              value={userOptions.filter((o) =>
                userId.includes(Number(o.value)),
              )}
              onChange={(options: any) => {
                const nextIds = Array.isArray(options)
                  ? options.map((o) => Number(o.value))
                  : [];
                setUserId(nextIds);
              }}
              isClearable
              isDisabled={loading || departmentId.length === 0}
              placeholder={
                departmentId.length > 0
                  ? "Select User..."
                  : "Select Department first"
              }
            />
          </div>
        </div>
      </div>

      <div className="Add-tf-M-table-wrap">
        <table className="Add-tf-M-table">
          <thead>
            <tr>
              <th className="Add-tf-M-th-no">No</th>
              <th className="Add-tf-M-th-code" style={{ width: 250 }}>
                Code
              </th>
              <th className="Add-tf-M-th-name" style={{ width: 250 }}>
                ชื่อ
              </th>
              <th className="Add-tf-M-th-lock" style={{ width: 250 }}>
                Lock No.
              </th>
              <th className="Add-tf-M-th-lot" style={{ width: 250 }}>
                Lot serial.
              </th>
              <th className="Add-tf-M-th-qty" style={{ width: 120 }}>
                QTY
              </th>
              <th className="Add-tf-M-th-unit">หน่วย</th>
              <th className="Add-tf-M-th-exp" style={{ width: 250 }}>
                Expire Date
              </th>
              <th className="Add-tf-M-th-action">Action</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r, idx) => {
              const s = r.stockId ? stockById.get(r.stockId) : undefined;
              const lotOptions = lotOptionsByCodeLock(r.productCode, r.lockNo);
              const noLotOnly = hasOnlyNoLotOption(
                stocks,
                r.productCode,
                r.lockNo,
              );

              return (
                <tr key={r.rowId}>
                  <td className="Add-tf-M-td-center">{idx + 1}</td>

                  {/* Code */}
                  <td>
                    {r.isEditing ? (
                      <Select
                        className="Add-tf-M-react-select"
                        classNamePrefix="Add-tf-M-rs"
                        menuPortalTarget={selectPortalTarget ?? undefined}
                        menuPosition="fixed"
                        styles={selectStyles}
                        options={productOptions}
                        value={
                          r.productCode
                            ? { value: r.productCode, label: r.productCode }
                            : null
                        }
                        onChange={(opt: any) =>
                          setRowProductCode(
                            r.rowId,
                            opt ? String(opt.value) : null,
                          )
                        }
                        isClearable
                        isDisabled={loading || busy}
                        placeholder="Select code..."
                      />
                    ) : (
                      <span className="Add-tf-M-text-auto">
                        {r.productCode || "-"}
                      </span>
                    )}
                  </td>

                  {/* ชื่อ */}
                  <td>
                    <span className="Add-tf-M-text-auto">
                      {s?.product_name || "Auto Show"}
                    </span>
                  </td>

                  {/* Lock No. (location_name) */}
                  <td>
                    {r.isEditing ? (
                      <Select
                        className="Add-tf-M-react-select"
                        classNamePrefix="Add-tf-M-rs"
                        menuPortalTarget={selectPortalTarget ?? undefined}
                        menuPosition="fixed"
                        styles={selectStyles}
                        options={lockOptionsByCode(r.productCode)}
                        value={
                          r.lockNo ? { value: r.lockNo, label: r.lockNo } : null
                        }
                        onChange={(opt: any) =>
                          setRowLockNo(r.rowId, opt ? String(opt.value) : null)
                        }
                        isClearable
                        isDisabled={loading || busy || !r.productCode}
                        placeholder={
                          r.productCode ? "Select lock..." : "Select code first"
                        }
                      />
                    ) : (
                      <span className="Add-tf-M-text-auto">
                        {r.lockNo || "-"}
                      </span>
                    )}
                  </td>

                  {/* Lot serial. (lot_name) */}
                  <td>
                    {r.isEditing ? (
                      <Select
                        className="Add-tf-M-react-select"
                        classNamePrefix="Add-tf-M-rs"
                        menuPortalTarget={selectPortalTarget ?? undefined}
                        menuPosition="fixed"
                        styles={selectStyles}
                        options={lotOptions}
                        value={
                          r.lotSerial
                            ? {
                                value: r.lotSerial,
                                label:
                                  r.lotSerial === NO_LOT
                                    ? "(No Lot)"
                                    : r.lotSerial,
                              }
                            : null
                        }
                        onChange={(opt: any) =>
                          setRowLotSerial(
                            r.rowId,
                            opt ? String(opt.value) : null,
                          )
                        }
                        isClearable={!noLotOnly}
                        isDisabled={
                          loading ||
                          busy ||
                          !r.productCode ||
                          !r.lockNo ||
                          noLotOnly
                        }
                        placeholder={
                          r.lockNo
                            ? noLotOnly
                              ? "(No Lot)"
                              : "Select lot..."
                            : "Select lock first"
                        }
                      />
                    ) : (
                      <span className="Add-tf-M-text-auto">
                        {r.lotSerial === NO_LOT
                          ? "(No Lot)"
                          : r.lotSerial || "-"}
                      </span>
                    )}
                  </td>

                  {/* QTY */}
                  <td>
                    {r.isEditing ? (
                      <input
                        className="Add-tf-M-input-sm"
                        value={r.qty}
                        onChange={(e) => setRowQty(r.rowId, e.target.value)}
                        placeholder="ระบุจำนวน"
                        disabled={busy}
                      />
                    ) : (
                      <span className="Add-tf-M-text-auto">
                        {r.qty === "" ? "-" : String(r.qty)}
                      </span>
                    )}
                  </td>

                  {/* หน่วย */}
                  <td>
                    <span className="Add-tf-M-text-auto">
                      {s?.unit || "Auto Show"}
                    </span>
                  </td>

                  {/* Expire */}
                  <td>
                    <span className="Add-tf-M-text-auto">
                      {s?.expiration_date
                        ? formatDateTime(s.expiration_date)
                        : "Auto Show"}
                    </span>
                  </td>

                  {/* Action */}
                  <td className="Add-tf-M-td-action">
                    <button
                      className="Add-tf-M-kebab"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleAction(r.rowId);
                      }}
                      type="button"
                      aria-label="Action"
                    >
                      ⋮
                    </button>

                    {r.actionOpen && (
                      <div
                        className="Add-tf-M-action-menu"
                        onClick={(e) => e.stopPropagation()}
                        role="menu"
                      >
                        <button
                          className="Add-tf-M-action-item"
                          onClick={() => setRowEditing(r.rowId, true)}
                          type="button"
                        >
                          Edit
                        </button>
                        <button
                          className="Add-tf-M-action-item danger"
                          onClick={() => deleteRow(r.rowId)}
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}

            <tr>
              <td colSpan={9} className="Add-tf-M-addrow-cell">
                <button
                  className="Add-tf-M-addrow"
                  onClick={addRow}
                  type="button"
                  disabled={loading || busy}
                >
                  + เพิ่มรายการ
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* footer buttons */}
      <div className="Add-tf-M-footer">
        {/* <button
          className="Add-tf-M-btn ghost"
          onClick={handleSaveDraft}
          type="button"
        >
          Save Draft
        </button> */}
        <button
          className="Add-tf-M-btn danger"
          onClick={handleCancel}
          type="button"
        >
          ย้อนกลับ
        </button>
        <button
          className="Add-tf-M-btn primary"
          onClick={handleConfirm}
          type="button"
        >
          ยืนยัน
        </button>
      </div>
    </div>
  );
}

export default AddTransferMovement;
