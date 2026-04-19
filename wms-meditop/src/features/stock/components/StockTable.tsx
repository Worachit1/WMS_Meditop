import type { StockType } from "../types/stock.type";

import Table from "../../../components/Table/Table";
import "../../../components/Button/button.css";
import "../../../components/Table/table.css";
import "../../../styles/component.css";
import { formatDateTime } from "../../../components/Datetime/FormatDateTime";
import IconButton from "../../../components/Button/IconButton";
// import { useState } from "react";
// import Swal from "sweetalert2";
// import { http } from "../../../services/http";
// import IconButton from "../../../components/Button/IconButton";

type Props = {
  stocks: StockType[];
  searchQuery: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearSearch: () => void;
  showFilterDropdown: boolean;
  onToggleFilter: () => void;
  searchableColumns: {
    product_code: boolean;
    product_name: boolean;
    lot_name: boolean;
    expiration_date: boolean;
    location_name: boolean;
    quantity: boolean;
  };
  onPrint: (stock: StockType) => void;
  onToggleSearchableColumn: (column: keyof Props["searchableColumns"]) => void;
  onClearAllColumns: () => void;
  currentPage?: number;
  itemsPerPage?: number;
};

const StockTable = ({
  stocks,
  searchQuery,
  onSearchChange,
  onClearSearch,
  showFilterDropdown,
  onToggleFilter,
  searchableColumns,
  onToggleSearchableColumn,
  onPrint,
  onClearAllColumns,
  currentPage = 1,
  itemsPerPage = 10,
}: Props) => {
  // const [isSyncing, setIsSyncing] = useState(false);
  const tableHeaders = [
    "No",
    "SKU",
    "Name",
    "Lot. Serial",
    "Exp. Date",
    "Lock No.",
    "Quantity",
    "Action",
  ];

  // const handleSync = async () => {
  //     const result = await Swal.fire({
  //       title: "ยืนยันการซิงค์ข้อมูล?",
  //       text: "คุณต้องการซิงค์ข้อมูล Stock จาก Odoo ใช่หรือไม่?",
  //       icon: "question",
  //       showCancelButton: true,
  //       confirmButtonColor: "#3085d6",
  //       cancelButtonColor: "rgb(158, 152, 152)",
  //       confirmButtonText: "ยืนยัน",
  //       cancelButtonText: "ยกเลิก",
  //       reverseButtons: true,
  //     });

  //     if (!result.isConfirmed) return;

  //     setIsSyncing(true);
  //     try {
  //       await http.post("/stocks/sync");
  //       Swal.fire({
  //         icon: "success",
  //         title: "Sync สำเร็จ",
  //         text: "ซิงค์ข้อมูล Stock เรียบร้อยแล้ว",
  //         timer: 3000,
  //         showConfirmButton: false,
  //       });

  //       // รอ 3 วินาทีก่อน reload
  //       setTimeout(() => {
  //         window.location.reload();
  //       }, 3000);
  //     } catch (error: any) {
  //       Swal.fire({
  //         icon: "error",
  //         title: "Sync ไม่สำเร็จ",
  //         text: error?.response?.data?.message || "เกิดข้อผิดพลาด",
  //       });
  //     } finally {
  //       setIsSyncing(false);
  //     }
  //   };

  return (
    <>
      <div className="page-header">
        <div className="page-title">Stocks</div>

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
              <div className="filter-dropdown-2">
                <div className="filter-title">Search In Columns
                  <button
                    type="button"
                    className="filter-clear-btn"
                    onClick={onClearAllColumns}
                  >
                    <i className="fa fa-xmark"></i>
                  </button>
                </div>

                {Object.entries({
                  product_code: "SKU",
                  product_name: "Name",
                  lot_name: "Lot. Serial",
                  expiration_date: "Exp. Date",
                  location_name: "Lock No.",
                  quantity: "Quantity",
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
          {/* <IconButton variant="sync" onClick={handleSync} disabled={isSyncing} /> */}
        </div>
      </div>

      <div className="table__wrapper">
        <Table headers={tableHeaders}>
          {stocks.length === 0 ? (
            <tr>
              <td colSpan={tableHeaders.length} className="no-data">
                No stocks found.
              </td>
            </tr>
          ) : (
            stocks.map((stock, index) => (
              <tr key={stock.id}>
                <td>{(currentPage - 1) * itemsPerPage + index + 1}</td>
                <td>{stock.product_code}</td>
                <td>{stock.product_name}</td>
                <td>{stock.lot_name || "-"}</td>
                <td>{formatDateTime(stock.expiration_date) || "-"}</td>
                <td>{stock.location_name || "-"}</td>
                <td>{stock.quantity}</td>
                <td>
                  <div className="actions-buttons">
                    <IconButton
                      variant="print"
                      onClick={() => onPrint(stock)}
                    />
                  </div>
                </td>
              </tr>
            ))
          )}
        </Table>
      </div>
    </>
  );
};
export default StockTable;
