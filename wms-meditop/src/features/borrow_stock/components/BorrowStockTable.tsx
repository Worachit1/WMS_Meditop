import React, { useMemo, useState } from "react";
import type { BorrowStockType } from "../types/borrow_stock.type";
import { useNavigate } from "react-router-dom";

import Table from "../../../components/Table/Table";
import "../../../components/Button/button.css";
import "../../../components/Table/table.css";
import "../../../styles/component.css";
import { formatDateTime } from "../../../components/Datetime/FormatDateTime";
import "../borrow_stock.css";

import { borrowStockApi } from "../services/borrow_stock.api";

import { confirmAlert, successAlert, warningAlert } from "../../../utils/alert";

type Props = {
  borrow_stocks: BorrowStockType[];
  searchQuery: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearSearch: () => void;
  showFilterDropdown: boolean;
  onToggleFilter: () => void;
  searchableColumns: {
    date: boolean;
    location_name: boolean;
    department: boolean;
    status: boolean;
    user_ref: boolean;
  };
  onToggleSearchableColumn: (column: keyof Props["searchableColumns"]) => void;
  onClearAllColumns: () => void;
  currentPage?: number;
  itemsPerPage?: number;
  onRefresh?: () => void;
};

type ViewMode = "pending" | "done";

function formatDepartments(deps: any): string[] {
  if (!deps) return ["-"];
  if (Array.isArray(deps)) {
    const names = deps.map((d: any) => d?.short_name ?? d?.full_name ?? "-").filter(Boolean);
    return names.length > 0 ? names : ["-"];
  }
  if (typeof deps === "string") return [deps];
  return [deps?.short_name ?? deps?.full_name ?? "-"];
}

async function updateBorrowStatusToCompleted(id: number) {
  return borrowStockApi.update(id, { status: "completed" } as any);
}

const getStatusLabel = (status?: string) => {
  switch (status) {
    case "in-process":
    case "in-progress":
      return "IN PROCESS";
    case "pending":
      return "PENDING";
    case "completed":
      return "COMPLETED";
    default:
      return status ?? "-";
  }
};

const BorrowStockTable = ({
  borrow_stocks,
  searchQuery,
  onSearchChange,
  onClearSearch,
  showFilterDropdown,
  onToggleFilter,
  searchableColumns,
  onToggleSearchableColumn,
  onClearAllColumns,
  currentPage = 1,
  itemsPerPage = 10,
  onRefresh,
}: Props) => {
  const navigate = useNavigate();

  const [viewMode, setViewMode] = useState<ViewMode>("pending");
  const [verifyingId, setVerifyingId] = useState<number | null>(null);

  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([
    "all",
  ]);
  const [showDeptDropdown, setShowDeptDropdown] = useState(false);

  const toggleDepartment = (dept: string) => {
    if (dept === "all") {
      setSelectedDepartments(["all"]);
    } else {
      setSelectedDepartments((prev) => {
        const withoutAll = prev.filter((d) => d !== "all");
        if (withoutAll.includes(dept)) {
          const next = withoutAll.filter((d) => d !== dept);
          return next.length === 0 ? ["all"] : next;
        }
        return [...withoutAll, dept];
      });
    }
    setViewMode("pending");
  };

  const onView = (row: BorrowStockType) => {
    navigate(`/borrow_stock/view/${row.id}`);
  };



  const tableHeaders = [
    "No",
    "Date/Time",
    "Location",
    "Department",
    "Status",
    "User",
    "Action",
  ];

  const onBorrow = () => {
    navigate("/borrow_stock/add");
  };

  const onEdit = (row: BorrowStockType) => {
    navigate(`/borrow_stock/edit/${row.id}`);
  };

  const handleDelete = async (row: BorrowStockType) => {
    const result = await confirmAlert(
      "ยืนยันการลบ? หากยืนยันแล้วข้อมูลจะถูกลบอย่างถาวร",
    );
    if (!(result as any)?.isConfirmed) return;

    try {
      await borrowStockApi.remove(row.id);
      await successAlert("ลบข้อมูลสำเร็จ");
      onRefresh?.();
    } catch (err) {
      console.error(err);
      await warningAlert("ลบข้อมูลไม่สำเร็จ กรุณาลองใหม่");
    }
  };

  // unique departments จากข้อมูลที่ได้มา
  const departmentOptions = useMemo(() => {
    const depts = new Set<string>();
    (borrow_stocks || []).forEach((x) => {
      formatDepartments((x as any).departments).forEach((label) => {
        if (label && label !== "-") depts.add(label);
      });
    });
    return Array.from(depts).sort();
  }, [borrow_stocks]);

  // filter by selected departments ก่อน แยก done/pending
  const filteredBorrowStocks = useMemo(() => {
    if (
      selectedDepartments.length === 0 ||
      selectedDepartments.includes("all") ||
      selectedDepartments.includes("CNE")
    ) {
      return borrow_stocks || [];
    }
    return (borrow_stocks || []).filter((x) =>
      formatDepartments((x as any).departments).some((d) =>
        selectedDepartments.includes(d),
      ),
    );
  }, [borrow_stocks, selectedDepartments]);

  const { pendingList, doneList } = useMemo(() => {
    const pending: BorrowStockType[] = [];
    const done: BorrowStockType[] = [];

    (filteredBorrowStocks || []).forEach((x: any) => {
      const st = String(x?.status ?? "").toLowerCase();

      if (st === "completed") done.push(x);
      else if (st === "pending" || st === "in-progress" || st === "in-process")
        pending.push(x);
      else pending.push(x);
    });

    return { pendingList: pending, doneList: done };
  }, [filteredBorrowStocks]);

  const pendingCount = pendingList.length;
  const doneCount = doneList.length;

  const viewRows = viewMode === "done" ? doneList : pendingList;

  const handleVerify = async (row: BorrowStockType) => {
    if (verifyingId) return;

    const result = await confirmAlert(
      "ยืนยันการตรวจสอบ? หากยืนยันแล้วสถานะจะเปลี่ยนเป็น Completed",
    );

    if (!(result as any)?.isConfirmed) return;

    setVerifyingId((row as any).id);

    try {
      await updateBorrowStatusToCompleted((row as any).id);
      await successAlert("สำเร็จ", "อัปเดตสถานะเป็น Completed แล้ว");
      onRefresh?.();
      window.location.reload();
    } catch (e) {
      console.error(e);
      await warningAlert("ไม่สำเร็จ อัปเดตสถานะไม่ได้ กรุณาลองใหม่");
    } finally {
      setVerifyingId(null);
    }
  };

  return (
    <>
      <div className="page-header">
        <div className="page-title">Borrow Stock</div>

        <div className="toolbar">
          {/* Department filter */}
          {departmentOptions.length > 0 && (
            <div className="inbound-dept-filter">
              <label>แผนก:</label>
              <div className="filter-wrap">
                <button
                  type="button"
                  className="inbound-dept-select"
                  onClick={() => setShowDeptDropdown((v) => !v)}
                >
                  {selectedDepartments.includes("all")
                    ? "ทั้งหมด"
                    : selectedDepartments.join(", ")}
                  <i
                    className="fa fa-chevron-down"
                    style={{ marginLeft: 45 }}
                  />
                </button>
                {showDeptDropdown && (
                  <div className="filter-dropdown-2">
                    <label className="filter-option">
                      <input
                        type="checkbox"
                        checked={selectedDepartments.includes("all")}
                        onChange={() => toggleDepartment("all")}
                      />
                      <span>ทั้งหมด</span>
                    </label>
                    {departmentOptions.map((dept) => (
                      <label className="filter-option" key={dept}>
                        <input
                          type="checkbox"
                          checked={
                            selectedDepartments.includes("all") ||
                            selectedDepartments.includes(dept) ||
                            selectedDepartments.includes("CNE")
                          }
                          onChange={() => toggleDepartment(dept)}
                        />
                        <span>{dept}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="search-box">
            <i className="fa fa-search search-icon" />
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={onSearchChange}
            />
            {searchQuery && (
              <button
                type="button"
                className="clear-btn"
                onClick={onClearSearch}
              >
                <i className="fa fa-xmark"></i>
              </button>
            )}
          </div>

          <div className="filter-wrap">
            <button className="filter-btn" onClick={onToggleFilter}>
              <i className="fa fa-filter"></i> Filter
            </button>

            {showFilterDropdown && (
              <div className="filter-dropdown-2">
                <div className="filter-title">
                  Search In Columns
                  <button
                    type="button"
                    className="filter-clear-btn"
                    onClick={onClearAllColumns}
                  >
                    <i className="fa fa-xmark"></i>
                  </button>
                </div>

                {Object.entries({
                  date: "Date/Time",
                  location_name: "Location",
                  department: "Department",
                  status: "Status",
                  user_ref: "User",
                }).map(([key, label]) => (
                  <label className="filter-option" key={key}>
                    <input
                      type="checkbox"
                      checked={
                        searchableColumns[key as keyof typeof searchableColumns]
                      }
                      onChange={() =>
                        onToggleSearchableColumn(
                          key as keyof typeof searchableColumns,
                        )
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <button className="borrow-btn-borrow_stock" onClick={onBorrow}>
            Count
          </button>
        </div>
      </div>

      <div
        className="borrow-view-tabs"
        style={{ marginTop: 10, marginBottom: 10 }}
      >
        <button
          type="button"
          className={`borrow-tab ${viewMode === "pending" ? "active" : ""}`}
          onClick={() => setViewMode("pending")}
        >
          รอดำเนินการ <span className="badge">{pendingCount}</span>
        </button>

        <button
          type="button"
          className={`borrow-tab ${viewMode === "done" ? "active" : ""}`}
          onClick={() => setViewMode("done")}
        >
          ดำเนินการเสร็จสิ้น <span className="badge">{doneCount}</span>
        </button>
      </div>

      <div className="table__wrapper">
        <Table headers={tableHeaders}>
          {viewRows.length === 0 ? (
            <tr>
              <td colSpan={tableHeaders.length} className="no-data">
                {viewMode === "done"
                  ? "No completed borrow stocks found."
                  : "No pending borrow stocks found."}
              </td>
            </tr>
          ) : (
            viewRows.map((borrow_stock: any, index: number) => {
              const st = String(borrow_stock?.status ?? "").toLowerCase();
              const canVerify =
                viewMode === "pending" &&
                (st === "pending" ||
                  st === "in-progress" ||
                  st === "in-process");
              const busy = verifyingId === borrow_stock.id;

              return (
                <tr key={borrow_stock.id}>
                  <td>{(currentPage - 1) * itemsPerPage + index + 1}</td>
                  <td>{formatDateTime(borrow_stock.created_at)}</td>
                  <td>{borrow_stock.location_name ?? "-"}</td>
                  <td>
                    {formatDepartments(borrow_stock.departments).map((name, i) => (
                      <React.Fragment key={i}>
                        {name}
                        {i < formatDepartments(borrow_stock.departments).length - 1 && <br />}
                      </React.Fragment>
                    ))}
                  </td>
                  <td>{getStatusLabel(borrow_stock.status) ?? "-"}</td>
                  <td>{borrow_stock.user_ref ?? "-"}</td>
                  <td>
                    <div className="borrow_stock-actions-buttons">
                      {viewMode === "pending" ? (
                        <>
                          <button
                            type="button"
                            className="borrow-action-btn borrow-action-verify"
                            disabled={!canVerify || busy}
                            onClick={() => handleVerify(borrow_stock)}
                            title={
                              canVerify ? "Verify" : "สถานะไม่สามารถ Verify ได้"
                            }
                          >
                            {busy ? "Verifying..." : "Verify"}
                          </button>

                          <button
                            type="button"
                            className="borrow-action-btn borrow-action-btn-edit"
                            onClick={() => onEdit(borrow_stock)}
                          >
                            Edit
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="borrow-action-btn borrow-action-btn-view"
                          onClick={() => onView(borrow_stock)}
                        >
                          View
                        </button>
                      )}

                      <button
                        type="button"
                        className="borrow-action-btn borrow-action-btn-delete"
                        onClick={() => handleDelete(borrow_stock)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </Table>
      </div>
    </>
  );
};

export default BorrowStockTable;
