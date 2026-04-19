import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";

import Select from "react-select";

import { formatDateTime } from "../../../../components/Datetime/FormatDateTime";
import {
  confirmAlert,
  successAlert,
  warningAlert,
} from "../../../../utils/alert";
import "./edittransfermovement.css";

// ✅ ปรับ path import ตามโครงโปรเจกต์คุณ
import { departmentApi } from "../../../department/services/department.api";
import { userApi } from "../../../user/services/user.api";
import { stockApi } from "../../../stock/services/stock.api";
import { transferApi } from "../../services/transfer.api"; // ใช้ gen running
import Loading from "../../../../components/Loading/Loading";

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

function EditTransferMovement() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [moveNo, setMoveNo] = useState<string>("M---- ---");
  const [departmentId, setDepartmentId] = useState<number | "">("");
  const [userId, setUserId] = useState<number | "">("");
  const [movementId, setMovementId] = useState<number | null>(null);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [stocks, setStocks] = useState<StockItem[]>([]);

  const { no } = useParams<{ no: string }>();
  const isEdit = Boolean(no);

  const [status, setStatus] = useState<string>("pick"); // หรือ "" ก็ได้
  const isCompleted = status === "completed";

  const currentUserId = Number(localStorage.getItem("id") || 0) || 0;
  const userLevel = String(localStorage.getItem("user_level") || "")
    .trim()
    .toLowerCase();
  const isOperator = userLevel === "operator";

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

  const filteredUsers = useMemo(() => {
    if (!departmentId) return [];
    const depId = Number(departmentId);

    return users.filter(
      (u) =>
        Array.isArray(u.departments) &&
        u.departments.some((d) => d.id === depId),
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

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);

        const [depRes, userRes, stockRes] = await Promise.all([
          departmentApi.getAll(),
          userApi.getAll(),
          stockApi.getAll(),
        ]);

        const depData: Department[] =
          (depRes as any)?.data?.data ?? (depRes as any)?.data ?? [];
        const userData: User[] =
          (userRes as any)?.data?.data ?? (userRes as any)?.data ?? [];
        const stockData: StockItem[] =
          (stockRes as any)?.data?.data ?? (stockRes as any)?.data ?? [];

        setDepartments(Array.isArray(depData) ? depData : []);
        setUsers(Array.isArray(userData) ? userData : []);
        setStocks(Array.isArray(stockData) ? stockData : []);

        // ✅ EDIT MODE: โหลดข้อมูลเดิม
        if (isEdit && no) {
          const mvRes = await transferApi.getDetailExpNcr(no);
          const mv = (mvRes as any)?.data?.data ?? (mvRes as any)?.data;

          setMovementId(Number(mv?.id ?? 0) || null);
          setMoveNo(String(mv?.no ?? "M---- ---"));

          const ownerId = Number(mv?.user?.id ?? 0) || 0;

          if (isOperator) {
            warningAlert("Operator ไม่สามารถแก้ไขเอกสารได้");
            navigate("/tf-movement");
            return;
          }

          if (!ownerId || ownerId !== currentUserId) {
            warningAlert("คุณไม่ใช่ผู้สร้างเอกสารนี้ จึงไม่สามารถแก้ไขได้");
            navigate("/tf-movement");
            return;
          }

          // ✅ Department: response มี department { short_name, full_name } แต่ไม่มี id
          const depShort = String(mv?.department?.short_name ?? "").trim();
          const depFull = String(mv?.department?.full_name ?? "").trim();

          const dep = depData.find(
            (d) =>
              (depShort && d.short_name === depShort) ||
              (depFull && d.full_name === depFull),
          );

          setDepartmentId(dep ? dep.id : "");

          // ✅ User: ต้องใช้ user_work (ตามที่คุณต้องการ)
          setUserId(mv?.user_work?.id ? Number(mv.user_work.id) : "");
          setStatus(String(mv?.status ?? "pick"));

          // ✅ map items -> rows
          const items = Array.isArray(mv?.items) ? mv.items : [];

          const mappedRows: Row[] = items.map((it: any) => {
            const code =
              String(it?.code ?? it?.product_code ?? "").trim() || null;
            const lock =
              String(it?.lock_no ?? it?.location_name ?? "").trim() || null;

            const lot = it?.lot_serial ?? it?.lot_name ?? null;
            const lotSerial = lot === null ? NO_LOT : String(lot);

            // หา stockId ให้ match (code+lock+lot)
            const matched = stockData.find(
              (s) =>
                s.product_code === code &&
                s.location_name === lock &&
                (s.lot_name ?? null) === (lot === NO_LOT ? null : lot),
            );

            return {
              rowId: uuid(),
              productCode: code,
              lockNo: lock,
              lotSerial,
              stockId: matched?.id ?? null,
              qty: Number(it?.qty ?? it?.quantity ?? 0) || "",
              isEditing: true,
              actionOpen: false,
            };
          });

          setRows(
            mappedRows.length > 0
              ? mappedRows
              : [
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
                ],
          );

          return;
        }
      } catch (e: any) {
        console.error(e);
        toast.error(e?.response?.data?.message || "โหลดข้อมูลไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [no, isEdit]);

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
      prev.map((r) =>
        r.rowId === rowId
          ? {
              ...r,
              lockNo: lock,
              lotSerial: null,
              stockId: null,
              qty: "",
            }
          : r,
      ),
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

    const { isConfirmed } = await confirmAlert(
      isEdit ? `ยืนยันแก้ไข MOVE ${moveNo} ?` : `ยืนยันสร้าง MOVE ${moveNo} ?`,
    );
    if (!isConfirmed) return;

    try {
      setBusy(true);

      if (isEdit) {
        if (!movementId) return warningAlert("ไม่พบ id ของเอกสาร (movementId)");

        await transferApi.updateMovement(movementId, {
          number: moveNo,
          department_id: Number(departmentId),
          user_work_id: Number(userId),
          items,
        });

        if (isCompleted)
          return warningAlert("เอกสารนี้ Completed แล้ว ไม่สามารถแก้ไขได้");
        successAlert("แก้ไข MOVE สำเร็จ");
        navigate("/tf-movement");
        return;
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e?.response?.data?.message || "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="Edit-tf-M-page" ref={pageRef}>
      <div className="Edit-tf-M-top">
        <div className="Edit-tf-M-title">
          <span className="Edit-tf-M-title-strong">MOVE : {moveNo}</span>
        </div>

        <div className="Edit-tf-M-form">
          <div className="Edit-tf-M-form-row">
            <label className="Edit-tf-M-label">Department :</label>
            <Select
              className="Edit-tf-M-react-select"
              classNamePrefix="Edit-tf-M-rs"
              menuPortalTarget={selectPortalTarget ?? undefined}
              menuPosition="fixed"
              styles={selectStyles}
              options={departments.map((d) => ({
                value: d.id,
                label: d.short_name,
              }))}
              value={
                departmentId
                  ? (() => {
                      const depId = Number(departmentId);
                      const d = departments.find((x) => x.id === depId);
                      return d ? { value: d.id, label: d.short_name } : null;
                    })()
                  : null
              }
              onChange={(option: any) => {
                const nextDepId = option ? Number(option.value) : "";
                setDepartmentId(nextDepId);
                setUserId(""); // ✅ reset ทุกครั้ง
              }}
              isClearable
              isDisabled={loading}
              placeholder="Select Department..."
            />
          </div>

          <div className="Edit-tf-M-form-row">
            <label className="Edit-tf-M-label">User :</label>
            <Select
              className="Edit-tf-M-react-select"
              classNamePrefix="Edit-tf-M-rs"
              menuPortalTarget={selectPortalTarget ?? undefined}
              menuPosition="fixed"
              styles={selectStyles}
              options={userOptions}
              value={
                userId
                  ? (() => {
                      const uId = Number(userId);
                      const u = users.find((x) => x.id === uId);
                      return u
                        ? {
                            value: u.id,
                            label: `${u.first_name} ${u.last_name}`,
                          }
                        : null;
                    })()
                  : null
              }
              onChange={(option: any) =>
                setUserId(option ? Number(option.value) : "")
              }
              isClearable
              isDisabled={loading || !departmentId}
              placeholder={
                departmentId ? "Select User..." : "Select Department first"
              }
            />
          </div>
        </div>
      </div>

      <div className="Edit-tf-M-table-wrap">
        <table className="Edit-tf-M-table">
          <thead>
            <tr>
              <th className="Edit-tf-M-th-no">No</th>
              <th className="Edit-tf-M-th-code" style={{ width: 250 }}>
                Code
              </th>
              <th className="Edit-tf-M-th-name" style={{ width: 250 }}>
                ชื่อ
              </th>
              <th className="Edit-tf-M-th-lock" style={{ width: 250 }}>
                Lock No.
              </th>
              <th className="Edit-tf-M-th-lot" style={{ width: 250 }}>
                Lot serial.
              </th>
              <th className="Edit-tf-M-th-qty" style={{ width: 120 }}>
                QTY
              </th>
              <th className="Edit-tf-M-th-unit">หน่วย</th>
              <th className="Edit-tf-M-th-exp" style={{ width: 250 }}>
                Expire Date
              </th>
              <th className="Edit-tf-M-th-action">Action</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r, idx) => {
              const s = r.stockId ? stockById.get(r.stockId) : undefined;

              return (
                <tr key={r.rowId}>
                  <td className="Edit-tf-M-td-center">{idx + 1}</td>

                  {/* Code */}
                  <td>
                    {r.isEditing ? (
                      <Select
                        className="Edit-tf-M-react-select"
                        classNamePrefix="Edit-tf-M-rs"
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
                      <span className="Edit-tf-M-text-auto">
                        {r.productCode || "-"}
                      </span>
                    )}
                  </td>

                  {/* ชื่อ */}
                  <td>
                    <span className="Edit-tf-M-text-auto">
                      {s?.product_name || "Auto Show"}
                    </span>
                  </td>

                  {/* Lock No. (location_name) */}
                  <td>
                    {r.isEditing ? (
                      <Select
                        className="Edit-tf-M-react-select"
                        classNamePrefix="Edit-tf-M-rs"
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
                      <span className="Edit-tf-M-text-auto">
                        {r.lockNo || "-"}
                      </span>
                    )}
                  </td>

                  {/* Lot serial. (lot_name) */}
                  <td>
                    {r.isEditing ? (
                      <Select
                        className="Edit-tf-M-react-select"
                        classNamePrefix="Edit-tf-M-rs"
                        menuPortalTarget={selectPortalTarget ?? undefined}
                        menuPosition="fixed"
                        styles={selectStyles}
                        options={lotOptionsByCodeLock(r.productCode, r.lockNo)}
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
                        isClearable
                        isDisabled={
                          loading || busy || !r.productCode || !r.lockNo
                        }
                        placeholder={
                          r.lockNo ? "Select lot..." : "Select lock first"
                        }
                      />
                    ) : (
                      <span className="Edit-tf-M-text-auto">
                        {r.lotSerial || "-"}
                      </span>
                    )}
                  </td>

                  {/* QTY */}
                  <td>
                    {r.isEditing ? (
                      <input
                        className="Edit-tf-M-input-sm"
                        value={r.qty}
                        onChange={(e) => setRowQty(r.rowId, e.target.value)}
                        placeholder="ระบุจำนวน"
                        disabled={busy}
                      />
                    ) : (
                      <span className="Edit-tf-M-text-auto">
                        {r.qty === "" ? "-" : String(r.qty)}
                      </span>
                    )}
                  </td>

                  {/* หน่วย */}
                  <td>
                    <span className="Edit-tf-M-text-auto">
                      {s?.unit || "Auto Show"}
                    </span>
                  </td>

                  {/* Expire */}
                  <td>
                    <span className="Edit-tf-M-text-auto">
                      {s?.expiration_date
                        ? formatDateTime(s.expiration_date)
                        : "Auto Show"}
                    </span>
                  </td>

                  {/* Action */}
                  <td className="Edit-tf-M-td-action">
                    <button
                      className="Edit-tf-M-kebab"
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
                        className="Edit-tf-M-action-menu"
                        onClick={(e) => e.stopPropagation()}
                        role="menu"
                      >
                        <button
                          className="Edit-tf-M-action-item"
                          onClick={() => setRowEditing(r.rowId, true)}
                          type="button"
                        >
                          Edit
                        </button>
                        <button
                          className="Edit-tf-M-action-item danger"
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
              <td colSpan={9} className="Edit-tf-M-addrow-cell">
                <button
                  className="Edit-tf-M-addrow"
                  onClick={addRow}
                  type="button"
                  disabled={loading || busy || isCompleted}
                >
                  + เพิ่มรายการ
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* footer buttons */}
      <div className="Edit-tf-M-footer">
        <button
          className="Edit-tf-M-btn danger"
          onClick={handleCancel}
          type="button"
        >
          ยกเลิก
        </button>
        <button
          className="Edit-tf-M-btn primary"
          onClick={handleConfirm}
          type="button"
          disabled={busy || loading || isCompleted}
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
}

export default EditTransferMovement;
