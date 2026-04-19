import { useCallback, useEffect, useState } from "react";
import type { StockType } from "./types/stock.type";
import { stockApi } from "./services/stock.api";
import {
  DEFAULT_PAGE_LIMIT,
  SHOW_LOADING_THRESHOLD,
  MIN_LOADING_TIME,
} from "../../utils/contants";
import Loading from "../../components/Loading/Loading";

import StockTable from "./components/StockTable";
import Pegination from "../../components/Pegination/Pegination";
import BarcodeStockModal from "./components/barcodestock/BarcodeStockModal";

const StockContainer = () => {
  const [stocks, setStocks] = useState<StockType[]>([]);
  const [selectedStockId, setSelectedStockId] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState(1);

  //filter and search state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_PAGE_LIMIT);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [searchableColumns, setSearchableColumns] = useState({
    product_id: true,
    product_code: true,
    product_name: true,
    lot_name: true,
    expiration_date: true,
    location_name: true,
    quantity: true,
    active: true,
  });

  const fetchStocks = useCallback(async (page: number, search: string, limit: number, columns: typeof searchableColumns) => {
    const startTime = Date.now();
    const loadingTimeout = setTimeout(() => {
      setLoading(true);
    }, SHOW_LOADING_THRESHOLD);

    try {
      // ส่ง search และ columns ไปให้ backend จัดการ
      const enabledColumns = Object.entries(columns)
        .filter(([, enabled]) => enabled)
        .map(([col]) => col)
        .join(',');

      const response = await stockApi.getAllPaginated({
        page,
        limit,
        search: search.trim() || undefined,
        columns: enabledColumns || undefined,
      });
      const { data = [], meta } = response.data;
      setStocks(data);
      setTotalPages(meta.totalPages);
      setTotalItems(meta.total);
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
  }, []);

  useEffect(() => {
    fetchStocks(currentPage, debouncedSearch, itemsPerPage, searchableColumns);
  }, [fetchStocks, currentPage, debouncedSearch, itemsPerPage, searchableColumns]);

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

  const handlePrint = (stock: StockType) => {
    setSelectedStockId(stock.id);
  };

  return (
    <div className="location-page-container">
      <div>
        <StockTable
          stocks={stocks}
          searchQuery={searchQuery}
          onSearchChange={(e) => setSearchQuery(e.target.value)}
          onClearSearch={() => setSearchQuery("")}
          showFilterDropdown={showFilterDropdown}
          onToggleFilter={() => setShowFilterDropdown((prev) => !prev)}
          searchableColumns={searchableColumns}
          onClearAllColumns={() => 
            setSearchableColumns({
            product_id: false,
            product_code: false,
            product_name: false,
            lot_name: false,
            expiration_date: false,
            location_name: false,
            quantity: false,
            active: false,
          })}
          onToggleSearchableColumn={(column) =>
            setSearchableColumns((prev) => ({ ...prev, [column]: !prev[column] }))
          }
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

      <BarcodeStockModal
        isOpen={selectedStockId !== null}
        onClose={() => setSelectedStockId(null)}
        stockItem={stocks.find((stock) => stock.id === selectedStockId) || null}
        onSuccess={() => {}}
      />
      {loading && (
        <div className="loading-overlay">
          <Loading />
        </div>
      )}
    </div>
  );
};

export default StockContainer;
