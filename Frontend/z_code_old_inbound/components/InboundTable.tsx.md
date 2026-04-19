import React, { useMemo, useState } from "react";
import type { InboundType } from "../types/inbound.type";

import Table from "../../../components/Table/Table";
import "../../../components/Button/button.css";
import "../../../components/Table/table.css";
import "../../../styles/component.css";
import "../inbound.css";
import { Link } from "react-router-dom";

type Props = {
  inbound: InboundType[];
  searchQuery: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearSearch: () => void;
  showFilterDropdown: boolean;
  onToggleFilter: () => void;
  searchableColumns: {
    no: boolean;
    invoice: boolean;
    origin: boolean;
    date: boolean;
    department: boolean;
    status: boolean;
  };
  onToggleSearchableColumn: (column: keyof Props["searchableColumns"]) => void;
  onClearAllColumns: () => void;
  currentPage?: number;
  itemsPerPage?: number;
};

type ViewMode = "pending" | "done";

const formatDateTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
};

// ✅ helper: safely convert number-ish
const toNum = (v: any) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

// ✅ done = ทุก items receive === count (และ receive > 0/หรือจะอนุญาต 0 ก็ได้)
// ถ้าคุณอยากให้ receive=0 ถือว่า done ได้ -> ตัดเงื่อนไข receive>0 ออก
const isDoneInbound = (inb: any) => {
  const items = (inb?.items || inb?.goods_ins || []) as any[];
  if (!Array.isArray(items) || items.length === 0) return false;

  return items.every((it) => {
    const r = toNum(it?.quantity_receive ?? it?.qty_receive ?? it?.qty ?? 0);
    const c = toNum(it?.quantity_count ?? it?.qty_count ?? 0);
    return r === c; // ✅ เงื่อนไขหลักของคุณ
  });
};

const getStatusLabel = (status?: string) => {
  switch (status) {
    case "in-process":
      return "IN PROCESS";
    case "pending":
      return "PENDING";
    case "completed":
      return "COMPLETED";
    default:
      return status ?? "-";
  }
};

const InboundTable = ({
  inbound,
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
}: Props) => {
  const [viewMode, setViewMode] = useState<ViewMode>("pending");
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>(["all"]);
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

  const tableHeaders = [
    "No",
    "Date",
    "Doc No.",
    "Invoice",
    "Origin",
    "Department",
    "Status",
    "Action",
  ];

  // unique departments จากข้อมูลที่ได้มา
  const departmentOptions = useMemo(() => {
    const depts = new Set<string>();
    (inbound || []).forEach((x) => {
      const dept = (x as any).department;
      if (dept) depts.add(dept);
    });
    return Array.from(depts).sort();
  }, [inbound]);

  // filter by selected departments ก่อน แยก done/pending
  const filteredInbound = useMemo(() => {
    if (
      selectedDepartments.length === 0 ||
      selectedDepartments.includes("all") ||
      selectedDepartments.includes("CNE")
    ) {
      return inbound || [];
    }
    return (inbound || []).filter((x) =>
      selectedDepartments.includes((x as any).department)
    );
  }, [inbound, selectedDepartments]);

  // ✅ แยก done/pending จาก inbound ที่ได้มา
  const { pendingList, doneList } = useMemo(() => {
    const done: InboundType[] = [];
    const pending: InboundType[] = [];

    filteredInbound.forEach((x) => {
      if (isDoneInbound(x)) done.push(x);
      else pending.push(x);
    });

    return { pendingList: pending, doneList: done };
  }, [filteredInbound]);

  const pendingCount = pendingList.length;
  const doneCount = doneList.length;

  const viewRows = viewMode === "done" ? doneList : pendingList;

  return (
    <>
      <div className="page-header">
        <div className="page-title">Inbound</div>

        <div className="toolbar">
          {/* Department filter */}
          {departmentOptions.length > 1 && (
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
                  <i className="fa fa-chevron-down" style={{ marginLeft: 45 }} />
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
                  date: "Date",
                  no: "Doc No.",
                   origin: "Origin",
                  invoice: "Invoice",
                  department: "Department",
                  code: "SKU",
                  reference: "Reference",
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

      {/* ✅ Tabs */}
      <div className="inbound-view-tabs">
        <button
          type="button"
          className={`inbound-tab ${viewMode === "pending" ? "active" : ""}`}
          onClick={() => setViewMode("pending")}
        >
          รอการดำเนินการ <span className="badge">{pendingCount}</span>
        </button>

        <button
          type="button"
          className={`inbound-tab ${viewMode === "done" ? "active" : ""}`}
          onClick={() => setViewMode("done")}
        >
          ดำเนินการเสร็จสิ้น <span className="badge">{doneCount}</span>
        </button>
      </div>

      <br />
      <div className="table__wrapper">
        <Table headers={tableHeaders}>
          {viewRows.length === 0 ? (
            <tr>
              <td colSpan={tableHeaders.length} className="no-data">
                {viewMode === "done"
                  ? "No completed inbound records."
                  : "No pending inbound records."}
              </td>
            </tr>
          ) : (
            viewRows.map((inboundItem, index) => (
              <tr key={inboundItem.no}>
                <td>{(currentPage - 1) * itemsPerPage + index + 1}</td>
                <td>{formatDateTime((inboundItem as any).date)}</td>
                <td>{inboundItem.no}</td>
                <td>{(inboundItem as any).invoice || "-"}</td>
                <td>{(inboundItem as any).origin || "-"}</td>
                <td>{(inboundItem as any).department}</td>
                <td>{getStatusLabel((inboundItem as any).status)}</td>
                <td>
                  <Link
                    to={`/inbound/${encodeURIComponent(inboundItem.no)}`}
                    className="inbound-details-btn"
                  >
                    Details
                  </Link>
                </td>
              </tr>
            ))
          )}
        </Table>
      </div>
    </>
  );
};

export default InboundTable;
