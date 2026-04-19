import { useCallback, useEffect, useState } from "react";
import type { LocationType } from "./types/location.type";
import { locationApi } from "./services/location.api";
import {
  DEFAULT_PAGE_LIMIT,
  SHOW_LOADING_THRESHOLD,
  MIN_LOADING_TIME,
} from "../../utils/contants";

import { toast } from "react-toastify";
import Loading from "../../components/Loading/Loading";

import LocationTable from "./components/LocationTable";
import EditLocationModal from "./components/EditLocationModal";
import AddLocationModal from "./components/AddLocationModal";
import PrintStickerLocationModal from "./components/PrintStickerLocationModal";
import { successAlert, deleteAlert } from "../../utils/alert";
import Pegination from "../../components/Pegination/Pegination";

const LocationContainer = () => {
  const [locations, setLocations] = useState<LocationType[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(
    null,
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_PAGE_LIMIT);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  //filter and search state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [searchableColumns, setSearchableColumns] = useState({
    fullName: true,
    building: true,
    zone: true,
    lockNo: true,
    zone_type: true,
    ncr_check: true,
    ignore: true,
    remark: true,
  });

  //submission state
  const [_isSubmitting, setIsSubmitting] = useState(false);

  const fetchLocations = useCallback(
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
          const response = await locationApi.getAllPaginated({
            page,
            limit,
            search: search.trim() || undefined,
          });
          const { data = [], meta } = response.data;
          setLocations(data);
          setTotalPages(meta.totalPages);
          setTotalItems(meta.total);
        } else {
          // ถ้ามี search query ให้ดึงข้อมูลทั้งหมดมากรองเอง
          const response = await locationApi.getAll();
          const allLocations = Array.isArray(response.data) 
            ? response.data 
            : (response.data.data || []);
            
          const filteredLocations = allLocations.filter((location: LocationType) => {
            const searchLower = search.toLowerCase();
            if (columns.fullName && location.full_name?.toLowerCase().includes(searchLower)) return true;
            if (columns.building && location.building.short_name?.toLowerCase().includes(searchLower)) return true;
            if (columns.zone && location.zone.short_name?.toLowerCase().includes(searchLower)) return true;
            if (columns.lockNo && location.lock_no?.toLowerCase().includes(searchLower)) return true;
            if (columns.zone_type && location.zone_type?.toLowerCase().includes(searchLower)) return true;
            if (columns.ncr_check && location.ncr_check && "exp&ncr".includes(searchLower)) return true;
            if (columns.remark && location.remark?.toLowerCase().includes(searchLower)) return true;
            return false;
          });
          // จัดการ pagination ของข้อมูลที่กรองแล้ว
          const startIndex = (page - 1) * limit;
          const endIndex = startIndex + limit;
          const paginatedData = filteredLocations.slice(startIndex, endIndex);
          setLocations(paginatedData);
          setTotalPages(Math.ceil(filteredLocations.length / limit));
          setTotalItems(filteredLocations.length);
        }
      } catch (error) {
        console.error("Failed to fetch locations:", error);
        toast.error("Failed to fetch locations");
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
    fetchLocations(currentPage, debouncedSearch, itemsPerPage, searchableColumns);
  }, [fetchLocations, currentPage, debouncedSearch, itemsPerPage, searchableColumns]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 500);

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

  const handleEdit = (location: LocationType) => {
    setSelectedLocationId(location.id);
    setIsEditModalOpen(true);
  };

  const handlePrint = (location: LocationType) => {
    setSelectedLocationId(location.id);
    setIsPrintModalOpen(true);
  };

  const handleDelete = async (location: LocationType) => {
    const result = await deleteAlert();
    if (!result.isConfirmed) {
      return;
    }
    try {
      await locationApi.remove(location.id);
      successAlert("Deleted successfully");
      fetchLocations(currentPage, debouncedSearch, itemsPerPage, searchableColumns);
    } catch (error) {
      console.error("Failed to delete location:", error);
      toast.error("Failed to delete location");
    }
  };

  const handleItemsPerPageChange = (limit: number) => {
    setItemsPerPage(limit);
    setCurrentPage(1);
  };

  return (
    <div className="location-page-container">
      <div>
        <LocationTable
          locations={locations}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          onClearSearch={() => setSearchQuery("")}
          showFilterDropdown={showFilterDropdown}
          onDelete={handleDelete}
          onToggleFilter={() => setShowFilterDropdown(!showFilterDropdown)}
          searchableColumns={searchableColumns}
          onClearAllColumns={() =>
            setSearchableColumns({
              fullName: false,
              building: false,
              zone: false,
              lockNo: false,
              zone_type: false,
              ncr_check: false,
              ignore: false,
              remark: false,
            })

          }
          onToggleSearchableColumn={toggleSearchableColumn}
          onAddNew={handleAddNew}
          onEdit={handleEdit}
          onPrint={handlePrint}
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

      <AddLocationModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={() =>
          fetchLocations(currentPage, debouncedSearch, itemsPerPage, searchableColumns)
        }
      />

      <EditLocationModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        locationId={selectedLocationId!}
        onSuccess={() =>
          fetchLocations(currentPage, debouncedSearch, itemsPerPage, searchableColumns)
        }
      />

      <PrintStickerLocationModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        locationId={selectedLocationId}
      />

      {loading && (
        <div className="loading-overlay">
          <Loading />
        </div>
      )}
    </div>
  );
};

export default LocationContainer;
