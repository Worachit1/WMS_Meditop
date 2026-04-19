import type { BuildingType } from "../types/building.type";

import IconButton from "../../../components/Button/IconButton";
import Table from "../../../components/Table/Table";
import "../../../components/Button/button.css";
import "../../../components/Table/table.css";
import "../../../styles/component.css";
import * as XLSX from "xlsx";
import { confirmAlert } from "../../../utils/alert";
import { buildingApi } from "../services/building.api";
import Swal from "sweetalert2";

type Props = {
  buildings: BuildingType[];
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
  onEdit: (building: BuildingType) => void;
  onDelete: (building: BuildingType) => void;
  currentPage?: number;
  itemsPerPage?: number;
};

const BuildingTable = ({
  buildings,
  searchQuery,
  onSearchChange,
  onClearSearch,
  showFilterDropdown,
  onToggleFilter,
  searchableColumns,
  onToggleSearchableColumn,
  onAddNew,
  onEdit,
  onDelete,
  onClearAllColumns,
  currentPage = 1,
  itemsPerPage = 10,
}: Props) => {
  const tableHeaders = ["No", "Full Name", "Short Name", "Remark", "Action"];

  const handleExportExcel = async () => {
    const result = await confirmAlert(
      "คุณต้องการ Export ข้อมูล Building เป็นไฟล์ Excel ใช่หรือไม่?",
    );

    if (result.isConfirmed) {
      try {
        // แสดง loading
        Swal.fire({
          title: "กำลังเตรียมข้อมูล...",
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });

        // ดึงข้อมูลทั้งหมดจาก API โดยไม่มี limit
        const response: any = await buildingApi.getAll();

        //รองรับข้อมูล buildings จาก response
        let allBuilding = [];
        if (response.data) {
          allBuilding = response.data.data || response.data || [];
        }

        Swal.close();

        // ตรวจสอบว่ามีข้อมูลหรือไม่
        if (allBuilding.length === 0) {
          Swal.fire({
            icon: "warning",
            title: "ไม่พบข้อมูล",
            text: "ไม่มีข้อมูล Building ที่จะ Export",
          });
          return;
        }

        // เตรียมข้อมูลสำหรับ export
        const dataToExport = allBuilding.map(
          (building: BuildingType, index: number) => ({
            No: index + 1,
            ID: building.building_code,
            "Full Name": building.full_name,
            "Short Name": building.short_name,
            Remark: building.remark,
          }),
        );

        // สร้าง worksheet
        const ws = XLSX.utils.json_to_sheet(dataToExport);

        // สร้าง workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Buildings");

        // สร้างชื่อไฟล์ตามวันที่ปัจจุบัน
        const date = new Date();
        const dateStr = date.toISOString().split("T")[0];
        const fileName = `Buildings_${dateStr}.xlsx`;

        // Export ไฟล์
        XLSX.writeFile(wb, fileName);

        Swal.fire({
          icon: "success",
          title: "Export สำเร็จ",
          text: `Export ข้อมูล ${allBuilding.length} รายการเรียบร้อยแล้ว`,
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

  return (
    <>
      <div className="page-header">
        <div className="page-title">Building</div>

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
        </div>
      </div>

      <div className="table__wrapper">
        <Table headers={tableHeaders}>
          {buildings.length === 0 ? (
            <tr>
              <td colSpan={tableHeaders.length} className="no-data">
                No buildings found.
              </td>
            </tr>
          ) : (
            buildings.map((building, index) => (
              <tr key={building.id}>
                <td>{(currentPage - 1) * itemsPerPage + index + 1}</td>
                <td>{building.full_name}</td>
                <td>{building.short_name}</td>
                <td>{building.remark}</td>
                <td>
                  <div className="action-buttons">
                    <IconButton
                      variant="edit"
                      onClick={() => onEdit(building)}
                    />
                    <IconButton
                      variant="delete"
                      onClick={() => onDelete(building)}
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

export default BuildingTable;
