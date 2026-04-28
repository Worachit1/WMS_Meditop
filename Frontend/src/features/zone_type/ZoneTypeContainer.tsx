import { useCallback, useEffect, useState } from "react";
import type { ZoneType_Type } from "./types/zone_type.type";
import { zoneTypeApi } from "./services/zone_type.api";
import {
  DEFAULT_PAGE_LIMIT,
  SHOW_LOADING_THRESHOLD,
  MIN_LOADING_TIME,
} from "../../utils/contants";

import { toast } from "react-toastify";
import Loading from "../../components/Loading/Loading";

import ZoneTypeTable from "./components/ZoneTypeTable";
import AddZoneTypeModal from "./components/AddZoneTypeModal";
import EditZoneTypeModal from "./components/EditZoneTypeModal";
import { successAlert, deleteAlert } from "../../utils/alert";
import Pegination from "../../components/Pegination/Pegination";

const ZoneTypeContainer = () => {
  const [zoneTypes, setZoneTypes] = useState<ZoneType_Type[]>([]);
  const [selectedZoneTypeId, setSelectedZoneTypeId] = useState<number | null>(
    null,
  );
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
    zone_type_code: true,
    fullName: true,
    shortName: true,
    remark: true,
  });

  // submission state
  const [_isSubmitting, setIsSubmitting] = useState(false);

  const fetchZoneTypes = useCallback(
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
        if (!search.trim()) {
          const response = await zoneTypeApi.getAllPaginated({
            page,
            limit,
            search: search.trim() || undefined,
          });
          const { data = [], meta } = response.data;
          setZoneTypes(data);
          setTotalItems(meta.total);
          setTotalPages(meta.totalPages);
        } else {
          // ถ้ามี search query ให้ดึงข้อมูลทั้งหมดมากรองเอง
          const response = await zoneTypeApi.getAllPaginated({
            page: 1,
            limit: 9999, // ดึงทั้งหมดมาก่อน
          });
          const allZoneTypes = response.data.data || [];

          // กรองตาม searchableColumns
          const filtered = allZoneTypes.filter((zoneType: ZoneType_Type) => {
            const searchLower = search.toLowerCase();

            if (
              columns.zone_type_code &&
              zoneType.zone_type_code?.toString().toLowerCase().includes(searchLower)
            )
              return true;
            if (
              columns.fullName &&
              zoneType.full_name?.toLowerCase().includes(searchLower)
            )
              return true;
            if (
              columns.shortName &&
              zoneType.short_name?.toLowerCase().includes(searchLower)
            )
              return true;
            if (
              columns.remark &&
              zoneType.remark?.toLowerCase().includes(searchLower)
            )
              return true;

            return false;
          });

          // จัดการ pagination ของข้อมูลที่กรองแล้ว
          const startIndex = (page - 1) * limit;
          const endIndex = startIndex + limit;
          const paginatedData = filtered.slice(startIndex, endIndex);

          setZoneTypes(paginatedData);
          setTotalPages(Math.ceil(filtered.length / limit));
          setTotalItems(filtered.length);
        }
      } catch (error) {
        console.error("Failed to fetch zone types:", error);
        toast.error("Failed to fetch zone types");
      } finally {
        const elapsed = Date.now() - startTime;
        clearTimeout(loadingTimeout);

        const delay =
          elapsed < SHOW_LOADING_THRESHOLD
            ? 0
            : Math.max(
                MIN_LOADING_TIME - (elapsed - SHOW_LOADING_THRESHOLD),
                0,
              );

        setTimeout(() => setLoading(false), delay);
        setIsSubmitting(false);
      }
    },
    [],
  );

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
    fetchZoneTypes(currentPage, debouncedSearch, itemsPerPage, searchableColumns);
  }, [currentPage, debouncedSearch, itemsPerPage, searchableColumns, fetchZoneTypes]);

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
    fetchZoneTypes(currentPage, debouncedSearch, itemsPerPage, searchableColumns);
  };

  const handleEdit = (zoneType: ZoneType_Type) => {
    setSelectedZoneTypeId(zoneType.id);
    setIsEditModalOpen(true);
  };

  const handleDelete = (zoneType: ZoneType_Type) => {
    // TODO: Implement delete departmentlock_no effect 
    deleteAlert().then(async (result) => {
      if (result.isConfirmed) {
        try {
          await zoneTypeApi.remove(zoneType.id);
          successAlert("Deleted!", "Zone type has been deleted.");
          fetchZoneTypes(currentPage, debouncedSearch, itemsPerPage, searchableColumns);
        } catch (error: any) {
          console.error("Failed to delete zone type:", error);
          
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
            toast.error("Failed to delete zone type");
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
        <ZoneTypeTable
          zoneTypes={zoneTypes}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          onClearSearch={() => setSearchQuery("")}
          showFilterDropdown={showFilterDropdown}
          onToggleFilter={() => setShowFilterDropdown(!showFilterDropdown)}
          searchableColumns={searchableColumns}
          onToggleSearchableColumn={toggleSearchableColumn}
          onClearAllColumns={() =>
            setSearchableColumns({
              zone_type_code: false,
              fullName: false,
              shortName: false,
              remark: false,
            })
          }
          onAddNew={handleAddNew}
          onEdit={handleEdit}
          onDelete={handleDelete}
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

      <AddZoneTypeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={handleAddSuccess}
      />

      <EditZoneTypeModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        zoneTypeId={selectedZoneTypeId!}
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

export default ZoneTypeContainer;
