import { useState } from "react";
import ProfileModal from "./profile/ProfileModal";

import type { UserType } from "../types/user.type";

import IconButton from "../../../components/Button/IconButton";
import Table from "../../../components/Table/Table";
import "../../../components/Button/button.css";
import "../../../components/Table/table.css";
import "../../../styles/component.css";
import * as XLSX from "xlsx";
import { confirmAlert } from "../../../utils/alert";
import { userApi } from "../services/user.api";
import Swal from "sweetalert2";

type Props = {
  users: UserType[];
  searchQuery: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearSearch: () => void;
  showFilterDropdown: boolean;
  onToggleFilter: () => void;
  searchableColumns: {
    fullName: boolean;
    email: boolean;
    tel: boolean;
    user_level: boolean;
    status: boolean;
    remark: boolean;
  };
  onToggleSearchableColumn: (column: keyof Props["searchableColumns"]) => void;
  onClearAllColumns: () => void;
  onAddNew: () => void;
  onEdit: (user: UserType) => void;
  onDelete: (user: UserType) => void;
  currentPage?: number;
  itemsPerPage?: number;
};

const UserTable = ({
  users,
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
  const [profileUserId, setProfileUserId] = useState<number | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const openProfile = (id: number) => {
    setProfileUserId(id);
    setIsProfileOpen(true);
  };
  const tableHeaders = [
    "No",
    "Full Name",
    "Email",
    "Tel.",
    "Level",
    "Status",
    "Remark",
    "Action",
  ];

  const handleExportExcel = async () => {
    const result = await confirmAlert(
      "คุณต้องการ Export ข้อมูล User เป็นไฟล์ Excel ใช่หรือไม่?",
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
        const response: any = await userApi.getAll();

        // รองรับ structure หลายแบบ
        let allUsers = [];
        if (response.data) {
          allUsers = response.data.data || response.data || [];
        }

        Swal.close();

        // ตรวจสอบว่ามีข้อมูลหรือไม่
        if (!allUsers || allUsers.length === 0) {
          Swal.fire({
            icon: "warning",
            title: "ไม่พบข้อมูล",
            text: "ไม่มีข้อมูล User ที่จะ Export",
          });
          return;
        }

        // เตรียมข้อมูลสำหรับ export
        const dataToExport = allUsers.map((user: UserType, index: number) => ({
          No: index + 1,
          "Full Name": `${user.first_name} ${user.last_name}`,
          Email: user.email,
          "Tel.": user.tel,
          Level: user.user_level,
          Status: user.status,
          Remark: user.remark,
        }));

        // สร้าง worksheet
        const ws = XLSX.utils.json_to_sheet(dataToExport);

        // สร้าง workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Users");

        // สร้างชื่อไฟล์ตามวันที่ปัจจุบัน
        const date = new Date();
        const dateStr = date.toISOString().split("T")[0];
        const fileName = `Users_${dateStr}.xlsx`;

        // Export ไฟล์
        XLSX.writeFile(wb, fileName);

        Swal.fire({
          icon: "success",
          title: "Export สำเร็จ",
          text: `Export ข้อมูล ${allUsers.length} รายการเรียบร้อยแล้ว`,
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
        <div className="page-title">User</div>

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
                  email: "Email",
                  tel: "Tel.",
                  user_level: "Level",
                  status: "Status",
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
          {users.length === 0 ? (
            <tr>
              <td colSpan={tableHeaders.length} className="no-data">
                No users found.
              </td>
            </tr>
          ) : (
            users.map((user, index) => (
              <tr key={user.id}>
                <td>{(currentPage - 1) * itemsPerPage + index + 1}</td>
                <td style={{ minWidth: "230px" }}>
                  {user.first_name + " " + user.last_name}
                </td>
                <td>{user.email}</td>
                <td>{user.tel}</td>
                <td>{user.user_level}</td>
                <td>{user.status}</td>
                <td>{user.remark}</td>
                <td>
                  <div className="user-actions-buttons">
                    <IconButton
                      variant="profile"
                      onClick={() => openProfile(user.id)}
                    />
                    <IconButton variant="edit" onClick={() => onEdit(user)} />
                    <IconButton
                      variant="delete"
                      onClick={() => onDelete(user)}
                    />
                  </div>
                </td>
              </tr>
            ))
          )}
        </Table>
      </div>
      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => {
          setIsProfileOpen(false);
          setProfileUserId(null);
        }}
        userId={profileUserId}
      />
    </>
  );
};

export default UserTable;
