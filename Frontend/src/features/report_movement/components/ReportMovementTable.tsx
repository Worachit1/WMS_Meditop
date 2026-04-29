import { useMemo, useState } from "react";
import type { ReportMovementType } from "../types/report_movement.type";

import Table from "../../../components/Table/Table";
import "../../../components/Button/button.css";
import "../../../components/Table/table.css";
import "../../../styles/component.css";
import { formatDateTime } from "../../../components/Datetime/FormatDateTime";
import * as XLSX from "xlsx";

import IconButton from "../../../components/Button/IconButton";
import { confirmAlert } from "../../../utils/alert";

import "../report_movemnt.css";

function firstNonEmpty(...values: any[]): string | null {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function getItemExp(item: any): string | null {
  return firstNonEmpty(item?.exp, item?.expiration_date);
}

function getItemZoneType(item: any): string | null {
  return firstNonEmpty(item?.zone_type);
}

type SortDir = "asc" | "desc";

type BackendSortKey =
  | "created_at"
  | "no"
  | "type"
  | "code"
  | "location"
  | "location_dest"
  | "user_ref"
  | "source";

type Props = {
  report_movements: ReportMovementType[];
  searchQuery: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearSearch: () => void;

  snapshotDate: string;
  onSnapshotDateChange: (value: string) => void;
  onResetSnapshotDate: () => void;

  showFilterDropdown: boolean;
  onToggleFilter: () => void;
  searchableColumns: {
    no: boolean;
    created_at: boolean;
    type: boolean;
    department: boolean;
    product: boolean;
    name: boolean;
    unit: boolean;
    lot_serial: boolean;
    exp: boolean;
    zone_type: boolean;
    location: boolean;
    location_dest: boolean;
  };
  onToggleSearchableColumn: (column: keyof Props["searchableColumns"]) => void;
  onClearAllColumns: () => void;
  onExportAll: () => Promise<ReportMovementType[]>;

  currentPage?: number;
  itemsPerPage?: number;

  sortKey: BackendSortKey;
  sortDir: SortDir;
  onSortChange: (key: BackendSortKey, dir: SortDir) => void;
};

type ReportMovementListRow = {
  row_id: string;
  id: number | string;
  created_at: string;
  no: string;
  type: string;
  department?: string | null;
  product?: string | null;
  name?: string | null;
  unit?: string | null;
  lot_serial?: string | null;
  exp?: string | null;
  zone_type?: string | null;
  location?: string | null;
  location_dest?: string | null;
  user_ref?: string | null;
  source: string;
  qty?: number | null;
  system_qty?: number | null;
};

function getRowQty(mv: any, item: any): number | null {
  const raw =
    mv?.source === "transfer_doc"
      ? item?.quantity_receive
      : (item?.qty ??
        item?.quantity ??
        item?.quantity_receive ??
        item?.system_qty ??
        mv?.qty ??
        mv?.quantity);

  const qty = Number(raw);
  return Number.isFinite(qty) ? qty : null;
}

function getInQty(row: ReportMovementListRow): number | null {
  if (row.source === "inbound") return row.qty ?? null;

  if (row.source === "adjustment" && row.location_dest === "MDT") {
    return row.qty ?? null;
  }

  return null;
}

function getOutQty(row: ReportMovementListRow): number | null {
  if (
    row.source === "outbound" ||
    row.source === "transfer_movement" ||
    row.source === "transfer_doc" ||
    row.source === "swap"
  ) {
    return row.qty ?? null;
  }

  if (
    row.source === "adjustment" &&
    row.location_dest === "Inventory adjustment"
  ) {
    return row.qty ?? null;
  }

  return null;
}

function buildMovementRows(
  movements: ReportMovementType[],
): ReportMovementListRow[] {
  return (movements || []).flatMap((mv: any, mvIndex) => {
    const doc = mv?.document ?? null;

    const items =
      Array.isArray(doc?.items) && doc.items.length > 0
        ? doc.items
        : mv?.item
          ? [mv.item]
          : [null];

    return items.map((item: any, itemIndex: number) => {
      const rowId = [
        mv?.source ?? "source",
        mv?.id ?? mvIndex,
        item?.id ?? item?.sequence ?? itemIndex,
      ].join("-");

      return {
        row_id: rowId,
        id: mv.id,
        created_at: mv.created_at,
        no: String(mv.no ?? doc?.no ?? "-"),
        type: String(mv.type ?? doc?.out_type ?? doc?.in_type ?? "-"),
        department: firstNonEmpty(
          doc?.department,
          doc?.department_raw,
          item?.department,
        ),
        product: firstNonEmpty(
          item?.code,
          item?.product_code,
          item?.sku,
          item?.product,
        ),
        name: firstNonEmpty(item?.name, item?.product_name),
        unit: firstNonEmpty(item?.unit),
        lot_serial: firstNonEmpty(item?.lot_serial, item?.lot_name),
        exp: getItemExp(item),
        zone_type: getItemZoneType(item),
        location: firstNonEmpty(
          mv.location,
          doc?.location,
          item?.location,
          Array.isArray(item?.location_picks)
            ? item.location_picks[0]?.location_name
            : null,
        ),
        location_dest: firstNonEmpty(
          mv.location_dest,
          doc?.location_dest,
          item?.location_dest,
        ),
        user_ref: mv.user_ref ?? null,
        source: mv.source,
        qty: getRowQty(mv, item),
        system_qty: getRowQty(mv, item),
      };
    });
  });
}

const ReportMovementTable = ({
  report_movements,
  showFilterDropdown,
  onToggleFilter,
  searchableColumns,
  onToggleSearchableColumn,
  onClearAllColumns,
  onExportAll,
  searchQuery,
  onSearchChange,
  onClearSearch,
  currentPage = 1,
  itemsPerPage = 10,
  sortKey,
  sortDir,
  onSortChange,
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

  const toggleSort = (key: BackendSortKey) => {
    const nextDir: SortDir =
      sortKey === key ? (sortDir === "asc" ? "desc" : "asc") : "asc";

    onSortChange(key, nextDir);
  };

  const SortHeader = ({
    label,
    sortKey: headerKey,
  }: {
    label: string;
    sortKey: BackendSortKey;
  }) => (
    <button
      type="button"
      className="rp-mv-sort-btn"
      onClick={() => toggleSort(headerKey)}
      title={`Sort ${label}`}
    >
      {label}
      <i
        className={`fa-solid ${
          sortKey === headerKey
            ? sortDir === "asc"
              ? "fa-sort-up"
              : "fa-sort-down"
            : "fa-sort"
        }`}
      />
    </button>
  );

  const tableHeaders = [
    "No",
    <SortHeader label="Date/Time" sortKey="created_at" />,
    <SortHeader label="Document No." sortKey="no" />,
    <SortHeader label="Transaction Type" sortKey="type" />,
    "Department",
    <SortHeader label="Product" sortKey="code" />,
    "ชื่อ",
    "Unit",
    "Lot Serial",
    "Exp. Date",
    "Zone Temp",
    <SortHeader label="From Location" sortKey="location" />,
    <SortHeader label="To Location" sortKey="location_dest" />,
    "In",
    "Out",
  ];

  const flattenedMovements = useMemo<ReportMovementListRow[]>(() => {
    return buildMovementRows(report_movements);
  }, [report_movements]);

  const departmentOptions = useMemo(() => {
    const depts = new Set<string>();

    flattenedMovements.forEach((row) => {
      const dept = String(row.department ?? "").trim();
      if (dept) depts.add(dept);
    });

    return Array.from(depts).sort((a, b) => a.localeCompare(b, "th"));
  }, [flattenedMovements]);

  const filteredMovements = useMemo(() => {
    if (
      selectedDepartments.length === 0 ||
      selectedDepartments.includes("all")
    ) {
      return flattenedMovements;
    }

    return flattenedMovements.filter((row) => {
      const dept = String(row.department ?? "").trim();
      return dept ? selectedDepartments.includes(dept) : false;
    });
  }, [flattenedMovements, selectedDepartments]);

  const formatFileDate = (d: Date = new Date()) => {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();

    const HH = String(d.getHours()).padStart(2, "0");
    const MM = String(d.getMinutes()).padStart(2, "0");
    const SS = String(d.getSeconds()).padStart(2, "0");

    return `${dd}${mm}${yyyy}${HH}${MM}${SS}`;
  };

  const formatNow = () => {
    const d = new Date();

    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();

    const HH = String(d.getHours()).padStart(2, "0");
    const MM = String(d.getMinutes()).padStart(2, "0");
    const SS = String(d.getSeconds()).padStart(2, "0");

    return `${dd}/${mm}/${yyyy} ${HH}:${MM}:${SS}`;
  };

  const handleExport = async () => {
    const result = await confirmAlert(`Export Excel?\n(${formatNow()})`);
    if (!result.isConfirmed) return;

    try {
      const allRows = await onExportAll();
      const exportRows = buildMovementRows(allRows);

      const rows = exportRows.map((s, index) => ({
        No: index + 1,
        "Date/Time": s.created_at ? formatDateTime(s.created_at) : "-",
        "Document No.": s.no,
        "Transaction Type": s.type,
        Department: s.department ?? "-",
        Product: s.product ?? "-",
        ชื่อ: s.name ?? "-",
        Unit: s.unit ?? "-",
        "Lot Serial": s.lot_serial ?? "-",
        "Exp. Date": s.exp ? formatDateTime(s.exp) : "-",
        "Zone Type": s.zone_type ?? "-",
        "From Location": s.location ?? "-",
        "To Location": s.location_dest ?? "-",
        In: getInQty(s) ?? "-",
        Out: getOutQty(s) ?? "-",
        User: s.user_ref ?? "-",
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(wb, ws, "ReportMovement");
      const fileName = `report_movement_${formatFileDate()}.xlsx`;

      XLSX.writeFile(wb, fileName);
    } catch (error) {
      console.error("Export report movement error:", error);
    }
  };

  return (
    <>
      <div className="page-header">
        <div className="page-title">
          Report - <span className="re-stock-title"> History Movement</span>
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
                  no: "Document No.",
                  created_at: "Date/Time",
                  type: "Transaction Type",
                  department: "Department",
                  product: "Product",
                  name: "ชื่อ",
                  unit: "Unit",
                  lot_serial: "Lot Serial",
                  exp: "Exp. Date",
                  zone_type: "Zone Temp",
                  location: "From Location",
                  location_dest: "To Location",
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
          {filteredMovements.length === 0 ? (
            <tr>
              <td colSpan={tableHeaders.length} className="no-data">
                No report movements found.
              </td>
            </tr>
          ) : (
            filteredMovements.map((row, index) => (
              <tr key={row.row_id}>
                <td>{(currentPage - 1) * itemsPerPage + index + 1}</td>
                <td>{formatDateTime(row.created_at)}</td>
                <td style={{ width: "220px" }}>{row.no ?? "-"}</td>
                <td>{row.type ?? "-"}</td>
                <td>{row.department ?? "-"}</td>
                <td style={{ width: "220px" }}>{row.product ?? "-"}</td>
                <td>{row.name ?? "-"}</td>
                <td>{row.unit ?? "-"}</td>
                <td>{row.lot_serial ?? "-"}</td>
                <td>{row.exp ? formatDateTime(row.exp) : "-"}</td>
                <td>{row.zone_type ?? "-"}</td>
                <td>{row.location ?? "-"}</td>
                <td>{row.location_dest ?? "-"}</td>
                <td>{getInQty(row) ?? "-"}</td>
                <td>{getOutQty(row) ?? "-"}</td>
              </tr>
            ))
          )}
        </Table>
      </div>
    </>
  );
};

export default ReportMovementTable;
