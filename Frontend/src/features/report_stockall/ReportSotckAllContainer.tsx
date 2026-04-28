import { useCallback, useEffect, useRef, useState } from "react";
import type { ReportStockAllType } from "./types/reposrt_stockall.type";
import { reportStockAllApi } from "./services/report_stockall.api";
import {
  DEFAULT_PAGE_LIMIT,
  SHOW_LOADING_THRESHOLD,
  MIN_LOADING_TIME,
} from "../../utils/contants";
import Loading from "../../components/Loading/Loading";

import Pegination from "../../components/Pegination/Pegination";
import ReportStockAllTable from "./components/ReportStockAllTable";


type StockType = "default" | "bor" | "ser";
type SortDir = "asc" | "desc";
type SortKey = "product_code" | "lot_name" | "location_name" | "quantity";

const ReportStockAllContainer = () => {
  const [reportStockAll, setReportStockAll] = useState<ReportStockAllType[]>([]);
  const [stockType, setStockType] = useState<StockType>("default");

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

  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const requestIdRef = useRef(0);

  const fetchStocks = useCallback(async (
    page: number,
    search: string,
    limit: number,
    columns: typeof searchableColumns,
    type: StockType,
    currentSortKey: SortKey | null,
    currentSortDir: SortDir,
  ) => {
    const requestId = ++requestIdRef.current;
    const startTime = Date.now();
    const loadingTimeout = setTimeout(() => {
      if (requestId === requestIdRef.current) setLoading(true);
    }, SHOW_LOADING_THRESHOLD);

    try {
      const enabledColumns = Object.entries(columns)
        .filter(([, enabled]) => enabled)
        .map(([col]) => col)
        .join(',');

      const params = {
        page,
        limit,
        search: search.trim() || undefined,
        columns: enabledColumns || undefined,
        sortBy: currentSortKey ?? undefined,
        sortDir: currentSortKey ? currentSortDir : undefined,
      };

      const apiFn =
        type === "bor"
          ? reportStockAllApi.getAllBorPaginated
          : type === "ser"
            ? reportStockAllApi.getAllSerPaginated
            : reportStockAllApi.getAllPaginated;

      const response = await apiFn(params);

      if (requestId !== requestIdRef.current) return;

      const { data = [], meta } = response.data;
      setReportStockAll(data);
      setTotalPages(meta.totalPages);
      setTotalItems(meta.total);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      console.error("Error fetching stocks:", error);
    } finally {
      clearTimeout(loadingTimeout);
      if (requestId !== requestIdRef.current) return;
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime < MIN_LOADING_TIME) {
        setTimeout(() => {
          if (requestId === requestIdRef.current) setLoading(false);
        }, MIN_LOADING_TIME - elapsedTime);
      } else {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchStocks(currentPage, debouncedSearch, itemsPerPage, searchableColumns, stockType, sortKey, sortDir);
  }, [fetchStocks, currentPage, debouncedSearch, itemsPerPage, searchableColumns, stockType, sortKey, sortDir]);

  const handleStockTypeChange = (type: StockType) => {
    setStockType(type);
    setCurrentPage(1);
  };

  const handleSortChange = (key: SortKey | null, dir: SortDir) => {
    setSortKey(key);
    setSortDir(dir);
    setCurrentPage(1);
  };

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


  return (
    <div className="location-page-container">
      <div>
        <ReportStockAllTable
          stocks={reportStockAll}
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
            })
          }
          onToggleSearchableColumn={(column) =>
            setSearchableColumns((prev) => ({ ...prev, [column]: !prev[column] }))
          }
          stockType={stockType}
          onStockTypeChange={handleStockTypeChange}
          sortKey={sortKey}
          sortDir={sortDir}
          onSortChange={handleSortChange}
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

      {loading && (
        <div className="loading-overlay">
          <Loading />
        </div>
      )}
    </div>
  );
};

export default ReportStockAllContainer;
