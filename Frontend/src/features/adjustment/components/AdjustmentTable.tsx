import React, { useMemo, useState } from "react";
import type { AdjustmentType } from "../types/adjustment.type";

import Table from "../../../components/Table/Table";
import "../../../components/Button/button.css";
import "../../../components/Table/table.css";
import "../../../styles/component.css";
import "../adjustment.css";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

type SearchableColumns = {
  date: boolean;
  no: boolean;
  location: boolean;
  reference: boolean;
  type: boolean;
  status: boolean;
};

type Props = {
  adjustments: AdjustmentType[];
  searchQuery: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearSearch: () => void;
  showFilterDropdown: boolean;
  onToggleFilter: () => void;
  searchableColumns: SearchableColumns;
  onToggleSearchableColumn: (column: keyof SearchableColumns) => void;
  onClearAllColumns: () => void;
  currentPage?: number;
  itemsPerPage?: number;
  onRefresh?: () => void;
  levelTab: "manual" | "auto";
  statusTab: "pending" | "completed";
  statusCounts: {
    manual: {
      pending: number;
      completed: number;
    };
    auto: {
      pending: number;
      completed: number;
    };
  };
  onChangeLevelTab: (level: "manual" | "auto") => void;
  onChangeStatusTab: (status: "pending" | "completed") => void;
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

// ✅ completed เมื่อ status completed OR in_process true
const isCompletedAdj = (a: any) =>
  String(a?.status ?? "") === "completed" || Boolean(a?.in_process) === true;

// ✅ แยก source จาก field ที่มีจริง
// - outbound: มี out_type (แม้เป็น "")
// - adjust: มี type (แม้เป็น "")
const detectSrc = (adj: any): "outbound" | "adjust" => {
  if (adj?.is_system_generated === true) return "outbound";
  if (adj?.is_system_generated === false) return "adjust";

  const source = String(adj?.source ?? "").toLowerCase();
  if (source === "outbound" || source === "adjust") return source;

  if (Object.prototype.hasOwnProperty.call(adj ?? {}, "out_type"))
    return "outbound";
  return "adjust";
};

const toUiStatus = (a: any): "pending" | "in-progress" | "completed" => {
  if (isCompletedAdj(a)) return "completed";
  if (String(a?.status ?? "") === "pending") return "pending";
  return "in-progress";
};

const statusLabel = (a: any) => {
  const ui = toUiStatus(a);
  if (ui === "pending") return "Pending";
  if (ui === "in-progress") return "In Progress";
  return "Completed";
};

const AdjustmentTable = ({
  adjustments,
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
  levelTab,
  statusTab,
  statusCounts,
  onChangeLevelTab,
  onChangeStatusTab,
}: Props) => {
  const navigate = useNavigate();
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([
    "all",
  ]);
  const [showDeptDropdown, setShowDeptDropdown] = useState(false);

  const departmentOptions = useMemo(() => {
    const depts = new Set<string>();
    (adjustments as any[]).forEach((a) => {
      const dept = a?.department;
      if (dept) depts.add(dept);
    });
    return Array.from(depts).sort();
  }, [adjustments]);

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

  const viewAdjustments = useMemo(() => {
    let list = adjustments as any[];

    if (!selectedDepartments.includes("all")) {
      list = list.filter((a) =>
        selectedDepartments.includes(a?.department ?? ""),
      );
    }

    return list;
  }, [adjustments, selectedDepartments]);

  // ✅ View ไปหน้า detail
  const openDetail = (adj: any) => {
  const id = adj?.id;
  if (!id) return;

  const src = detectSrc(adj);

  navigate(`/adjustment/${id}?src=${src}`, {
    state: {
      navGroup,
      level: levelTab,
      status: statusTab,
      detailList: viewAdjustments.map((x: any) => ({
        id: Number(x.id),
        src: detectSrc(x),
      })),
      detailTotal:
        levelTab === "auto"
          ? Number(statusCounts.auto.completed ?? 0)
          : statusTab === "completed"
            ? Number(statusCounts.manual.completed ?? 0)
            : Number(statusCounts.manual.pending ?? 0),
    },
  });
};

 const openManualAdjust = (adj: any) => {
  const id = adj?.id;
  if (!id) return;

  const src = detectSrc(adj);

  navigate(`/adjustment/${id}/manual?src=${src}`, {
    state: {
      navGroup,
      level: levelTab,
      status: statusTab,
      detailList: viewAdjustments.map((x: any) => ({
        id: Number(x.id),
        src: detectSrc(x),
      })),
      detailTotal:
        levelTab === "auto"
          ? Number(statusCounts.auto.completed ?? 0)
          : statusTab === "completed"
            ? Number(statusCounts.manual.completed ?? 0)
            : Number(statusCounts.manual.pending ?? 0),
    },
  });
};

  // ✅ Process/Continue ตอนนี้ทำเป็น toast ไว้ก่อน (ภายหลังค่อย navigate)
  const handleProcessOrContinue = (adj: any) => {
    const ui = toUiStatus(adj);
    const src = detectSrc(adj);
    const no = String(adj?.no ?? "-");
    const label = ui === "pending" ? "Process" : "Continue";

    toast.info(`[${label}] ${no} (${src}) - coming soon`);
  };

  const navGroup =
  levelTab === "auto"
    ? "auto_completed"
    : statusTab === "completed"
      ? "manual_completed"
      : "manual_pending";

  const tableHeaders = [
    "No",
    "Date",
    "Adjustment ID",
    "Location",
    "Reference Doc",
    "Type",
    "Status",
    "Action",
  ];

  return (
    <>
      <div className="page-header">
        <div className="page-title">Adjustment</div>
      </div>

      <div className="adjustment-toolbar-row">
        <div className="adjustment-tabs">
          {levelTab !== "auto" && (
            <button
              type="button"
              className={`adjustment-tab ${statusTab === "pending" ? "active" : ""}`}
              onClick={() => onChangeStatusTab("pending")}
            >
              กำลังดำเนินการ{" "}
              <span className="badge">
                {statusCounts[levelTab]?.pending ?? 0}
              </span>
            </button>
          )}

          <button
            type="button"
            className={`adjustment-tab ${statusTab === "completed" ? "active" : ""}`}
            onClick={() => onChangeStatusTab("completed")}
          >
            ดำเนินการเสร็จสิ้น{" "}
            <span className="badge">
              {statusCounts[levelTab]?.completed ?? 0}
            </span>
          </button>
        </div>

        <div className="toolbar">
          <div className="adjustment-source-options">
            <label className="adjustment-source-option">
              <input
                type="checkbox"
                checked={levelTab === "manual"}
                onChange={() => {
                  onChangeLevelTab("manual");
                  onChangeStatusTab("pending");
                }}
              />
              <span>Manual</span>
            </label>

            <label className="adjustment-source-option">
              <input
                type="checkbox"
                checked={levelTab === "auto"}
                onChange={() => {
                  onChangeLevelTab("auto");
                  onChangeStatusTab("completed");
                }}
              />
              <span>Auto</span>
            </label>
          </div>

          {departmentOptions.length > 0 && (
            <div className="adjustment-dept-filter">
              <label>แผนก:</label>
              <div className="filter-wrap">
                <button
                  type="button"
                  className="adjustment-dept-select"
                  onClick={() => setShowDeptDropdown((v) => !v)}
                >
                  {selectedDepartments.includes("all")
                    ? "ทั้งหมด"
                    : selectedDepartments.join(", ")}
                  <i className="fa fa-chevron-down" style={{ marginLeft: 8 }} />
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
            <button
              className="filter-btn"
              onClick={onToggleFilter}
              type="button"
            >
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
                  no: "Adjustment ID",
                  location: "Location",
                  reference: "Reference Doc",
                  type: "Type",
                  status: "Status",
                }).map(([key, label]) => (
                  <label className="filter-option" key={key}>
                    <input
                      type="checkbox"
                      checked={
                        searchableColumns[key as keyof SearchableColumns]
                      }
                      onChange={() =>
                        onToggleSearchableColumn(key as keyof SearchableColumns)
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

      <div className="table__wrapper">
        <Table headers={tableHeaders}>
          {viewAdjustments.length === 0 ? (
            <tr>
              <td colSpan={tableHeaders.length} className="no-data">
                No adjustments found.
              </td>
            </tr>
          ) : (
            viewAdjustments.map((adj: any, index: number) => {
              const rowKey = adj?.id
                ? `${detectSrc(adj)}-${String(adj.id)}`
                : `adjustment-${index}`;

              const ui = toUiStatus(adj);
              const isCompletedTab =
                statusTab === "completed" || ui === "completed";
              const isPendingTab = statusTab === "pending";

              const actionText = isCompletedTab
                ? "View"
                : ui === "pending"
                  ? "Process"
                  : "Continue";

              const actionClass = isCompletedTab
                ? "adjustment-action-btn adjustment-action-btn-view"
                : ui === "pending"
                  ? "adjustment-action-btn adjustment-action-btn-process"
                  : "adjustment-action-btn adjustment-action-btn-continue";

              const typeText = adj?.out_type ?? adj?.type ?? "-";

              const onActionClick = () => {
                if (isCompletedTab)
                  openDetail(adj); // ✅ View
                else if (isPendingTab)
                  openManualAdjust(adj); // ✅ Manual Adjustment
                else handleProcessOrContinue(adj); // ✅ toast (Process/Continue)
              };

              return (
                <tr key={rowKey}>
                  <td>{(currentPage - 1) * itemsPerPage + index + 1}</td>
                  <td>{formatDateTime(adj.date)}</td>
                  <td>{adj.no}</td>
                  <td>{adj.location ?? "-"}</td>
                  <td>{adj.reference ?? adj.origin ?? "-"}</td>
                  <td>{typeText}</td>
                  <td>{statusLabel(adj)}</td>

                  <td>
                    <button
                      className={actionClass}
                      type="button"
                      onClick={onActionClick}
                    >
                      {actionText}
                    </button>
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

export default AdjustmentTable;
