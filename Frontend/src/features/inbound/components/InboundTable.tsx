import React, { useEffect, useState } from "react";
import type { InboundType } from "../types/inbound.type";
import { departmentApi } from "../../department/services/department.api";

import Table from "../../../components/Table/Table";
import "../../../components/Button/button.css";
import "../../../components/Table/table.css";
import "../../../styles/component.css";
import "../inbound.css";
import { Link } from "react-router-dom";

type Props = {
  inbound: InboundType[];
  activeTab: "pending" | "completed";
  onTabChange: (tab: "pending" | "completed") => void;
  statusCounts: {
    pending: number;
    completed: number;
  };
  searchQuery: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearSearch: () => void;
  showFilterDropdown: boolean;
  onToggleFilter: () => void;
  searchableColumns: {
    no: boolean;
    invoice: boolean;
    date: boolean;
    department: boolean;
    code: boolean;
    reference: boolean;
    origin: boolean;
    status: boolean;
  };
  onToggleSearchableColumn: (column: keyof Props["searchableColumns"]) => void;
  onClearAllColumns: () => void;
  currentPage?: number;
  itemsPerPage?: number;

  selectedDepartmentFilter?: string[];
  onDepartmentFilterChange?: (departments: string[]) => void;
};

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
  activeTab,
  onTabChange,
  statusCounts,
  searchQuery,
  onSearchChange,
  onClearSearch,
  showFilterDropdown,
  onToggleFilter,
  searchableColumns,
  onToggleSearchableColumn,
  onClearAllColumns,
  selectedDepartmentFilter,
  onDepartmentFilterChange,
  currentPage = 1,
  itemsPerPage = 10,
}: Props) => {
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>(
    selectedDepartmentFilter?.length ? selectedDepartmentFilter : ["all"],
  );

  const [showDeptDropdown, setShowDeptDropdown] = useState(false);

  const [departmentOptions, setDepartmentOptions] = useState<string[]>([]);

  const getCurrentUserDepartments = (): string[] => {
    const rawDepartments = localStorage.getItem("departments");

    if (rawDepartments) {
      try {
        const parsed = JSON.parse(rawDepartments);

        if (Array.isArray(parsed)) {
          return parsed
            .map((d: any) => String(d?.short_name ?? "").trim())
            .filter(Boolean);
        }
      } catch {
        // fallback ด้านล่าง
      }
    }

    return String(localStorage.getItem("department") || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  };

  const currentUserLevel = localStorage.getItem("user_level") || "";
  const currentUserDepartments = getCurrentUserDepartments();

  const canSeeAllDepartments =
    currentUserLevel === "Admin" || currentUserDepartments.includes("CNE");

  const applyDepartmentFilter = (next: string[]) => {
    setSelectedDepartments(next);
    onDepartmentFilterChange?.(next);
  };

  const toggleDepartment = (dept: string) => {
    if (dept === "all") {
      applyDepartmentFilter(["all"]);
      return;
    }

    setSelectedDepartments((prev) => {
      const withoutAll = prev.filter((d) => d !== "all");

      const next = withoutAll.includes(dept)
        ? withoutAll.filter((d) => d !== dept)
        : [...withoutAll, dept];

      const finalNext = next.length === 0 ? ["all"] : next;

      onDepartmentFilterChange?.(finalNext);

      return finalNext;
    });
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

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const resp: any = await departmentApi.getAll();

        const rows = Array.isArray(resp?.data?.data)
          ? resp.data.data
          : Array.isArray(resp?.data)
            ? resp.data
            : [];

        const allDeptNames = rows
          .map((d: any) => String(d?.short_name ?? "").trim())
          .filter(Boolean)
          .sort();

        if (canSeeAllDepartments) {
          setDepartmentOptions(allDeptNames);
          return;
        }

        const ownDeptOptions = currentUserDepartments
          .filter((dept) => allDeptNames.includes(dept))
          .sort();

        setDepartmentOptions(ownDeptOptions);
      } catch (err) {
        console.error("Fetch departments failed:", err);
        setDepartmentOptions([]);
      }
    };

    fetchDepartments();
  }, [canSeeAllDepartments, currentUserDepartments.join(",")]);

  useEffect(() => {
    if (selectedDepartmentFilter?.length) {
      setSelectedDepartments(selectedDepartmentFilter);
    }
  }, [selectedDepartmentFilter]);

  useEffect(() => {
    if (departmentOptions.length === 0) return;

    setSelectedDepartments((prev) => {
      if (prev.includes("all")) return prev;

      const validSelected = prev.filter((dept) =>
        departmentOptions.includes(dept),
      );

      return validSelected.length > 0 ? validSelected : ["all"];
    });
  }, [departmentOptions]);

  // ✅ ใช้ตรงนี้เลย
  const viewRows = inbound || [];

  return (
    <>
      <div className="page-header">
        <div className="page-title">Inbound</div>

        <div className="toolbar">
          {/* Department filter */}
          {departmentOptions.length > 0 && (
            <div className="dept-filter">
              <label>แผนก:</label>
              <div className="filter-wrap">
                <button
                  type="button"
                  className="dept-select"
                  onClick={() => setShowDeptDropdown((v) => !v)}
                >
                  <span>
                    {selectedDepartments.includes("all")
                      ? "ทั้งหมด"
                      : selectedDepartments.join(", ")}
                  </span>

                  <i className="fa fa-chevron-down" />
                </button>
                {showDeptDropdown && (
                  <div className="filter-dropdown-3">
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
                          checked={selectedDepartments.includes(dept)}
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
                    clear
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
          className={`inbound-tab ${activeTab === "pending" ? "active" : ""}`}
          onClick={() => onTabChange("pending")}
        >
          รอดำเนินการ <span className="badge">{statusCounts.pending}</span>
        </button>

        <button
          type="button"
          className={`inbound-tab ${activeTab === "completed" ? "active" : ""}`}
          onClick={() => onTabChange("completed")}
        >
          ดำเนินการเสร็จสิ้น{" "}
          <span className="badge">{statusCounts.completed}</span>
        </button>
      </div>

      <br />
      <div className="table__wrapper">
        <Table headers={tableHeaders}>
          {viewRows.length === 0 ? (
            <tr>
              <td colSpan={tableHeaders.length} className="no-data">
                {activeTab === "completed"
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
                    state={{
                      status: activeTab,
                      detailList: viewRows.map((x) => ({ no: x.no })),
                      detailTotal:
                        activeTab === "completed"
                          ? statusCounts.completed
                          : statusCounts.pending,
                    }}
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
