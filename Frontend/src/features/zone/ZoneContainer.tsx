import { useCallback, useEffect, useState } from "react";
import type { ZoneType } from "./types/zone.type";
import { zoneApi } from "./services/zone.api";
import {
  DEFAULT_PAGE_LIMIT,
  SHOW_LOADING_THRESHOLD,
  MIN_LOADING_TIME,
} from "../../utils/contants";

import { toast } from "react-toastify";
import Loading from "../../components/Loading/Loading";

import ZoneTable from "./components/ZoneTable";
import AddZoneModal from "./components/AddZoneModal";
import EditZoneModal from "./components/EditZoneModal";
import { successAlert, deleteAlert } from "../../utils/alert";
import Pegination from "../../components/Pegination/Pegination";

const ZoneContainer = () => {
  const [zones, setZones] = useState<ZoneType[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null); 
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
    building: true,
    zoneType: true,
    remark: true,
  });

  // submission state
  const [_isSubmitting, setIsSubmitting] = useState(false);

  const fetchZones = useCallback(
    async (page: number, search: string, limit: number, columns: typeof searchableColumns) => {
      const startTime = Date.now();

      const loadingTimeout = setTimeout(() => {
        setLoading(true);
      }, SHOW_LOADING_THRESHOLD);

      try {
        setIsSubmitting(true);
        if (!search.trim()) {
        const response = await zoneApi.getAllPaginated({
          page,
          limit,
          search: search.trim() || undefined,
        });
        const { data = [], meta } = response.data;
        setZones(data);
        setTotalPages(meta.totalPages);
        setTotalItems(meta.total);
      } else {
        // ถ้ามี search query ให้ดึงข้อมูลทั้งหมดมากรองเอง
        const response = await zoneApi.getAllPaginated({
          page: 1,
          limit: 1000, // ดึงมามากๆ เพื่อกรอง
        });
        const { data = [] } = response.data;
        const filteredZones = data.filter((zone) => {
          return (
            (columns.fullName &&
              zone.full_name
                .toLowerCase().includes(search.toLowerCase())) ||
            (columns.shortName &&
              zone.short_name
                .toLowerCase().includes(search.toLowerCase())) ||
            (columns.building &&
              zone.building.short_name
                .toLowerCase().includes(search.toLowerCase())) ||
            (columns.zoneType &&
              zone.zone_type.short_name
                .toLowerCase().includes(search.toLowerCase())) ||
            (columns.remark &&
              zone.remark
                .toLowerCase().includes(search.toLowerCase()))
          );
        });

        // จัดการ pagination ของข้อมูลที่กรองแล้ว
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedData = filteredZones.slice(startIndex, endIndex);
        setZones(paginatedData);
        setTotalPages(Math.ceil(filteredZones.length / limit));
        setTotalItems(filteredZones.length);
      }
      } catch (error) {
        console.error("Failed to fetch zones:", error);
        toast.error("Failed to fetch zones");
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
    },[]);

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
    fetchZones(currentPage, debouncedSearch, itemsPerPage, searchableColumns);
  }, [currentPage, debouncedSearch, itemsPerPage, fetchZones, searchableColumns]);

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
    fetchZones(currentPage, debouncedSearch, itemsPerPage, searchableColumns);
  };

  const handleEdit = (zone: ZoneType) => {
    setSelectedZoneId(zone.id); // ✅ zone.id เป็น string
    setIsEditModalOpen(true);
  };

  const handleDelete = (zone: ZoneType) => {
    // TODO: Implement delete department
    deleteAlert().then(async (result) => {
      if (result.isConfirmed) {
        try {
          await zoneApi.remove(zone.id);
          successAlert("Deleted!", "Zone type has been deleted.");
          fetchZones(currentPage, debouncedSearch, itemsPerPage, searchableColumns);
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
        <ZoneTable
          zones={zones}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          onClearSearch={() => setSearchQuery("")}
          showFilterDropdown={showFilterDropdown}
          onToggleFilter={() => setShowFilterDropdown(!showFilterDropdown)}
          searchableColumns={searchableColumns}
          onToggleSearchableColumn={toggleSearchableColumn}
          onClearAllColumns={() =>
            setSearchableColumns({
              fullName: false,
              shortName: false,
              building: false,
              zoneType: false,
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

      <AddZoneModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={handleAddSuccess}
      />

      <EditZoneModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        zoneId={selectedZoneId!}
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

export default ZoneContainer;
