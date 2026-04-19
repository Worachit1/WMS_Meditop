import { useCallback, useEffect, useState } from "react";
import type { BarcodeType } from "./types/barcode.type";
import { barcodeApi } from "./services/barcode.api";
import {
  DEFAULT_PAGE_LIMIT,
  SHOW_LOADING_THRESHOLD,
  MIN_LOADING_TIME,
} from "../../utils/contants";

import { toast } from "react-toastify";
import Loading from "../../components/Loading/Loading";

import BarcodeTable from "./components/BarcodeTable";
import AddBarcodeModal from "./components/AddBarcodeModal";
import EditBarcodeModal from "./components/EditBarcodeModal";
import PrintBarcodeModal from "./components/PrintBarcodeModal";
import { successAlert, deleteAlert } from "../../utils/alert";
import Pegination from "../../components/Pegination/Pegination";

const BarcodeContainer = () => {
  const [barcodes, setBarcodes] = useState<BarcodeType[]>([]);
  const [selectedBarcodeId, setSelectedBarcodeId] = useState<number | null>(
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
  const [printBarcodeId, setPrintBarcodeId] = useState<number | null>(null);

  // filter and search state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [searchableColumns, setSearchableColumns] = useState({
    barcode_id: true,
    barcode: true,
    product_code: true,
    // lot_start: true,
    // lot_stop: true,
    // exp_start: true,
    // exp_stop: true,
    // barcode_length: true,
  });

  // submission state
  const [_isSubmitting, setIsSubmitting] = useState(false);

  const fetchBarcodes = useCallback(
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
          const response = await barcodeApi.getAllPaginated({
            page,
            limit,
            search: search.trim() || undefined,
          });
          const { data = [], meta } = response.data;
          setBarcodes(data);
          setTotalPages(meta.totalPages);
          setTotalItems(meta.total);
        } else {
          // ถ้ามี search query ให้ดึงข้อมูลทั้งหมดมากรองเอง
          const response = await barcodeApi.getAllPaginated({
            page: 1,
            limit: 10000, // ดึงเยอะๆ มาเพื่อกรอง
          });
          const { data = [] } = response.data;
         const filteredData = data.filter((stock) => {
        return Object.entries(columns).some(([key, isSearchable]) => {
          if (isSearchable) {
            const value = String((stock as any)[key] || "").toLowerCase();
            return value.includes(search.trim().toLowerCase());
          }
          return false;
        });
      });

          // จัดการ pagination ของข้อมูลที่กรองแล้ว
          const startIndex = (page - 1) * limit;
          const endIndex = startIndex + limit;
          const paginatedData = filteredData.slice(startIndex, endIndex);
          setBarcodes(paginatedData);
          setTotalPages(Math.ceil(filteredData.length / limit));
          setTotalItems(filteredData.length);
        }
      } catch (error) {
        console.error("Failed to fetch barcodes:", error);
        toast.error("Failed to fetch barcodes");
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
    }, 300); // 300ms debounce time
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch data when currentPage or debouncedSearch changes
  useEffect(() => {
    fetchBarcodes(currentPage, debouncedSearch, itemsPerPage, searchableColumns);
  }, [currentPage, debouncedSearch, itemsPerPage, fetchBarcodes, searchableColumns]);

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
    fetchBarcodes(currentPage, debouncedSearch, itemsPerPage, searchableColumns);
  };

  const handleEdit = (barcode: BarcodeType) => {
    setSelectedBarcodeId(barcode.id);
    setIsEditModalOpen(true);
  };

  const handlePrint = (barcode: BarcodeType) => {
    setPrintBarcodeId(barcode.id);
    setIsPrintModalOpen(true);
  };

  const handleDelete = (barcode: BarcodeType) => {
    // TODO: Implement delete barcode
    deleteAlert().then(async (result) => {
      if (result.isConfirmed) {
        try {
          await barcodeApi.remove(barcode.id);
          successAlert("Deleted!", "Barcode has been deleted.");
          fetchBarcodes(currentPage, debouncedSearch, itemsPerPage, searchableColumns);
        } catch (error) {
          console.error("Failed to delete barcode:", error);
          toast.error("Failed to delete barcode");
        }
      }
    });
  };

  const handleItemsPerPageChange = (limit: number) => {
    setItemsPerPage(limit);
    setCurrentPage(1);
  };

  return (
    <div className="barcode-page-container">
      <div>
        <BarcodeTable
          barcodes={barcodes}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          onClearSearch={() => setSearchQuery("")}
          showFilterDropdown={showFilterDropdown}
          onToggleFilter={() => setShowFilterDropdown(!showFilterDropdown)}
          searchableColumns={searchableColumns}
          onToggleSearchableColumn={toggleSearchableColumn}
          onClearAllColumns={() => setSearchableColumns({
            barcode_id: false,
            barcode: false,
            product_code: false,
            // lot_start: false,
            // lot_stop: false,
            // exp_start: false,
            // exp_stop: false,
            // barcode_length: false,
          })}
          onAddNew={handleAddNew}
          onEdit={handleEdit}
          onDelete={handleDelete}
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

      <AddBarcodeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={handleAddSuccess}
      />

      <EditBarcodeModal
        isOpen={isEditModalOpen}
        barcodeId={selectedBarcodeId!}
        onClose={() => setIsEditModalOpen(false)}
        onSuccess={handleAddSuccess}
      />

      <PrintBarcodeModal
        isOpen={isPrintModalOpen}
        barcodeId={printBarcodeId}
        onClose={() => setIsPrintModalOpen(false)}
      />

      {loading && (
        <div className="loading-overlay">
          <Loading />
        </div>
      )}
    </div>
  );
};

export default BarcodeContainer;
