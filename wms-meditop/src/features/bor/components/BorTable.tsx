import { useMemo, useState } from "react";
import type { BorType } from "../types/bor.type";

import Table from "../../../components/Table/Table";
import "../../../components/Button/button.css";
import "../../../components/Table/table.css";
import "../../../styles/component.css";
import { formatDateTime } from "../../../components/Datetime/FormatDateTime";
import * as XLSX from "xlsx";

import IconButton from "../../../components/Button/IconButton";
import { confirmAlert } from "../../../utils/alert";
import {useNavigate } from "react-router-dom";

import "../bor.css";

type Props = {
  bors: BorType[];
  searchQuery: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearSearch: () => void;

  snapshotDate: string;

  showFilterDropdown: boolean;
  onToggleFilter: () => void;
  searchableColumns: {
    no: boolean;
    created_at: boolean;
    location_name: boolean;
    location_dest_name: boolean;
    department: boolean;
    status: boolean;

  };

  onToggleSearchableColumn: (column: keyof Props["searchableColumns"]) => void;
  onClearAllColumns: () => void;

  onExportAll: () => Promise<BorType[]>;

  currentPage?: number;
  itemsPerPage?: number;
};

const resolveStr = (val: any): string => {
  if (!val) return "-";
  if (typeof val === "string") return val;
  return val.full_name ?? val.short_name ?? val.department_code ?? "-";
};

const formatDisplayDate = (value: string) => {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year.slice(-2)}`;
};

const getStatusLabel = (status?: string) => {
  switch (status) {
    case "waiting":
      return "WAITING";
    case "error":
      return "ERROR";
    case "done":
      return "DONE";
    default:
      return status ?? "-";
  }
};


const BorTable = ({
  bors,
  searchQuery,
  onSearchChange,
  onClearSearch,
  snapshotDate,
  showFilterDropdown,
  onToggleFilter,
  searchableColumns,
  onToggleSearchableColumn,
  onClearAllColumns,
  onExportAll,
  currentPage = 1,
  itemsPerPage = 10,
}: Props) => {
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([
    "all",
  ]);
  const [showDeptDropdown, setShowDeptDropdown] = useState(false);

  const toggleDepartment = (dept: string) => {
    if (dept === "all") {
      setSelectedDepartments(["all"]);
      return;
    }

    setSelectedDepartments((prev) => {
      const withoutAll = prev.filter((d) => d !== "all");
      if (withoutAll.includes(dept)) {
        const next = withoutAll.filter((d) => d !== dept);
        return next.length === 0 ? ["all"] : next;
      }
      return [...withoutAll, dept];
    });
  };

  const departmentOptions = useMemo(() => {
    const depts = new Set<string>();
    (bors || []).forEach((b: any) => {
      const name = String(resolveStr(b?.department)).trim();
      if (name && name !== "-") depts.add(name);
    });
    return Array.from(depts).sort();
  }, [bors]);

  const filteredBors = useMemo(() => {
    if (
      selectedDepartments.length === 0 ||
      selectedDepartments.includes("all")
    ) {
      return bors;
    }

    return (bors || []).filter((b: any) => {
      const dept = String(resolveStr(b?.department)).trim();
      return dept ? selectedDepartments.includes(dept) : false;
    });
  }, [bors, selectedDepartments]);

  const tableHeaders = [
    "No",
    "Date/Time",
    "Doc No.",
    "Location",
    "Location Dest",
    "Department",
    "Status",
    "Action",

  ];

 const navigate = useNavigate();

  const handleExport = async () => {
    const result = await confirmAlert(
      `Export Excel วันที่ ${formatDisplayDate(snapshotDate)}?`,
    );
    if (!result.isConfirmed) return;

    try {
      const allRows = await onExportAll();

      const rows = allRows.map((s, index) => ({
        No: index + 1,
        "Date/Time": formatDateTime(s.created_at),
        "Location": resolveStr(s.location_name),
        "Location Dest": resolveStr(s.location_dest_name),
        "Department": resolveStr(s.department),
        "Status": resolveStr(s.status),
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Stock");

      const [year, month, day] = snapshotDate.split("-");
      const fileName = `stock_${day}-${month}-${year}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (error) {
      console.error("Export stock error:", error);
    }
  };

  return (
    <>
      <div className="page-header">
        <div className="page-title">
          Transfer - <span className="bor-title"> Swap</span>
        </div>

        <div className="toolbar">
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
                  <i className="fa fa-chevron-down" style={{ marginLeft: 6 }} />
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

          <div className="report-stock-date-wrap">
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
                    no: "No",
                    created_at: "Date/Time",
                    location_name: "Location",
                    location_dest_name: "Location Dest.",
                    department: "Department",
                    status: "Status",
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

          <IconButton variant="export" onClick={handleExport} />
        </div>
      </div>

      <div className="table__wrapper">
        <Table headers={tableHeaders}>
          {filteredBors.length === 0 ? (
            <tr>
              <td colSpan={tableHeaders.length} className="no-data">
                No stocks found.
              </td>
            </tr>
          ) : (
            filteredBors.map((bor, index) => (
              <tr key={bor.no}>
                <td>{(currentPage - 1) * itemsPerPage + index + 1}</td>      
                <td>{formatDateTime(bor.created_at)}</td>
                <td>{bor.no}</td>
                <td>{resolveStr(bor.location_name)}</td>
                <td>{resolveStr(bor.location_dest_name)}</td>
                <td>{resolveStr(bor.department)}</td>
                <td>{getStatusLabel(bor.status)}</td>
                <td>
                  <button
                    className="bor-table-btn"
                    onClick={() => navigate(`/bor/detail/${encodeURIComponent(bor.no)}`)}
                  >
                    Details
                  </button>
                </td>
              </tr>
            ))
          )}
        </Table>
      </div>
    </>
  );
};

export default BorTable;
