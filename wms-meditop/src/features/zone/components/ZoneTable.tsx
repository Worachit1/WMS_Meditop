import type { ZoneType } from "../types/zone.type";

import IconButton from "../../../components/Button/IconButton";
import Table from "../../../components/Table/Table";
import "../../../components/Button/button.css";
import "../../../components/Table/table.css";
import "../../../styles/component.css";
import * as XLSX from "xlsx";
import { confirmAlert } from "../../../utils/alert";
import Swal from "sweetalert2";
import { zoneApi } from "../services/zone.api";

type Props = {
  zones: ZoneType[];
  searchQuery: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearAllColumns: () => void;
  onClearSearch: () => void;
  showFilterDropdown: boolean;
  onToggleFilter: () => void;
  searchableColumns: {
    fullName: boolean;
    shortName: boolean;
    building: boolean;
    zoneType: boolean;
    remark: boolean;
  };
  onToggleSearchableColumn: (column: keyof Props["searchableColumns"]) => void;
  onAddNew: () => void;
  onEdit: (zone: ZoneType) => void;
  onDelete: (zone: ZoneType) => void;
  currentPage?: number;
  itemsPerPage?: number;
};

const ZoneTable = ({
  zones,
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
  const tableHeaders = [
    "No",
    "Full Name",
    "Short Name",
    "Building",
    "Zone Temp",
    "Remark",
    "Action",
  ];

  const handleExportExcel = async () => {
    const result = await confirmAlert(
      "คุณต้องการ Export ข้อมูล Zone เป็นไฟล์ Excel ใช่หรือไม่?",
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
        const response: any = await zoneApi.getAll();

        // รองรับ structure หลายแบบ
        let allZones = [];
        if (response.data) {
          allZones = response.data.data || response.data || [];
        }

        Swal.close();

        // ตรวจสอบว่ามีข้อมูลหรือไม่
        if (!allZones || allZones.length === 0) {
          Swal.fire({
            icon: "warning",
            title: "ไม่พบข้อมูล",
            text: "ไม่มีข้อมูล Zone ที่จะ Export",
          });
          return;
        }
        // เตรียมข้อมูลสำหรับ export
        const dataToExport = allZones.map((zone: ZoneType, index: number) => ({
          No: index + 1,
          "Full Name": zone.full_name,
          "Short Name": zone.short_name,
          Building: zone.building.short_name,
          "Zone Temp": zone.zone_type.short_name,
          Remark: zone.remark,
        }));

        // สร้าง worksheet
        const ws = XLSX.utils.json_to_sheet(dataToExport);

        // สร้าง workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Zones");

        // สร้างชื่อไฟล์ตามวันที่ปัจจุบัน
        const date = new Date();
        const dateStr = date.toISOString().split("T")[0];
        const fileName = `Zones_${dateStr}.xlsx`;

        // Export ไฟล์
        XLSX.writeFile(wb, fileName);

        Swal.fire({
          icon: "success",
          title: "Export สำเร็จ",
          text: `Export ข้อมูล ${allZones.length} รายการเรียบร้อยแล้ว`,
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

  return (
    <>
      <div className="page-header">
        <div className="page-title">Zone</div>

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
                  fullName: "Full Name",
                  shortName: "Short Name",
                  building: "Building",
                  zoneType: "Zone Temp",
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
        </div>
      </div>

      <div className="table__wrapper">
        <Table headers={tableHeaders}>
          {zones.length === 0 ? (
            <tr>
              <td colSpan={tableHeaders.length} className="no-data">
                No zones found.
              </td>
            </tr>
          ) : (
            zones.map((zone, index) => (
              <tr key={zone.id}>
                <td>{(currentPage - 1) * itemsPerPage + index + 1}</td>
                <td>{zone.full_name}</td>
                <td style={{ minWidth: "120px" }}>{zone.short_name}</td>
                <td>{zone.building.short_name}</td>
                <td>{zone.zone_type.short_name}</td>
                <td>{zone.remark}</td>
                <td>
                  <div className="action-buttons">
                    <IconButton variant="edit" onClick={() => onEdit(zone)} />
                    <IconButton
                      variant="delete"
                      onClick={() => onDelete(zone)}
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

export default ZoneTable;
