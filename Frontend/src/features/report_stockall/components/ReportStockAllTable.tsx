import type { ReportStockAllType } from "../types/reposrt_stockall.type";
import { reportStockAllApi } from "../services/report_stockall.api"; 

import Table from "../../../components/Table/Table";
import "../../../components/Button/button.css";
import "../../../components/Table/table.css";
import "../../../styles/component.css";
import { formatDateTime } from "../../../components/Datetime/FormatDateTime";
import IconButton from "../../../components/Button/IconButton";
import { confirmAlert, successAlert } from "../../../utils/alert";

import * as XLSX from "xlsx";
import Swal from "sweetalert2";

import "../report_sotckall.css";

type StockType = "default" | "bor" | "ser";

type SortDir = "asc" | "desc";
type SortKey = "product_code" | "lot_name" | "location_name" | "quantity";

type Props = {
  stocks: ReportStockAllType[];
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
  onToggleSearchableColumn: (column: keyof Props["searchableColumns"]) => void;
  onClearAllColumns: () => void;
  currentPage?: number;
  itemsPerPage?: number;
  stockType: StockType;
  onStockTypeChange: (type: StockType) => void;
  sortKey: SortKey | null;
  sortDir: SortDir;
  onSortChange: (key: SortKey | null, dir: SortDir) => void;
};

const ReportStockAllTable = ({
  stocks,
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
  stockType,
  onStockTypeChange,
  sortKey,
  sortDir,
  onSortChange,
}: Props) => {
  // const [isSyncing, setIsSyncing] = useState(false);

  const toggleSort = (key: SortKey) => {
    const nextDir: SortDir =
      sortKey === key ? (sortDir === "asc" ? "desc" : "asc") : "asc";
    onSortChange(key, nextDir);
  };

  const SortHeader = ({ label, sk }: { label: string; sk: SortKey }) => (
    <button
      type="button"
      className="rpAll-sort-btn"
      onClick={() => toggleSort(sk)}
      title={`Sort ${label}`}
    >
      {label}
      <i
        className={`fa-solid ${
          sortKey === sk
            ? sortDir === "asc"
              ? "fa-sort-up"
              : "fa-sort-down"
            : "fa-sort"
        }`}
      />
    </button>
  );

  const defaultHeaders = [
    "No",
    <SortHeader label="สินค้า" sk="product_code" />,
    "ชื่อ",
    <SortHeader label="Lot. Serial" sk="lot_name" />,
    "Exp. Date",
    <SortHeader label="Lock No." sk="location_name" />,
    <SortHeader label="Quantity" sk="quantity" />,
  ];
  const borHeaders = [
    "No",
    <SortHeader label="สินค้า" sk="product_code" />,
    "ชื่อ",
    <SortHeader label="Lot. Serial" sk="lot_name" />,
    "Exp. Date",
    <SortHeader label="Lock No." sk="location_name" />,
    <SortHeader label="Quantity" sk="quantity" />,
  ];
  const serHeaders = [
    "No",
    <SortHeader label="สินค้า" sk="product_code" />,
    "ชื่อ",
    <SortHeader label="Lot. Serial" sk="lot_name" />,
    "Exp. Date",
    <SortHeader label="Lock No." sk="location_name" />,
    <SortHeader label="Quantity" sk="quantity" />,
  ];

  const tableHeaders =
    stockType === "bor"
      ? borHeaders
      : stockType === "ser"
        ? serHeaders
        : defaultHeaders;

  const handleExportExcel = async () => {
  const result = await confirmAlert(
    `คุณต้องการ Export ข้อมูล ${stockType.toUpperCase()} เป็นไฟล์ Excel ใช่หรือไม่?`,
  );

  if (!result.isConfirmed) return;

  try {
    Swal.fire({
      title: "กำลังดึงข้อมูล...",
      text: "กรุณารอสักครู่",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    // ✅ ยิง API ใหม่เพื่อเอาทั้งหมด
    let response: any;

    const params = {
      page: 1,
      limit: 999999,
      search: searchQuery || undefined,
      columns: Object.entries(searchableColumns)
        .filter(([, value]) => value)
        .map(([key]) => key)
        .join(","),
      sortBy: sortKey || undefined,
      sortDir: sortDir || undefined,
    };

    if (stockType === "bor") {
      response = await reportStockAllApi.getAllBorPaginated(params);
    } else if (stockType === "ser") {
      response = await reportStockAllApi.getAllSerPaginated(params);
    } else {
      response = await reportStockAllApi.getAllPaginated(params);
    }

    const allStocks =
      response?.data?.data ||
      response?.data?.stocks ||
      response?.data ||
      [];

    Swal.close();

    if (!allStocks || allStocks.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "ไม่พบข้อมูล",
        text: "ไม่มีข้อมูลสำหรับ Export",
      });

      return;
    }

    const dataToExport = allStocks.map(
      (stock: ReportStockAllType, index: number) => ({
        No: index + 1,
        SKU: stock.product_code ?? "-",
        Name: stock.product_name ?? "-",
        "Lot. Serial": stock.lot_name ?? "-",
        "Exp. Date": stock.expiration_date
          ? formatDateTime(stock.expiration_date)
          : "-",
        "Lock No.": stock.location_name ?? "-",
        Quantity: stock.quantity ?? 0,
      }),
    );

    const ws = XLSX.utils.json_to_sheet(dataToExport);

    ws["!cols"] = [
      { wch: 8 },
      { wch: 20 },
      { wch: 35 },
      { wch: 25 },
      { wch: 25 },
      { wch: 30 },
      { wch: 15 },
    ];

    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      wb,
      ws,
      stockType === "default"
        ? "DEFAULT"
        : stockType === "bor"
          ? "BOR"
          : "SER",
    );

    const date = new Date();

    const pad = (n: number) => String(n).padStart(2, "0");

    const dateTime =
      `${date.getFullYear()}-` +
      `${pad(date.getMonth() + 1)}-` +
      `${pad(date.getDate())}_` +
      `${pad(date.getHours())}-` +
      `${pad(date.getMinutes())}-` +
      `${pad(date.getSeconds())}`;

    const fileName = `REPORT_STOCK_${stockType.toUpperCase()}_${dateTime}.xlsx`;

    XLSX.writeFile(wb, fileName);

    await successAlert(
      "Export สำเร็จ",
      `Export ข้อมูล ${allStocks.length} รายการเรียบร้อยแล้ว`,
    );
  } catch (error: any) {
    console.error("Export error:", error);

    Swal.fire({
      icon: "error",
      title: "Export ไม่สำเร็จ",
      text: error?.response?.data?.message || "เกิดข้อผิดพลาด",
    });
  }
};

  return (
    <>
      <div className="page-header">
        <div className="page-title">Report Stocks</div>

        <div className="toolbar">
          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            {(["default", "bor", "ser"] as StockType[]).map((type) => (
              <label
                key={type}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  className="rpAll-ckeckbox"
                  checked={stockType === type}
                  onChange={() => onStockTypeChange(type)}
                />
                <span>
                  {type === "default"
                    ? "Default"
                    : type === "bor"
                      ? "BOR"
                      : "SER"}
                </span>
              </label>
            ))}
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
                  product_code: "สินค้า",
                  product_name: "ชื่อ",
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
          <IconButton variant="export" onClick={handleExportExcel} />
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
            stocks.map((stock, index) => {
              const no = (currentPage - 1) * itemsPerPage + index + 1;
              if (stockType === "bor") {
                return (
                  <tr key={stock.id}>
                    <td>{no}</td>
                    <td>{stock.product_code}</td>
                    <td>{stock.product_name}</td>
                    <td>{stock.lot_name}</td>
                    <td>{formatDateTime(stock.expiration_date)}</td>
                    <td>{stock.location_name}</td>
                    <td>{stock.quantity}</td>
                  </tr>
                );
              }
              if (stockType === "ser") {
                return (
                  <tr key={stock.id}>
                    <td>{no}</td>
                    <td>{stock.product_code}</td>
                    <td>{stock.product_name}</td>
                    <td>{stock.lot_name}</td>
                    <td>{formatDateTime(stock.expiration_date)}</td>
                    <td>{stock.location_name}</td>
                    <td>{stock.quantity}</td>
                  </tr>
                );
              }
              // default
              return (
                <tr key={stock.id}>
                  <td>{no}</td>
                  <td>{stock.product_code}</td>
                  <td>{stock.product_name}</td>
                  <td>{stock.lot_name}</td>
                  <td>{formatDateTime(stock.expiration_date)}</td>
                  <td>{stock.location_name}</td>
                  <td>{stock.quantity}</td>
                </tr>
              );
            })
          )}
        </Table>
      </div>
    </>
  );
};
export default ReportStockAllTable;
