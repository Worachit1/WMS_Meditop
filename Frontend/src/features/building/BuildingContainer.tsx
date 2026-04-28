import { useCallback, useEffect, useState } from "react";
import type { BuildingType } from "./types/building.type";
import { buildingApi } from "./services/building.api";
import {
  DEFAULT_PAGE_LIMIT,
  SHOW_LOADING_THRESHOLD,
  MIN_LOADING_TIME,
} from "../../utils/contants";

import { toast } from "react-toastify";
import Loading from "../../components/Loading/Loading";

import BuildingTable from "./components/BuildingTable";
import AddBuildingModal from "./components/AddBuidlingModal";
import EditBuildingModal from "./components/EditBuildingModal";
import { successAlert, deleteAlert } from "../../utils/alert";
import Pegination from "../../components/Pegination/Pegination";

const BuildingContainer = () => {
  const [buildings, setBuildings] = useState<BuildingType[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<
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
    building_code: true,
    fullName: true,
    shortName: true,
    remark: true,
  });

  // submission state
  const [_isSubmitting, setIsSubmitting] = useState(false);

  const fetchBuildings = useCallback(
    async (page: number, search: string, limit: number, columns: typeof searchableColumns) => {
      const startTime = Date.now();

      const loadingTimeout = setTimeout(() => {
        setLoading(true);
      }, SHOW_LOADING_THRESHOLD);

      try {
        setIsSubmitting(true);
        if (!search.trim()) {
        const response = await buildingApi.getAllPaginated({
          page,
          limit,
          search: search.trim() || undefined,
        });
        const { data = [], meta } = response.data;
        setBuildings(data);
        setTotalPages(meta.totalPages);
        setTotalItems(meta.total);
      } else {
         // ถ้ามี search query ให้ดึงข้อมูลทั้งหมดมากรองเอง
                const response = await buildingApi.getAllPaginated({
                  page: 1,
                  limit: 9999, // ดึงทั้งหมดมาก่อน
                });
                const allBuildings = response.data.data || [];

                 // กรองตาม searchableColumns
                        const filtered = allBuildings.filter((building: BuildingType) => {
                          const searchLower = search.toLowerCase();
                          
                          if (columns.building_code && building.building_code?.toLowerCase().includes(searchLower)) return true;
                          if (columns.fullName && building.full_name?.toLowerCase().includes(searchLower)) return true;
                          if (columns.shortName && building.short_name?.toLowerCase().includes(searchLower)) return true;
                          if (columns.remark && building.remark?.toLowerCase().includes(searchLower)) return true;
                          
                          return false;
                        });
                        
                        // จัดการ pagination ของข้อมูลที่กรองแล้ว
                        const startIndex = (page - 1) * limit;
                        const endIndex = startIndex + limit;
                        const paginatedData = filtered.slice(startIndex, endIndex);
                        
                        setBuildings(paginatedData);
                        setTotalPages(Math.ceil(filtered.length / limit));
                        setTotalItems(filtered.length);
                      }
      } catch (error) {
        console.error("Failed to fetch buildings:", error);
        toast.error("Failed to fetch buildings");
      } finally {
        const elapsed = Date.now() - startTime;
        clearTimeout(loadingTimeout);

        const delay =
          elapsed < SHOW_LOADING_THRESHOLD
            ? 0
            : Math.max(
                MIN_LOADING_TIME - (elapsed - SHOW_LOADING_THRESHOLD),
                0
              );

        setTimeout(() => setLoading(false), delay);
        setIsSubmitting(false);
      }
    },
    []
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
    fetchBuildings(currentPage, debouncedSearch, itemsPerPage, searchableColumns);
  }, [currentPage, debouncedSearch, itemsPerPage, searchableColumns, fetchBuildings]);

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
    fetchBuildings(currentPage, debouncedSearch, itemsPerPage, searchableColumns);
  };

  const handleEdit = (building: BuildingType) => {
    setSelectedBuildingId(building.id);
    setIsEditModalOpen(true);
  };

  const handleDelete = (building: BuildingType) => {
    deleteAlert().then(async (result) => {
      if (result.isConfirmed) {
        try {
          await buildingApi.remove(building.id);
          successAlert("Deleted!", "Building has been deleted.");
          fetchBuildings(currentPage, debouncedSearch, itemsPerPage, searchableColumns);
        } catch (error: any) {
          console.error("Failed to delete building:", error);
          
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
            toast.error("Failed to delete building");
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
    <div className="building-page-container">
      <div>
        <BuildingTable
          buildings={buildings}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          onClearSearch={() => setSearchQuery("")}
          showFilterDropdown={showFilterDropdown}
          onToggleFilter={() => setShowFilterDropdown(!showFilterDropdown)}
          searchableColumns={searchableColumns}
          onToggleSearchableColumn={toggleSearchableColumn}
          onClearAllColumns={() =>
            setSearchableColumns({
              building_code: false,
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

      <AddBuildingModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={handleAddSuccess}
      />

      <EditBuildingModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        buildingId={selectedBuildingId!}
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

export default BuildingContainer;
