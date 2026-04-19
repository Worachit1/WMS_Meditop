import type { ZoneType_Type } from "../types/zone_type.type";

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
import { zoneTypeApi } from "../services/zone_type.api";

type Props = {
  zoneTypes: ZoneType_Type[];
  searchQuery: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearSearch: () => void;
  showFilterDropdown: boolean;
  onToggleFilter: () => void;
  searchableColumns: {
    fullName: boolean;
    shortName: boolean;
    remark: boolean;
  };
  onToggleSearchableColumn: (column: keyof Props["searchableColumns"]) => void;
  onClearAllColumns: () => void;
  onAddNew: () => void;
  onEdit: (zoneType: ZoneType_Type) => void;
  onDelete: (zoneType: ZoneType_Type) => void;
  currentPage?: number;
  itemsPerPage?: number;
};

const ZoneTypeTable = ({
  zoneTypes,
  searchQuery,
  onSearchChange,
  onClearSearch,
  showFilterDropdown,
  onToggleFilter,
  searchableColumns,
  onToggleSearchableColumn,
  onClearAllColumns,
  onAddNew,
  onEdit,
  onDelete,
  currentPage = 1,
  itemsPerPage = 10,
}: Props) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const tableHeaders = ["No", "Full Name", "Short Name", "Remark", "Action"];

  const handleExportExcel = async () => {
    const result = await confirmAlert(
      "คุณต้องการ Export ข้อมูล Zone Temp เป็นไฟล์ Excel ใช่หรือไม่?",
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
        const response: any = await zoneTypeApi.getAll();

        // รองรับ structure หลายแบบ
        let allZoneTypes = [];
        if (response.data) {
          allZoneTypes = response.data.data || response.data || [];
        }

        Swal.close();

        // ตรวจสอบว่ามีข้อมูลหรือไม่
        if (allZoneTypes.length === 0) {
          Swal.fire({
            icon: "warning",
            title: "ไม่พบข้อมูล",
            text: "ไม่มีข้อมูล Zone Temp ที่จะ Export",
          });
          return;
        }

        // เตรียมข้อมูลสำหรับ export
        const dataToExport = allZoneTypes.map((zoneType: ZoneType_Type) => ({
          ID: zoneType.zone_type_code,
          "Full Name": zoneType.full_name,
          "Short Name": zoneType.short_name,
          Remark: zoneType.remark,
        }));

        // สร้าง worksheet
        const ws = XLSX.utils.json_to_sheet(dataToExport);

        // สร้าง workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Zone Temp");

        // สร้างชื่อไฟล์ตามวันที่ปัจจุบัน
        const date = new Date();
        const dateStr = date.toISOString().split("T")[0];
        const fileName = `ZoneTemp_${dateStr}.xlsx`;

        // Export ไฟล์
        XLSX.writeFile(wb, fileName);

        Swal.fire({
          icon: "success",
          title: "Export สำเร็จ",
          text: `Export ข้อมูล ${allZoneTypes.length} รายการเรียบร้อยแล้ว`,
          timer: 2000,
          showConfirmButton: false,
        });
      } catch (error: any) {
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
      text: "คุณต้องการซิงค์ข้อมูล Zone Temp จาก Odoo ใช่หรือไม่?",
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
      await http.post("/zone_types/sync");
      Swal.fire({
        icon: "success",
        title: "Sync สำเร็จ",
        text: "ซิงค์ข้อมูล Zone Temp เรียบร้อยแล้ว",
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
        <div className="page-title">Zone Temp</div>

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
                  fullName: "Full Name",
                  shortName: "Short Name",
                  remark: "Remark",
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

          <IconButton variant="add" onClick={onAddNew} />
          <IconButton
            variant="sync"
            onClick={handleSync}
            disabled={isSyncing}
          />
        </div>
      </div>

      <div className="table__wrapper">
        <Table headers={tableHeaders}>
          {zoneTypes.length === 0 ? (
            <tr>
              <td colSpan={tableHeaders.length} className="no-data">
                No zone types found.
              </td>
            </tr>
          ) : (
            zoneTypes.map((zoneType, index) => (
              <tr key={zoneType.id}>
                <td>{(currentPage - 1) * itemsPerPage + index + 1}</td>
                <td>{zoneType.full_name}</td>
                <td>{zoneType.short_name}</td>
                <td>{zoneType.remark}</td>
                <td>
                  <div className="action-buttons">
                    <IconButton
                      variant="edit"
                      onClick={() => onEdit(zoneType)}
                    />
                    <IconButton
                      variant="delete"
                      onClick={() => onDelete(zoneType)}
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

export default ZoneTypeTable;
