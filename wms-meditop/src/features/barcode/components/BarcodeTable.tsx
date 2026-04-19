import type { BarcodeType } from "../types/barcode.type";

import IconButton from "../../../components/Button/IconButton";
import Table from "../../../components/Table/Table";
import "../../../components/Button/button.css";
import "../../../components/Table/table.css";
import "../../../styles/component.css";
import { useState } from "react";
import Swal from "sweetalert2";
import { http } from "../../../services/http";
import * as XLSX from "xlsx";
import { confirmAlert } from "../../../utils/alert";
import { barcodeApi } from "../services/barcode.api";

type Props = {
  barcodes: BarcodeType[];
  searchQuery: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearSearch: () => void;
  showFilterDropdown: boolean;
  onToggleFilter: () => void;
  searchableColumns: {
    barcode: boolean;
    product_code: boolean;
    // lot_start: boolean;
    // lot_stop: boolean;
    // exp_start: boolean;
    // exp_stop: boolean;
    // barcode_length: boolean;
  };
  onToggleSearchableColumn: (column: keyof Props["searchableColumns"]) => void;
  onClearAllColumns: () => void;
  onAddNew: () => void;
  onEdit: (barcode: BarcodeType) => void;
  onDelete: (barcode: BarcodeType) => void;
  onPrint: (barcode: BarcodeType) => void;
  currentPage?: number;
  itemsPerPage?: number;
};

const BarcodeTable = ({
  barcodes,
  searchQuery,
  onSearchChange,
  onClearSearch,
  showFilterDropdown,
  onToggleFilter,
  searchableColumns,
  onClearAllColumns,
  onToggleSearchableColumn,
  // onAddNew,
  // onEdit,
  // onDelete,
  // onPrint,
  currentPage = 1,
  itemsPerPage = 10,
}: Props) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const tableHeaders = [
    "No",
    "Barcode",
    "Product Code",
    "Lot Start",
    "Lot Stop",
    "Exp Date Start",
    "Exp Date End",
    "Barcode Length",
    // "Action",
  ];

  const handleExportExcel = async () => {
    const result = await confirmAlert(
      "คุณต้องการ Export ข้อมูล Barcode เป็นไฟล์ Excel ใช่หรือไม่?",
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
        const response: any = await barcodeApi.getAll();

        // รองรับ structure หลายแบบ
        let allBarcodes = [];
        if (response.data) {
          allBarcodes = response.data.data || response.data || [];
        }

        Swal.close();

        // ตรวจสอบว่ามีข้อมูลหรือไม่
        if (!allBarcodes || allBarcodes.length === 0) {
          Swal.fire({
            icon: "warning",
            title: "ไม่พบข้อมูล",
            text: "ไม่มีข้อมูล Barcode ที่จะ Export",
          });
          return;
        }

        // เตรียมข้อมูลสำหรับ export
        const dataToExport = allBarcodes.map(
          (barcode: BarcodeType, index: number) => ({
            No: index + 1,
            Barcode: barcode.barcode,
            "Product Code": barcode.product_code,
            "Lot Start": barcode.lot_start,
            "Lot Stop": barcode.lot_stop,
            "Exp Date Start": barcode.exp_start,
            "Exp Date End": barcode.exp_stop,
            "Barcode Length": barcode.barcode_length,
          }),
        );

        // สร้าง worksheet
        const ws = XLSX.utils.json_to_sheet(dataToExport);

        // สร้าง workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Barcodes");

        // สร้างชื่อไฟล์ตามวันที่ปัจจุบัน
        const date = new Date();
        const dateStr = date.toISOString().split("T")[0];
        const fileName = `Barcodes_${dateStr}.xlsx`;

        // Export ไฟล์
        XLSX.writeFile(wb, fileName);

        Swal.fire({
          icon: "success",
          title: "Export สำเร็จ",
          text: `Export ข้อมูล ${allBarcodes.length} รายการเรียบร้อยแล้ว`,
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
      text: "คุณต้องการซิงค์ข้อมูล Barcode จาก Odoo ใช่หรือไม่?",
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
    try {
      await http.post("/barcodes/sync");
      Swal.fire({
        icon: "success",
        title: "Sync สำเร็จ",
        text: "ซิงค์ข้อมูล Barcode เรียบร้อยแล้ว",
        timer: 3000,
        showConfirmButton: false,
      });

      // รอ 3 วินาทีก่อน reload
      setTimeout(() => {
        window.location.reload();
      }, 3000);
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
        <div className="page-title">Barcode</div>

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
                  barcode: "Barcode",
                  product_code: "Product Code",
                  // lot_start: "Lot Start",
                  // lot_stop: "Lot Stop",
                  // exp_start: "Exp Date Start",
                  // exp_stop: "Exp Date End",
                  // barcode_length: "Barcode Length",
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
          {/* <IconButton variant="add" onClick={onAddNew} /> */}
          <IconButton
            variant="sync"
            onClick={handleSync}
            disabled={isSyncing}
          />
        </div>
      </div>

      <div className="table__wrapper">
        <Table headers={tableHeaders}>
          {barcodes.length === 0 ? (
            <tr>
              <td colSpan={tableHeaders.length} className="no-data">
                No barcodes found.
              </td>
            </tr>
          ) : (
            barcodes.map((barcode, index) => (
              <tr key={barcode.id}>
                {/* 👆 FIX สำคัญที่สุด */}
                <td>{(currentPage - 1) * itemsPerPage + index + 1}</td>
                <td>{barcode.barcode}</td>
                <td>{barcode.product_code}</td>
                <td>{barcode.lot_start}</td>
                <td>{barcode.lot_stop}</td>
                <td>{barcode.exp_start}</td>
                <td>{barcode.exp_stop}</td>
                <td>{barcode.barcode_length}</td>
                {/* <td>
                  <div className="action-buttons">
                    <IconButton
                      variant="print"
                      onClick={() => onPrint(barcode)}
                    />
                    <IconButton
                      variant="edit"
                      onClick={() => onEdit(barcode)}
                    />
                    <IconButton
                      variant="delete"
                      onClick={() => onDelete(barcode)}
                    />
                  </div>
                </td> */}
              </tr>
            ))
          )}
        </Table>
      </div>
    </>
  );
};

export default BarcodeTable;
