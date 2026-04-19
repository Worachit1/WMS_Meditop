import type { StockCountType } from "../types/stock_count.type";

import Table from "../../../components/Table/Table";
import "../../../components/Button/button.css";
import "../../../components/Table/table.css";
import "../../../styles/component.css";
import "../stock_count.css";
import { formatDateTime } from "../../../components/Datetime/FormatDateTime";

type Props = {
  stock_counts: StockCountType[];
  searchQuery: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearSearch: () => void;
  showFilterDropdown: boolean;
  onToggleFilter: () => void;
  searchableColumns: {
    lock_no: boolean;
    id: boolean;
    sku: boolean;
    name: boolean;
    lot: boolean;
    exp_date: boolean;
    quantity: boolean;
    count: boolean;
  };
  onToggleSearchableColumn: (column: keyof Props["searchableColumns"]) => void;
  onClearAllColumns: () => void;
  onOverwrite: (stockCountId: string) => void;
  onStartCount: () => void;
  currentPage?: number;
  itemsPerPage?: number;
  userLevel?: string;
};

const StockCountTable = ({
  stock_counts,
  searchQuery,
  onSearchChange,
  onClearSearch,
  showFilterDropdown,
  onToggleFilter,
  searchableColumns,
  onToggleSearchableColumn,
  onOverwrite,
  onStartCount,
  onClearAllColumns,
  currentPage = 1,
  itemsPerPage = 10,
  userLevel,
}: Props) => {
  const tableHeaders = [
    "No",
    "Lock No.",
    "ID",
    "SKU",
    "Name",
    "Lot.",
    "Exp. Date",
    "Quantity",
    "Count",
    "Action",
  ];

  return (
    <>
      <div className="page-header">
        <div className="page-title">Stock Count</div>

        <div className="toolbar">
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
              <div className="filter-dropdown">
                <div className="filter-title">Seach In Columns
                  <button
                    type="button"
                    className="filter-clear-btn"
                    onClick={onClearAllColumns}
                  >
                    <i className="fa fa-xmark"></i>
                  </button>
                </div>

                {Object.entries({
                  lock_no: "Lock No.",
                  id: "ID",
                  sku: "SKU",
                  name: "Name",
                  lot: "Lot.",
                  exp_date: "Exp. Date",
                  quantity: "Quantity",
                  count: "Count",
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
          <button className="stockCount-btn-start" onClick={onStartCount}>
            <i className="fa fa-plus"></i> Start Count
          </button>
        </div>
      </div>

      <div className="table__wrapper">
        <Table headers={tableHeaders}>
          {stock_counts.length === 0 ? (
            <tr>
              <td colSpan={tableHeaders.length} className="no-data">
                No stock count found.
              </td>
            </tr>
          ) : (
            stock_counts.map((stock_count, index) => (
              <tr key={stock_count.id}>
                <td>{(currentPage - 1) * itemsPerPage + index + 1}</td>
                <td>{stock_count.lock_no}</td>
                <td>{stock_count.id}</td>
                <td>{stock_count.sku}</td>
                <td>{stock_count.name}</td>
                <td>{stock_count.lot}</td>
                <td>{formatDateTime(stock_count.exp_date)}</td>
                <td>{stock_count.quantity}</td>
                <td>{stock_count.count}</td>
                <td>
                  <button
                    className="stockCount-btn-overwrite"
                    onClick={() => onOverwrite(stock_count.id)}
                    disabled={userLevel === "Operator"}
                    style={{
                      opacity: userLevel === "Operator" ? 0.5 : 1,
                      cursor:
                        userLevel === "Operator" ? "not-allowed" : "pointer",
                    }}
                    title={
                      userLevel === "Operator"
                        ? "คุณไม่มีสิทธิ์แก้ไขเนื่องจาก คุณเป็น Operator"
                        : ""
                    }
                  >
                    Overwrite
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
export default StockCountTable;
