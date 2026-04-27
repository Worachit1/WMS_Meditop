import React, { useMemo, useState } from "react";
import type { TransferType } from "../types/tranfers.type";
import { useNavigate } from "react-router-dom";

import Table from "../../../components/Table/Table";
import "../../../components/Button/button.css";
import "../../../components/Table/table.css";
import "../../../styles/component.css";
import { formatDateTime } from "../../../components/Datetime/FormatDateTime";
import "../transfer-exp-ncr.css";

type Props = {
  transfers: TransferType[];

  searchQuery: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearSearch: () => void;

  showFilterDropdown: boolean;
  onToggleFilter: () => void;

  searchableColumns: {
    date: boolean;
    no: boolean;
    department: boolean;
    status: boolean;
    user_ref: boolean;
  };
  onToggleSearchableColumn: (column: keyof Props["searchableColumns"]) => void;
  onClearAllColumns: () => void;

  currentPage?: number;
  itemsPerPage?: number;

  statusTab: "pending" | "process" | "completed";
  statusCounts: {
    pending: number;
    process: number;
    completed: number;
  };
  onChangeStatusTab: (tab: "pending" | "process" | "completed") => void;
};


const toNum = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const getItems = (t: any) => (Array.isArray(t?.items) ? t.items : []);
const sumBy = (arr: any[], pick: (x: any) => any) =>
  arr.reduce((s, x) => s + toNum(pick(x)), 0);

// ✅ QTY รวม: ใช้ header ก่อน ถ้าไม่มีค่อย sum items
const getQty = (t: any) => {
  const header = toNum(t?.qty ?? t?.quantity_receive ?? t?.quantity ?? 0);
  if (header > 0) return header;
  return sumBy(
    getItems(t),
    (x) => x?.qty ?? x?.quantity_receive ?? x?.quantity,
  );
};

// ✅ COUNT รวม: ใช้ header ก่อน ถ้าไม่มีค่อย sum items
const getCount = (t: any) => {
  const header = toNum(t?.quantity_count);
  if (header > 0) return header;
  return sumBy(getItems(t), (x) => x?.quantity_count);
};

// ✅ PUT รวม: ใช้ quantity_put เป็นหลัก
const getPut = (t: any) => {
  const header = toNum(t?.quantity_put ?? t?.put);
  if (header > 0) return header;
  return sumBy(getItems(t), (x) => x?.quantity_put ?? x?.put);
};

// ✅ DONE: quantity_put === quantity_count
const isDone = (t: any) => {
  const counted = getCount(t);
  const put = getPut(t);
  if (counted <= 0) return false;
  return put === counted;
};

// ✅ MANAGE: count ครบแล้ว แต่ put ยังไม่เท่ากับ count
const isManage = (t: any) => {
  const qty = getQty(t);
  const counted = getCount(t);
  const put = getPut(t);

  if (qty <= 0) return false;
  return counted === qty && put !== counted;
};


const statusText = (t: any) => {
  if (isDone(t)) return "COMPLETED";
  if (isManage(t)) return "PROCESS";
  return "PENDING";
};

const TransferExpNcrTable = ({
  transfers,
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
  statusTab,
  statusCounts,
  onChangeStatusTab,
}: Props) => {
  const navigate = useNavigate();
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
  };

  const departmentOptions = useMemo(() => {
    const depts = new Set<string>();
    (transfers || []).forEach((t: any) => {
      if (t.department) depts.add(t.department);
    });
    return Array.from(depts).sort();
  }, [transfers]);


  const filteredTabTransfers = useMemo(() => {
    if (
      selectedDepartments.includes("all") ||
      selectedDepartments.length === 0
    ) {
      return transfers || [];
    }

    return (transfers || []).filter((t: any) =>
      selectedDepartments.includes(t.department ?? ""),
    );
  }, [transfers, selectedDepartments]);

  const currentDetailList = useMemo(() => {
    return filteredTabTransfers
      .map((x: any) => ({
        no: String(x?.no ?? "").trim(),
      }))
      .filter((x: any) => x.no);
  }, [filteredTabTransfers]);

  const getUserRefFromTransferItems = (t: any) => {
    const items = getItems(t);
    const refs = items
      .map((x: any) => String(x?.user_ref ?? "").trim())
      .filter(Boolean);
    if (refs.length === 0) return "-";
    const unique = Array.from(new Set(refs));
    return unique.length === 1 ? String(unique[0]) : "-";
  };

  const openDetail = (t: TransferType) => {
    const no = String((t as any)?.no ?? "").trim();
    if (!no) return;

    navigate(`/tf-exp-ncr/${encodeURIComponent(no)}`, {
      state: {
        detailList: currentDetailList,
        fromTab: statusTab,
      },
    });
  };

  const openPut = (t: TransferType) => {
    const no = String((t as any)?.no ?? "").trim();
    if (!no) return;

    navigate(`/tf-exp-ncr-put/${encodeURIComponent(no)}`, {
      state: {
        detailList: currentDetailList,
        fromTab: statusTab,
      },
    });
  };

  const openView = (t: TransferType) => {
    const no = String((t as any)?.no ?? "").trim();
    if (!no) return;

    navigate(`/tf-exp-ncr-view/${encodeURIComponent(no)}`, {
      state: {
        detailList: currentDetailList,
        fromTab: statusTab,
      },
    });
  };

  const tableHeaders = useMemo(
    () => [
      "No",
      "Date/Time",
      "Doc No.",
      "Department",
      "Status",
      "User",
      "Action",
    ],
    [],
  );

  return (
    <>
      <div className="page-header">
        <div className="page-title">
          Transfer - <span className="transfer-exp-ncr-title">EXP&amp;NCR</span>
        </div>

        <div className="toolbar">
          {departmentOptions.length > 1 && (
            <div className="tf-exp-ncr-dept-filter">
              <label>แผนก:</label>
              <div className="filter-wrap">
                <button
                  type="button"
                  className="tf-exp-ncr-dept-select"
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
                            selectedDepartments.includes(dept)
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
                  no: "Doc No.",
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
        </div>
      </div>

      <div className="transfer-exp-ncr-list-tabs">
        <button
          type="button"
          className={`transfer-exp-ncr-tab ${statusTab === "pending" ? "active" : ""}`}
          onClick={() => onChangeStatusTab("pending")}
        >
          รอการดำเนินการ <span className="badge">{statusCounts.pending}</span>
        </button>

        <button
          type="button"
          className={`transfer-exp-ncr-tab ${statusTab === "process" ? "active" : ""}`}
          onClick={() => onChangeStatusTab("process")}
        >
          จัดการสินค้า <span className="badge">{statusCounts.process}</span>
        </button>

        <button
          type="button"
          className={`transfer-exp-ncr-tab ${statusTab === "completed" ? "active" : ""}`}
          onClick={() => onChangeStatusTab("completed")}
        >
          ดำเนินการเสร็จสิ้น{" "}
          <span className="badge">{statusCounts.completed}</span>
        </button>
      </div>

      <div className="table__wrapper">
        <Table headers={tableHeaders}>
          {filteredTabTransfers.length === 0 ? (
            <tr>
              <td colSpan={tableHeaders.length} className="no-data">
                No transfers found.
              </td>
            </tr>
          ) : (
            filteredTabTransfers.map((t: any, index) => (
              <tr key={t.id ?? `${t.no}-${index}`}>
                <td>{(currentPage - 1) * itemsPerPage + index + 1}</td>
                <td>{t?.date ? formatDateTime(t.date) : "-"}</td>
                <td>
                  {t?.no ?? "-"}{" "}
                  {(() => {
                    const isExpNcrReturn =
                      t?.location === "WH/M_EXP&NCR" &&
                      t?.location_dest === "WH/MDT";

                    return isExpNcrReturn ? (
                      <i className="fa-solid fa-arrow-rotate-right" />
                    ) : null;
                  })()}
                </td>
                <td>{t?.department ?? "-"}</td>
                <td>{statusText(t)}</td>
                <td>{getUserRefFromTransferItems(t)}</td>

                <td>
                  {statusTab === "pending" ? (
                    <button
                      className="transfer-exp-ncr-details-btn"
                      onClick={() => openDetail(t)}
                    >
                      Details
                    </button>
                  ) : statusTab === "process" ? (
                    <button
                      className="transfer-exp-ncr-details-btn"
                      onClick={() => openPut(t)}
                    >
                      Put
                    </button>
                  ) : (
                    <button
                      className="transfer-exp-ncr-details-btn"
                      onClick={() => openView(t)}
                    >
                      View
                    </button>
                  )}
                </td>
              </tr>
            ))
          )}
        </Table>
      </div>
    </>
  );
};

export default TransferExpNcrTable;
