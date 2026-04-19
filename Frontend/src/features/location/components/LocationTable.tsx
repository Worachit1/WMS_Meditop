import type { LocationType } from "../types/location.type";

import IconButton from "../../../components/Button/IconButton";
import Table from "../../../components/Table/Table";
import "../../../components/Button/button.css";
import "../../../components/Table/table.css";
import "../../../styles/component.css";
import * as XLSX from "xlsx";
import { confirmAlert } from "../../../utils/alert";
import Swal from "sweetalert2";
import { locationApi } from "../services/location.api";

type Props = {
  locations: LocationType[];
  searchQuery: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearSearch: () => void;
  showFilterDropdown: boolean;
  onToggleFilter: () => void;
  searchableColumns: {
    fullName: boolean;
    building: boolean;
    zone: boolean;
    lockNo: boolean;
    zone_type: boolean;
    ncr_check: boolean;
    ignore: boolean;
    remark: boolean;
  };
  onToggleSearchableColumn: (column: keyof Props["searchableColumns"]) => void;
  onClearAllColumns: () => void;
  onAddNew: () => void;
  onEdit: (location: LocationType) => void;
  onDelete: (location: LocationType) => void;
  onPrint: (location: LocationType) => void;
  currentPage?: number;
  itemsPerPage?: number;
};

const LocationTable = ({
  locations,
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
  onPrint,
  currentPage = 1,
  itemsPerPage = 10,
}: Props) => {
  const truncateRemark = (remark: string, maxLength = 30) => {
    const normalizedRemark = String(remark ?? "");
    if (normalizedRemark.length <= maxLength) return normalizedRemark;
    return `${normalizedRemark.slice(0, maxLength)}...`;
  };

  const tableHeaders = [
    "No",
    "Full Name",
    "Building",
    "Zone",
    "Lock No.",
    "Zone Temp",
    "EXP&NCR",
    "การควบคุมอุณหภูมิ",
    "Remark",
    "Action",
  ];

  const handleExportExcel = async () => {
    const result = await confirmAlert(
      "คุณต้องการ Export ข้อมูล Location เป็นไฟล์ Excel ใช่หรือไม่?",
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
        const response: any = await locationApi.getAll();

        // รองรับ structure หลายแบบ
        let allLocations = [];
        if (response.data) {
          allLocations = response.data.data || response.data || [];
        }

        Swal.close();

        // ตรวจสอบว่ามีข้อมูลหรือไม่
        if (!allLocations || allLocations.length === 0) {
          Swal.fire({
            icon: "warning",
            title: "ไม่พบข้อมูล",
            text: "ไม่มีข้อมูล Location ที่จะ Export",
          });
          return;
        }

        // เตรียมข้อมูลสำหรับ export
        const dataToExport = allLocations.map(
          (location: LocationType, index: number) => ({
            No: index + 1,
            "Full Name": location.full_name,
            Building: location.building.short_name,
            Zone: location.zone.short_name,
            "Lock No.": location.lock_no,
            "Zone Temp": location.zone.zone_type.short_name,
            "EXP&NCR": location.ncr_check ? "EXP&NCR" : "-",
            "การควบคุมอุณหภูมิ": location.ignore ? "ไม่ใช่" : "ใช่",
            Remark: location.remark,
          }),
        );

        // สร้าง worksheet
        const ws = XLSX.utils.json_to_sheet(dataToExport);

        // สร้าง workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Locations");

        // สร้างชื่อไฟล์ตามวันที่ปัจจุบัน
        const date = new Date();
        const dateStr = date.toISOString().split("T")[0];
        const fileName = `Locations_${dateStr}.xlsx`;

        // Export ไฟล์
        XLSX.writeFile(wb, fileName);

        Swal.fire({
          icon: "success",
          title: "Export สำเร็จ",
          text: `Export ข้อมูล ${allLocations.length} รายการเรียบร้อยแล้ว`,
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
        <div className="page-title">Location</div>

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
                  building: "Building",
                  zone: "Zone",
                  lockNo: "Lock No.",
                  zone_type: "Zone Temp",
                  ncr_check: "EXP&NCR",
                  ignore: "การควบคุมอุณหภูมิ",
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
          {locations.length === 0 ? (
            <tr>
              <td colSpan={tableHeaders.length} className="no-data">
                No locations found.
              </td>
            </tr>
          ) : (
            locations.map((location, index) => (
              <tr key={location.id}>
                <td>{(currentPage - 1) * itemsPerPage + index + 1}</td>
                <td>{location.full_name}</td>
                <td>{location.building.short_name}</td>
                <td>{location.zone.short_name}</td>
                <td>{location.lock_no}</td>
                <td>{location.zone.zone_type.short_name}</td>
                <td>{location.ncr_check ? "EXP&NCR" : "-"}</td>
                <td>{location.ignore ? "ไม่ใช่" : "ใช่"}</td>
                <td title={location.remark || ""}>
                  {truncateRemark(location.remark, 30)}
                </td>
                <td>
                  <div className="actions-buttons">
                    <IconButton
                      variant="print"
                      onClick={() => onPrint(location)}
                    />
                    <IconButton
                      variant="edit"
                      onClick={() => onEdit(location)}
                    />
                    <IconButton
                      variant="delete"
                      onClick={() => onDelete(location)}
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

export default LocationTable;
