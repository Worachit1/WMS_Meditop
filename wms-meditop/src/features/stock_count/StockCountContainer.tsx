import { useCallback, useEffect, useState } from "react";
import type { StockCountType } from "./types/stock_count.type";
import { stock_countApi } from "./services/stock_count.api";
import {
  DEFAULT_PAGE_LIMIT,
  SHOW_LOADING_THRESHOLD,
  MIN_LOADING_TIME,
} from "../../utils/contants";
import { confirmAlert, successAlert } from "../../utils/alert";
import Loading from "../../components/Loading/Loading";

import Pegination from "../../components/Pegination/Pegination";
import StockCountTable from "./components/StockCountTable";
import EditOverwriteModal from "./components/EditOverwriteModal";
import { toast } from "react-toastify";

const StockCountContainer = () => {
  const [stock_counts, setStockCounts] = useState<StockCountType[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [userLevel, setUserLevel] = useState<string>("");

  //filter and search state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_PAGE_LIMIT);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [searchableColumns, setSearchableColumns] = useState({
    id: true,
    sku: true,
    name: true,
    lot: true,
    exp_date: true,
    lock_no: true,
    quantity: true,
    count: true,
  });

  const [isOverwriteModalOpen, setIsOverwriteModalOpen] = useState(false);
  const [selectedStockCountId, setSelectedStockCountId] = useState<
    string | null
  >(null);

  // Get user level from localStorage
  useEffect(() => {
    const userStr = localStorage.getItem("user");
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserLevel(user.user_level || "");
      } catch (error) {
        console.error("Failed to parse user from localStorage:", error);
      }
    }
  }, []);

  const fetchStocks = useCallback(
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
        if (!search.trim()) {
          const response = await stock_countApi.getAllPaginated({
            page,
            limit,
            search: search.trim() || undefined,
          });
          const { data = [], meta } = response.data;
          setStockCounts(data);
          setTotalPages(meta.totalPages);
          setTotalItems(meta.total);
        } else {
          // ถ้ามี search query ให้ดึงข้อมูลทั้งหมดมากรองเอง
          const response = await stock_countApi.getAllPaginated({
            page: 1,
            limit: 10000, // ดึงเยอะๆ มาเพื่อกรอง
          });
          const { data = [] } = response.data;
          // กรองข้อมูลตาม searchableColumns
          const filteredData = data.filter((stockCount) => {
            return Object.entries(columns).some(([column, isSearchable]) => {
              if (!isSearchable) return false;
              const value = String(
                (stockCount as any)[column] || "",
              ).toLowerCase();
              return value.includes(search.trim().toLowerCase());
            });
          });
          setStockCounts(filteredData);
          setTotalPages(Math.ceil(filteredData.length / limit));
          setTotalItems(filteredData.length);
        }
      } catch (error) {
        console.error("Error fetching stocks:", error);
      } finally {
        clearTimeout(loadingTimeout);
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime < MIN_LOADING_TIME) {
          setTimeout(() => setLoading(false), MIN_LOADING_TIME - elapsedTime);
        } else {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    fetchStocks(currentPage, debouncedSearch, itemsPerPage, searchableColumns);
  }, [
    fetchStocks,
    currentPage,
    debouncedSearch,
    itemsPerPage,
    searchableColumns,
  ]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleItemsPerPageChange = (limit: number) => {
    setItemsPerPage(limit);
    setCurrentPage(1);
  };

  const handleOverwrite = (stockCountId: string) => {
    setSelectedStockCountId(stockCountId);
    setIsOverwriteModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsOverwriteModalOpen(false);
    setSelectedStockCountId(null);
  };

  const handleStartCount = async () => {
    const result = await confirmAlert("คุณต้องการเพิ่ม Start Count ?");
    if (!result.isConfirmed) {
      return;
    }

    try {
      setLoading(true);
      // Call API to start count with initial count value
      await stock_countApi.startCount({ count: 0 });
      successAlert("Stock count started successfully!");
      // Refresh the data
      fetchStocks(
        currentPage,
        debouncedSearch,
        itemsPerPage,
        searchableColumns,
      );
    } catch (error) {
      console.error("Error starting count:", error);
      toast.error("Failed to start stock count.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="location-page-container">
      <div>
        <StockCountTable
          stock_counts={stock_counts}
          searchQuery={searchQuery}
          onSearchChange={(e) => setSearchQuery(e.target.value)}
          onClearSearch={() => setSearchQuery("")}
          showFilterDropdown={showFilterDropdown}
          onToggleFilter={() => setShowFilterDropdown((prev) => !prev)}
          searchableColumns={searchableColumns}
          onClearAllColumns={() => 
            setSearchableColumns({
              lock_no: false,
              id: false,
              sku: false,
              name: false,
              lot: false,
              exp_date: false,
              quantity: false,
              count: false,
            })
          }
          onToggleSearchableColumn={(column) =>
            setSearchableColumns((prev) => ({
              ...prev,
              [column]: !prev[column],
            }))
          }
          onOverwrite={handleOverwrite}
          onStartCount={handleStartCount}
          userLevel={userLevel}
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
      
      <EditOverwriteModal
        isOpen={isOverwriteModalOpen}
        onClose={handleCloseModal}
        onSuccess={() => {
          fetchStocks(
            currentPage,
            debouncedSearch,
            itemsPerPage,
            searchableColumns,
          );
          handleCloseModal();
        }}
        stockCountId={selectedStockCountId}
      />
      {loading && (
        <div className="loading-overlay">
          <Loading />
        </div>
      )}
    </div>
  );
};

export default StockCountContainer;
