import { useState, useEffect } from "react";
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

import { departmentApi } from "../../department/services/department.api";

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
    department: boolean;
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
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([
    "all",
  ]);
  const [showDeptDropdown, setShowDeptDropdown] = useState(false);

  const [departmentOptions, setDepartmentOptions] = useState<string[]>([]);

  const currentUserLevel = localStorage.getItem("user_level");

  const isCurrentUserAdmin = currentUserLevel === "Admin";


  useEffect(() => {
  const fetchDepartments = async () => {
    try {
      const resp: any = await departmentApi.getAll();

      const rows = Array.isArray(resp?.data?.data)
        ? resp.data.data
        : Array.isArray(resp?.data)
          ? resp.data
          : [];

      const options = rows
        .map((d: any) => String(d?.short_name ?? "").trim())
        .filter(Boolean)
        .sort();

      setDepartmentOptions(options);
    } catch (err) {
      console.error("Fetch departments failed:", err);
      setDepartmentOptions([]);
    }
  };

  fetchDepartments();
}, []);

  const openProfile = (id: number) => {
    setProfileUserId(id);
    setIsProfileOpen(true);
  };

  const toggleDepartment = (dept: string) => {
    if (dept === "all") {
      setSelectedDepartments(["all"]);
      return;
    }

    setSelectedDepartments((prev) => {
      const withoutAll = prev.filter((d) => d !== "all");

      const next = withoutAll.includes(dept)
        ? withoutAll.filter((d) => d !== dept)
        : [...withoutAll, dept];

      return next.length === 0 ? ["all"] : next;
    });
  };

  const filteredUsers = users.filter((user) => {
    if (selectedDepartments.includes("all")) return true;

    const userDepartments = Array.isArray((user as any).departments)
      ? (user as any).departments
          .map((d: any) => String(d?.short_name ?? "").trim())
          .filter(Boolean)
      : [];

    return userDepartments.some((dept: string) =>
      selectedDepartments.includes(dept),
    );
  });

  const tableHeaders = [
    "No",
    "Full Name",
    "Email",
    "Tel.",
    "Department",
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

          Department: Array.isArray((user as any).departments)
            ? (user as any).departments
                .map((d: any) => d?.short_name)
                .filter(Boolean)
                .join(", ")
            : "-",

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
          {/* Department filter */}
          {departmentOptions.length > 0 && (
            <div className="dept-filter">
              <label>แผนก:</label>
              <div className="filter-wrap">
                <button
                  type="button"
                  className="dept-select"
                  onClick={() => setShowDeptDropdown((v) => !v)}
                >
                  {selectedDepartments.includes("all")
                    ? "ทั้งหมด"
                    : selectedDepartments.join(", ")}
                  <i
                    className="fa fa-chevron-down"
                  />
                </button>
                {showDeptDropdown && (
                  <div className="filter-dropdown-3">
                    <label className="filter-option">
                      <input
                        type="checkbox"
                        checked={selectedDepartments.includes("all")}
                        onChange={() => toggleDepartment("all")}
                      />
                      <span>ทั้งหมด</span>
                    </label>
                    {departmentOptions.map((dept) => (
                      <label className="filter-option" key={dept}>
                        <input
                          type="checkbox"
                          checked={selectedDepartments.includes(dept)}
                          onChange={() => toggleDepartment(dept)}
                        />
                        <span>{dept}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
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
                    clear
                  </button>
                </div>

                {Object.entries({
                  fullName: "Full Name",
                  email: "Email",
                  tel: "Tel.",
                  user_level: "Level",
                  status: "Status",
                  remark: "Remark",
                  department: "Department",
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
          {filteredUsers.length === 0 ? (
            <tr>
              <td colSpan={tableHeaders.length} className="no-data">
                No users found.
              </td>
            </tr>
          ) : (
            filteredUsers.map((user, index) => (
              <tr key={user.id}>
                <td>{(currentPage - 1) * itemsPerPage + index + 1}</td>
                <td style={{ minWidth: "230px" }}>
                  {user.first_name + " " + user.last_name}
                </td>
                <td>{user.email}</td>
                <td>{user.tel}</td>
                <td>
                  {Array.isArray((user as any).departments)
                    ? (user as any).departments
                        .map((d: any) => d?.short_name)
                        .filter(Boolean)
                        .join(", ")
                    : "-"}
                </td>
                <td>{user.user_level}</td>
                <td>{user.status}</td>
                <td>{user.remark}</td>
                <td>
                  <div className="user-actions-buttons">
                    <IconButton
                      variant="profile"
                      onClick={() => openProfile(user.id)}
                    />
                    {isCurrentUserAdmin && (
                      <IconButton variant="edit" onClick={() => onEdit(user)} />
                    )}
                    {isCurrentUserAdmin && (
                      <IconButton
                        variant="delete"
                        onClick={() => onDelete(user)}
                      />
                    )}
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
