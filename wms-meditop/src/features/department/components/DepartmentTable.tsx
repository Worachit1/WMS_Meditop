import type { DepartmentType } from "../types/department.type";
import { useState } from "react";
import { http } from "../../../services/http";
import Swal from "sweetalert2";

import IconButton from "../../../components/Button/IconButton";
import Table from "../../../components/Table/Table";
import "../../../components/Button/button.css";
import "../../../components/Table/table.css";
import "../../../styles/component.css";
import * as XLSX from "xlsx";
import { confirmAlert } from "../../../utils/alert";
import { departmentApi } from "../services/department.api";

type Props = {
  departments: DepartmentType[];
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
  onEdit: (department: DepartmentType) => void;
  onDelete: (department: DepartmentType) => void;
  currentPage?: number;
  itemsPerPage?: number;
};

const DepartmentTable = ({
  departments,
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
      "คุณต้องการ Export ข้อมูล Department เป็นไฟล์ Excel ใช่หรือไม่?",
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
        const response = await departmentApi.getAll();

        // รองรับ structure หลายแบบ
        let allDepartments = [];
        if (response.data) {
          allDepartments = response.data || response.data.data || [];
        }

        console.log("allDepartments", allDepartments);

        Swal.close();

        // ตรวจสอบว่ามีข้อมูลหรือไม่
        if (!allDepartments || allDepartments.length === 0) {
          Swal.fire({
            icon: "info",
            title: "ไม่มีข้อมูล",
            text: "ไม่พบข้อมูล Department สำหรับการส่งออก",
          });
          return;
        }

        // เตรียมข้อมูลสำหรับ export
        const dataToExport = allDepartments.map(
          (department: DepartmentType, index: number) => ({
            No: index + 1,
            ID: department.department_code,
            "Full Name": department.full_name,
            "Short Name": department.short_name,
            Remark: department.remark,
          }),
        );

        // สร้าง worksheet
        const ws = XLSX.utils.json_to_sheet(dataToExport);

        // สร้าง workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Departments");

        // สร้างชื่อไฟล์ตามวันที่ปัจจุบัน
        const date = new Date();
        const dateStr = date.toISOString().split("T")[0];
        const fileName = `Departments_${dateStr}.xlsx`;

        // Export ไฟล์
        XLSX.writeFile(wb, fileName);

        Swal.fire({
          icon: "success",
          title: "ส่งออกสำเร็จ",
          text: "ส่งออกข้อมูล Department เป็นไฟล์ Excel เรียบร้อยแล้ว",
          timer: 3000,
          showConfirmButton: false,
        });
      } catch (error: any) {
        console.error("Export error:", error);
        Swal.fire({
          icon: "error",
          title: "ส่งออกไม่สำเร็จ",
          text:
            error?.response?.data?.message || "เกิดข้อผิดพลาดในการส่งออกข้อมูล",
        });
      }
    }
  };

  const handleSync = async () => {
    const result = await Swal.fire({
      title: "ยืนยันการซิงค์ข้อมูล?",
      text: "คุณต้องการซิงค์ข้อมูล Department จาก Odoo ใช่หรือไม่?",
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
      await http.post("/departments/sync");
      Swal.fire({
        icon: "success",
        title: "Sync สำเร็จ",
        text: "ซิงค์ข้อมูล Department เรียบร้อยแล้ว",
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
        <div className="page-title">Department</div>

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
          {departments.length === 0 ? (
            <tr>
              <td colSpan={tableHeaders.length} className="no-data">
                No departments found.
              </td>
            </tr>
          ) : (
            departments.map((department, index) => (
              <tr key={department.id}>
                <td>{(currentPage - 1) * itemsPerPage + index + 1}</td>
                <td>{department.full_name}</td>
                <td>{department.short_name}</td>
                <td>{department.remark}</td>
                <td>
                  <div className="action-buttons">
                    <IconButton
                      variant="edit"
                      onClick={() => onEdit(department)}
                    />
                    <IconButton
                      variant="delete"
                      onClick={() => onDelete(department)}
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

export default DepartmentTable;
