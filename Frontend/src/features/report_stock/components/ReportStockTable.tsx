import type { ReportStockType } from "../types/report_stock.type";

import Table from "../../../components/Table/Table";
import "../../../components/Button/button.css";
import "../../../components/Table/table.css";
import "../../../styles/component.css";
import { formatDateTime } from "../../../components/Datetime/FormatDateTime";
import * as XLSX from "xlsx";
import "../report_stock.css";
import IconButton from "../../../components/Button/IconButton";
import { confirmAlert } from "../../../utils/alert";

type StockType = "default" | "bor" | "ser";

type Props = {
  report_stocks: ReportStockType[];
  searchQuery: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearSearch: () => void;

  snapshotDate: string;
  onSnapshotDateChange: (value: string) => void;
  onResetSnapshotDate: () => void;

  showFilterDropdown: boolean;
  onToggleFilter: () => void;
  searchableColumns: {
    snapshot_date: boolean;
    product_code: boolean;
    product_name: boolean;
    expiration_date: boolean;
    quantity: boolean;
    unit: boolean;
    building: boolean;
    zone: boolean;
    zone_type: boolean;
    lot_name: boolean;
    location_name: boolean;
  };
  onToggleSearchableColumn: (column: keyof Props["searchableColumns"]) => void;
  onClearAllColumns: () => void;

  onExportAll: () => Promise<ReportStockType[]>;

  currentPage?: number;
  itemsPerPage?: number;
  stockType: StockType;
  onStockTypeChange: (type: StockType) => void;
};

const formatDisplayDate = (value: string) => {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year.slice(-2)}`;
};

const ReportStockTable = ({
  report_stocks,
  searchQuery,
  onSearchChange,
  onClearSearch,
  snapshotDate,
  onSnapshotDateChange,
  onResetSnapshotDate,
  showFilterDropdown,
  onToggleFilter,
  searchableColumns,
  onToggleSearchableColumn,
  onClearAllColumns,
  onExportAll,
  currentPage = 1,
  itemsPerPage = 10,
  stockType,
  onStockTypeChange,
}: Props) => {
  const tableHeaders = [
    "No",
    "สินค้า",
    "Name",
    "Lot. Serial",
    "Unit",
    "Exp. Date",
    "Current QTY",
    "Building",
    "Zone Temp",
    "Zone",
    "Location",
  ];

  const handleExport = async () => {
    const result = await confirmAlert(
      `Export Excel วันที่ ${formatDisplayDate(snapshotDate)}?`,
    );
    if (!result.isConfirmed) return;

    try {
      const allRows = await onExportAll();

      const rows = allRows.map((s, index) => ({
        No: index + 1,
        สินค้า: s.product_code,
        Name: s.product_name,
        "Lot. Serial": s.lot_name,
        Unit: s.unit,
        "Exp. Date": s.expiration_date
          ? formatDateTime(s.expiration_date)
          : "-",
        "Current QTY": s.quantity,
        Building: s.location?.building?.short_name || "-",
        "Zone Temp": s.location?.zone?.zone_type?.short_name || "-",
        Zone: s.location?.zone?.short_name || "-",
        Location: s.location_name,
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
          Report - <span className="re-stock-title"> Stock คงคลัง</span>
        </div>

        <div className="toolbar">
          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            {(["default", "bor", "ser"] as StockType[]).map((type) => (
              <label key={type} style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  className="report-stock-checkbox"
                  checked={stockType === type}
                  onChange={() => onStockTypeChange(type)}
                />
                <span style={{ color: "#727272", fontSize: "14px" }}>
                  {type === "default" ? "MDT" : type === "bor" ? "BOR" : "SER"}
                </span>
              </label>
            ))}
          </div>

          <div className="report-stock-date-wrap">
            <label className="report-stock-date-label" htmlFor="snapshot-date">
              วันที่
            </label>

            <div className="report-stock-date-input-wrap">
              <div className="report-stock-date-field">
                <input
                  id="snapshot-date"
                  type="date"
                  className="report-stock-date-input"
                  value={snapshotDate}
                  onChange={(e) => onSnapshotDateChange(e.target.value)}
                />
                <span className="report-stock-date-display">
                  {formatDisplayDate(snapshotDate)}
                </span>
              </div>

              <button
                type="button"
                className="report-stock-date-reset-btn"
                onClick={onResetSnapshotDate}
                title="ตั้งเป็นวันปัจจุบัน"
              >
                วันนี้
              </button>
            </div>

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
                  product_code: "สินค้า",
                  product_name: "Name",
                  unit: "Unit",
                  lot_name: "Lot. Serial",
                  expiration_date: "Exp. Date",
                  location_name: "Location",
                  building: "Building",
                  zone: "Zone",
                  zone_type: "Zone Temp",
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
          {report_stocks.length === 0 ? (
            <tr>
              <td colSpan={tableHeaders.length} className="no-data">
                No stocks found.
              </td>
            </tr>
          ) : (
            report_stocks.map((rp_stock, index) => (
              <tr key={rp_stock.id}>
                <td>{(currentPage - 1) * itemsPerPage + index + 1}</td>
                <td>{rp_stock.product_code}</td>
                <td>{rp_stock.product_name}</td>
                <td>{rp_stock.lot_name}</td>
                <td>{rp_stock.unit}</td>
                <td>
                  {rp_stock.expiration_date
                    ? formatDateTime(rp_stock.expiration_date)
                    : "-"}
                </td>
                <td>{rp_stock.quantity}</td>
                <td>{rp_stock.location?.building?.short_name || "-"}</td>
                <td>{rp_stock.location?.zone?.zone_type?.short_name || "-"}</td>
                <td>{rp_stock.location?.zone?.short_name || "-"}</td>
                <td>{rp_stock.location_name}</td>
              </tr>
            ))
          )}
        </Table>
      </div>
    </>
  );
};

export default ReportStockTable;
