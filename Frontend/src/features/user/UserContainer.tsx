import { useCallback, useEffect, useState } from "react";
import type { UserType } from "./types/user.type";
import { userApi } from "./services/user.api";
import {
  DEFAULT_PAGE_LIMIT,
  SHOW_LOADING_THRESHOLD,
  MIN_LOADING_TIME,
} from "../../utils/contants";

import { toast } from "react-toastify";
import Loading from "../../components/Loading/Loading";

import UserTable from "./components/UserTable";
import AddUserModal from "./components/AddUserModal";
import EditUserModal from "./components/EditUserModal";
import { successAlert, deleteAlert } from "../../utils/alert";
import Pegination from "../../components/Pegination/Pegination";

const UserContainer = () => {
  const [users, setUsers] = useState<UserType[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_PAGE_LIMIT);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // filter and search state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState(""); // 🔥 ใช้ debounce เพื่อรอให้พิมพ์หยุดก่อน
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [searchableColumns, setSearchableColumns] = useState({
    fullName: true,
    email: true,
    tel: true,
    user_level: true,
    status: true,
    remark: true,
  });

  // submission state
  const [_isSubmitting, setIsSubmitting] = useState(false);

  const fetchUsers = useCallback(
    async (
      page: number,
      search: string,
      limit: number,
      columns: typeof searchableColumns,
    ) => {
      const startTime = Date.now();

      const loadingTimeout = setTimeout(() => {
        setLoading(true);
      }, SHOW_LOADING_THRESHOLD);

      try {
        setIsSubmitting(true);

        // ถ้าไม่มี search query ให้ดึงข้อมูลทั้งหมด
        if (!search.trim()) {
          const response = await userApi.getAllPaginated({
            page,
            limit,
          });
          const { data = [], meta } = response.data;
          setUsers(data);
          setTotalPages(meta.totalPages);
          setTotalItems(meta.total);
        } else {
          // ถ้ามี search query ให้ดึงข้อมูลทั้งหมดมากรองเอง
          const response = await userApi.getAllPaginated({
            page: 1,
            limit: 9999, // ดึงทั้งหมดมาก่อน
          });
          const allUsers = response.data.data || [];

          // กรองตาม searchableColumns
          const filtered = allUsers.filter((user: UserType) => {
            const searchLower = search.toLowerCase();

            if (
              columns.fullName &&
              (user.first_name + " " + user.last_name)
                .toLowerCase()
                .includes(searchLower)
            )
              return true;
            if (
              columns.email &&
              user.email?.toLowerCase().includes(searchLower)
            )
              return true;
            if (columns.tel && user.tel?.toLowerCase().includes(searchLower))
              return true;
            if (
              columns.user_level &&
              user.user_level?.toString().toLowerCase().includes(searchLower)
            )
              return true;
            if (
              columns.status &&
              user.status?.toLowerCase().includes(searchLower)
            )
              return true;
            if (
              columns.remark &&
              user.remark?.toLowerCase().includes(searchLower)
            )
              return true;

            return false;
          });

          // จัดการ pagination ของข้อมูลที่กรองแล้ว
          const startIndex = (page - 1) * limit;
          const endIndex = startIndex + limit;
          const paginatedData = filtered.slice(startIndex, endIndex);

          setUsers(paginatedData);
          setTotalPages(Math.ceil(filtered.length / limit));
          setTotalItems(filtered.length);
        }
      } catch (error) {
        console.error("Failed to fetch users:", error);
        toast.error("Failed to fetch users");
      } finally {
        clearTimeout(loadingTimeout);
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime < MIN_LOADING_TIME) {
          setTimeout(() => setLoading(false), MIN_LOADING_TIME - elapsedTime);
        } else {
          setLoading(false);
        }
        setIsSubmitting(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchUsers(currentPage, debouncedSearch, itemsPerPage, searchableColumns);
  }, [
    fetchUsers,
    currentPage,
    debouncedSearch,
    itemsPerPage,
    searchableColumns,
  ]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1); // reset page เมื่อพิมพ์ search ใหม่
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };
  const toggleSearchableColumn = (column: keyof typeof searchableColumns) => {
    setSearchableColumns((prev) => ({ ...prev, [column]: !prev[column] }));
  };

  const handleAddNew = () => {
    setIsAddModalOpen(true);
  };

  const handleEdit = (user: UserType) => {
    setSelectedUserId(user.id);
    setIsEditModalOpen(true);
  };

  const handleDelete = async (user: UserType) => {
    const result = await deleteAlert();
    if (!result.isConfirmed) {
      return;
    }
    try {
      await userApi.remove(user.id);
      successAlert("User deleted successfully");
      fetchUsers(currentPage, debouncedSearch, itemsPerPage, searchableColumns);
    } catch (error) {
      console.error("Failed to delete user:", error);
      toast.error("Failed to delete user");
    }
  };

  const handleItemsPerPageChange = (limit: number) => {
    setItemsPerPage(limit);
    setCurrentPage(1);
  };

  return (
    <div className="user-page-container">
      <div>
        <UserTable
          users={users}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          onClearSearch={() => setSearchQuery("")}
          showFilterDropdown={showFilterDropdown}
          onDelete={handleDelete}
          onToggleFilter={() => setShowFilterDropdown(!showFilterDropdown)}
          searchableColumns={searchableColumns}
          onToggleSearchableColumn={toggleSearchableColumn}
          onClearAllColumns={() =>
            setSearchableColumns({
              fullName: false,
              email: false,
              tel: false,
              user_level: false,
              status: false,
              remark: false,
            })
          }
          onAddNew={handleAddNew}
          onEdit={handleEdit}
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
        />

        <Pegination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={(page) => setCurrentPage(page)}
          onItemsPerPageChange={handleItemsPerPageChange}
        />
      </div>

      <AddUserModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={() =>
          fetchUsers(
            currentPage,
            debouncedSearch,
            itemsPerPage,
            searchableColumns,
          )
        }
      />

      <EditUserModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        userId={selectedUserId!}
        onSuccess={() =>
          fetchUsers(
            currentPage,
            debouncedSearch,
            itemsPerPage,
            searchableColumns,
          )
        }
      />

      {loading && (
        <div className="loading-overlay">
          <Loading />
        </div>
      )}
    </div>
  );
};

export default UserContainer;
