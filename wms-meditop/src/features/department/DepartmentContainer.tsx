import { useCallback, useEffect, useState } from "react";
import type { DepartmentType } from "./types/department.type";
import { departmentApi } from "./services/department.api";
import {
  DEFAULT_PAGE_LIMIT,
  SHOW_LOADING_THRESHOLD,
  MIN_LOADING_TIME,
} from "../../utils/contants";

import { toast } from "react-toastify";
import Loading from "../../components/Loading/Loading";

import DepartmentTable from "./components/DepartmentTable";
import AddDepartmentModal from "./components/AddDepartmentModal";
import EditDepartmentModal from "./components/EditDepartmentModal";
import { successAlert, deleteAlert } from "../../utils/alert";
import Pegination from "../../components/Pegination/Pegination";

const DepartmentContainer = () => {
  const [departments, setDepartments] = useState<DepartmentType[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<
    number | null
  >(null);
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
    shortName: true,
    remark: true,
  });

  // submission state
  const [_isSubmitting, setIsSubmitting] = useState(false);

  const fetchDepartments = useCallback(async (page: number, search: string, limit: number, columns: typeof searchableColumns) => {
    const startTime = Date.now();

    const loadingTimeout = setTimeout(() => {
      setLoading(true);
    }, SHOW_LOADING_THRESHOLD);

    try {
      setIsSubmitting(true);
      
      // ถ้าไม่มี search query ให้ดึงข้อมูลทั้งหมด
      if (!search.trim()) {
        const response = await departmentApi.getAllPaginated({
          page,
          limit,
        });
        const { data = [], meta } = response.data;
        setDepartments(data);
        setTotalPages(meta.totalPages);
        setTotalItems(meta.total);
      } else {
        // ถ้ามี search query ให้ดึงข้อมูลทั้งหมดมากรองเอง
        const response = await departmentApi.getAllPaginated({
          page: 1,
          limit: 9999, // ดึงทั้งหมดมาก่อน
        });
        const allDepartments = response.data.data || [];
        
        // กรองตาม searchableColumns
        const filtered = allDepartments.filter((dept: DepartmentType) => {
          const searchLower = search.toLowerCase();
          
          if (columns.fullName && dept.full_name?.toLowerCase().includes(searchLower)) return true;
          if (columns.shortName && dept.short_name?.toLowerCase().includes(searchLower)) return true;
          if (columns.remark && dept.remark?.toLowerCase().includes(searchLower)) return true;
          
          return false;
        });
        
        // จัดการ pagination ของข้อมูลที่กรองแล้ว
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedData = filtered.slice(startIndex, endIndex);
        
        setDepartments(paginatedData);
        setTotalPages(Math.ceil(filtered.length / limit));
        setTotalItems(filtered.length);
      }
    } catch (error) {
      console.error("Failed to fetch departments:", error);
      toast.error("Failed to fetch departments");
    } finally {
      const elapsed = Date.now() - startTime;
      clearTimeout(loadingTimeout);

      const delay =
        elapsed < SHOW_LOADING_THRESHOLD
          ? 0
          : Math.max(MIN_LOADING_TIME - (elapsed - SHOW_LOADING_THRESHOLD), 0);

      setTimeout(() => setLoading(false), delay);
      setIsSubmitting(false);
    }
  }, []);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1); // reset page เมื่อพิมพ์ search ใหม่
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch data when currentPage or debouncedSearch changes
  useEffect(() => {
    fetchDepartments(currentPage, debouncedSearch, itemsPerPage, searchableColumns);
  }, [currentPage, debouncedSearch, itemsPerPage, searchableColumns, fetchDepartments]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };
  const toggleSearchableColumn = (column: keyof typeof searchableColumns) => {
    setSearchableColumns((prev) => ({ ...prev, [column]: !prev[column] }));
  };

  const handleAddNew = () => {
    setIsAddModalOpen(true);
  };

  const handleAddSuccess = () => {
    fetchDepartments(currentPage, debouncedSearch, itemsPerPage, searchableColumns);
  };

  const handleEdit = (department: DepartmentType) => {
    setSelectedDepartmentId(department.id);
    setIsEditModalOpen(true);
  };

  const handleDelete = (department: DepartmentType) => {
    // TODO: Implement delete department
    deleteAlert().then(async (result) => {
      if (result.isConfirmed) {
        try {
          await departmentApi.remove(department.id);
          successAlert("Deleted!", "Department has been deleted.");
          fetchDepartments(currentPage, debouncedSearch, itemsPerPage, searchableColumns);
        } catch (error: any) {
          console.error("Failed to delete department:", error);
          
          // Get error message from backend
          const backendMessage = 
            error?.message || 
            error?.response?.data?.message || 
            error?.response?.data?.error || 
            error?.response?.data?.msg ||
            (typeof error?.response?.data === 'string' ? error?.response?.data : null);
          
          if (backendMessage) {
            toast.error(backendMessage);
          } else {
            toast.error("Failed to delete department");
          }
        }
      }
    });
  };

  const handleItemsPerPageChange = (limit: number) => {
    setItemsPerPage(limit);
    setCurrentPage(1);
  };

  return (
    <div className="department-page-container">
      <div>
        <DepartmentTable
          departments={departments}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          onClearSearch={() => setSearchQuery("")}
          showFilterDropdown={showFilterDropdown}
          onToggleFilter={() => setShowFilterDropdown(!showFilterDropdown)}
          searchableColumns={searchableColumns}
          onToggleSearchableColumn={toggleSearchableColumn}
          onClearAllColumns={() => 
            setSearchableColumns({
              fullName : false,
              shortName : false,
              remark : false,
            })
          }
          onAddNew={handleAddNew}
          onEdit={handleEdit}
          onDelete={handleDelete}
          currentPage={currentPage}
          itemsPerPage={DEFAULT_PAGE_LIMIT}
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

      <AddDepartmentModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={handleAddSuccess}
      />

      <EditDepartmentModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        departmentId={selectedDepartmentId!}
        onSuccess={handleAddSuccess}
      />

      {loading && (
        <div className="loading-overlay">
          <Loading />
        </div>
      )}
    </div>
  );
};

export default DepartmentContainer;
