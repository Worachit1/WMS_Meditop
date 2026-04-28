import type { GoodType } from "../types/good.type";
import Table from "../../../components/Table/Table";
import "../../../components/Button/button.css";
import "../../../components/Table/table.css";
import "../../../styles/component.css";
import { formatDateTime } from "../../../components/Datetime/FormatDateTime";
import { useState } from "react";
import Swal from "sweetalert2";
import IconButton from "../../../components/Button/IconButton";
import { http } from "../../../services/http";
import * as XLSX from "xlsx";
import { confirmAlert, successAlert } from "../../../utils/alert";
import { goodApi } from "../services/good.api";
import { toast } from "react-toastify";

type SearchableColumns = {
  product_code: boolean;
  product_name: boolean;
  lot_name: boolean;
  expiration_date: boolean;
  expiration_date_end: boolean;
  department_code: boolean;
  zone_type: boolean;
  unit: boolean;
  input_number: boolean;
};

type Props = {
  goods: GoodType[];
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
};

const GoodTable = ({
  goods,
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
  onRefresh,
}: Props) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);


  const handleToggleInputNumber = async (good: GoodType, newValue: boolean) => {
    const result = await confirmAlert(
      `คุณต้องการเปลี่ยน Input Number เป็น "${newValue ? "Yes" : "No"}" ใช่หรือไม่?`,
    );

    if (!result.isConfirmed) return;

    setUpdatingId(good.id);
    try {
      await goodApi.updateInputNumber(good.id, {
        id: good.id,
        input_number: newValue,
      });

      await successAlert("อัปเดต Input Number สำเร็จ");

      // รีเฟรชข้อมูล
      if (onRefresh) {
        onRefresh();
      }
    } catch (error) {
      console.error("Error updating input number:", error);
      toast.error("เกิดข้อผิดพลาดในการอัปเดต Input Number");
    } finally {
      setUpdatingId(null);
    }
  };

  const tableHeaders = [
    "No",
    "สินค้า",
    "ชื่อ",
    "Lot. Serial",
    "Exp. Date",
    "Exp. Date End",
    "Department",
    "Zone Temp",
    "Unit",
    "Input Number",
  ];

  const handleExportExcel = async () => {
    const result = await confirmAlert(
      "คุณต้องการ Export ข้อมูล Product เป็นไฟล์ Excel ใช่หรือไม่?",
    );

    if (result.isConfirmed) {
      try {
        // แสดง loading
        Swal.fire({
          title: "กำลังดึงข้อมูล...",
          text: "กรุณารอสักครู่",
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });

        // ดึงข้อมูลทั้งหมดจาก API โดยไม่มี limit
        const response: any = await goodApi.getAllProduct();

        // รองรับ structure หลายแบบ
        let allGoods = [];
        if (response.data) {
          allGoods = response.data.data || response.data || [];
        }

        console.log("Total goods to export:", allGoods.length);

        Swal.close();

        // ตรวจสอบว่ามีข้อมูลหรือไม่
        if (!allGoods || allGoods.length === 0) {
          Swal.fire({
            icon: "warning",
            title: "ไม่พบข้อมูล",
            text: "ไม่มีข้อมูล Product ที่จะ Export",
          });
          return;
        }

        // เตรียมข้อมูลสำหรับ export
        const dataToExport = allGoods.map((good: GoodType, index: number) => ({
          No: index + 1,
          SKU: good.product_code,
          Name: good.product_name,
          "Lot. Serial": good.lot_name,
          "Exp. Date": good.expiration_date
            ? formatDateTime(good.expiration_date)
            : "",
          "Exp. Date End": good.expiration_date_end
            ? formatDateTime(good.expiration_date_end)
            : "",
          Department: good.department_code,
          "Zone Temp": good.zone_type,
          Unit: good.unit,
          "Input Number": good.input_number ? "Yes" : "No",
        }));

        // สร้าง worksheet
        const ws = XLSX.utils.json_to_sheet(dataToExport);

        // สร้าง workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Products");

        // สร้างชื่อไฟล์ตามวันที่ปัจจุบัน
        const date = new Date();
        const dateStr = date.toISOString().split("T")[0];
        const fileName = `Products_${dateStr}.xlsx`;

        // Export ไฟล์
        XLSX.writeFile(wb, fileName);

        Swal.fire({
          icon: "success",
          title: "Export สำเร็จ",
          text: `Export ข้อมูล ${allGoods.length} รายการเรียบร้อยแล้ว`,
          timer: 2000,
          showConfirmButton: false,
        });
      } catch (error: any) {
        console.error("Export error:", error);
        Swal.fire({
          icon: "error",
          title: "Export ไม่สำเร็จ",
          text: error?.response?.data?.message || "เกิดข้อผิดพลาด",
        });
      }
    }
  };

  const handleSync = async () => {
    const result = await Swal.fire({
      title: "ยืนยันการซิงค์ข้อมูล?",
      text: "คุณต้องการซิงค์ข้อมูล Product จาก Odoo ใช่หรือไม่?",
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "rgb(158, 152, 152)",
      confirmButtonText: "ยืนยัน",
      cancelButtonText: "ยกเลิก",
      reverseButtons: true,
    });

    if (!result.isConfirmed) return;

    setIsSyncing(true);
    
    // แสดง loading alert
    Swal.fire({
      title: "กำลังซิงค์ข้อมูล...",
      text: "การ Sync ใช้เวลานานกรุณารอประมาณ 10-15 นาที",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });
    
    try {
      await http.post("/goods/sync");
      Swal.fire({
        icon: "success",
        title: "Sync สำเร็จ",
        text: "ซิงค์ข้อมูล Product เรียบร้อยแล้ว",
        timer: 15 * 60 * 1000,
        showConfirmButton: false,
      });

      // รอ 15 นาทีก่อน reload
      setTimeout(() => {
        window.location.reload();
      }, 15 * 60 * 1000);
    } catch (error: any) {
      Swal.fire({
        icon: "error",
        title: "Sync ไม่สำเร็จ",
        text: error?.response?.data?.message || "เกิดข้อผิดพลาด",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div className="page-title">Product</div>

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
                  product_code: "สินค้า",
                  product_name: "ชื่อ",
                  lot_name: "Lot. Serial",
                  expiration_date: "Exp. Date",
                  expiration_date_end: "Exp. Date End",
                  department_code: "Department",
                  zone_type: "Zone Temp",
                  unit: "Unit",
                  input_number: "Input Number",
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
          <IconButton variant="export" onClick={handleExportExcel} />
          <IconButton
            variant="sync"
            onClick={handleSync}
            disabled={isSyncing}
          />
        </div>
      </div>

      <div className="table__wrapper">
        <Table headers={tableHeaders}>
          {goods.length === 0 ? (
            <tr>
              <td colSpan={tableHeaders.length} className="no-data">
                No goods found.
              </td>
            </tr>
          ) : (
            goods.map((good, index) => {
              const rowKey = `${good.product_id}-${good.lot_id ?? "nolot"}-${good.product_code ?? ""}`;
              return (
                <tr key={rowKey}>
                  <td>{(currentPage - 1) * itemsPerPage + index + 1}</td>
                  <td style={{ minWidth: "260px" }}>{good.product_code}</td>
                  <td
                    style={{
                      maxWidth: "200px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={good.product_name}
                  >
                    {good.product_name && good.product_name.length > 17
                      ? `${good.product_name.substring(0, 17)}...`
                      : good.product_name}
                  </td>
                  <td>{good.lot_name}</td>
                  <td>
                    {good.expiration_date
                      ? formatDateTime(good.expiration_date)
                      : "-"}
                  </td>
                  <td>
                    {good.expiration_date_end
                      ? formatDateTime(good.expiration_date_end)
                      : "-"}
                  </td>
                  <td>{good.department_code}</td>
                  <td>{good.zone_type || "-"}</td>
                  <td>{good.unit}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={good.input_number}
                      onChange={(e) =>
                        handleToggleInputNumber(good, e.target.checked)
                      }
                      disabled={updatingId === good.product_id}
                      style={{
                        cursor:
                          updatingId === good.product_id
                            ? "not-allowed"
                            : "pointer",
                      }}
                    />
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

export default GoodTable;
