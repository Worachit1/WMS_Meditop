import { useCallback, useEffect, useState } from "react";
import type { ReportStockType } from "./types/report_stock.type";
import { reportStockApi } from "./services/report_stock.api";
import {
  DEFAULT_PAGE_LIMIT,
  SHOW_LOADING_THRESHOLD,
  MIN_LOADING_TIME,
} from "../../utils/contants";
import Loading from "../../components/Loading/Loading";

import ReportStockTable from "./components/ReportStockTable";
import Pegination from "../../components/Pegination/Pegination";

type StockType = "default" | "bor" | "ser";

const getThailandToday = () => {
  const now = new Date();
  const thai = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }),
  );

  const year = thai.getFullYear();
  const month = String(thai.getMonth() + 1).padStart(2, "0");
  const day = String(thai.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const ReportStockContainer = () => {
  const [report_stocks, setReportStocks] = useState<ReportStockType[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_PAGE_LIMIT);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [snapshotDate, setSnapshotDate] = useState<string>(getThailandToday());
  const [stockType, setStockType] = useState<StockType>("default");

  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [searchableColumns, setSearchableColumns] = useState({
    snapshot_date: true,
    product_code: true,
    product_name: true,
    unit: true,
    location_name: true,
    building: true,
    zone: true,
    zone_type: true,
    lot_name: true,
    expiration_date: true,
    quantity: true,
  });

  const buildEnabledColumns = useCallback(
    (columns: typeof searchableColumns) =>
      Object.entries(columns)
        .filter(([, enabled]) => enabled)
        .map(([col]) => col)
        .join(","),
    [],
  );

  const fetchReportStocks = useCallback(
    async (
      page: number,
      search: string,
      limit: number,
      columns: typeof searchableColumns,
      selectedSnapshotDate: string,
      type: StockType,
    ) => {
      const startTime = Date.now();
      const loadingTimeout = setTimeout(() => {
        setLoading(true);
      }, SHOW_LOADING_THRESHOLD);

      try {
        const enabledColumns = buildEnabledColumns(columns);

        const baseParams = {
          page,
          limit,
          search: search.trim() || undefined,
          columns: enabledColumns || undefined,
          snapshot_date: selectedSnapshotDate || undefined,
        };

        const response =
          type === "bor"
            ? await reportStockApi.getReportBor(baseParams)
            : type === "ser"
              ? await reportStockApi.getReportSer(baseParams)
              : await reportStockApi.getReport(baseParams);

        const { data = [], meta } = response.data;
        setReportStocks(data);
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
    },
    [buildEnabledColumns],
  );

  // ✅ export all ของวันนั้น + ตาม search/filter ปัจจุบัน
  const handleExportAll = useCallback(async (): Promise<ReportStockType[]> => {
    const enabledColumns = buildEnabledColumns(searchableColumns);

    const response = await reportStockApi.getReport({
      page: 1,
      limit: 100000, // ✅ ดึงทั้งหมดของวันนั้น
      search: debouncedSearch.trim() || undefined,
      columns: enabledColumns || undefined,
      snapshot_date: snapshotDate || undefined,
    });

    const { data = [] } = response.data;
    return data;
  }, [buildEnabledColumns, debouncedSearch, searchableColumns, snapshotDate]);

  useEffect(() => {
    fetchReportStocks(
      currentPage,
      debouncedSearch,
      itemsPerPage,
      searchableColumns,
      snapshotDate,
      stockType,
    );
  }, [
    fetchReportStocks,
    currentPage,
    debouncedSearch,
    itemsPerPage,
    searchableColumns,
    snapshotDate,
    stockType,
  ]);

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

  const handleSnapshotDateChange = (value: string) => {
    setSnapshotDate(value);
    setCurrentPage(1);
  };

  const handleResetSnapshotDate = () => {
    setSnapshotDate(getThailandToday());
    setCurrentPage(1);
  };

  const handleStockTypeChange = (type: StockType) => {
    setStockType(type);
    setCurrentPage(1);
  };

  return (
    <div className="location-page-container">
      <div>
        <ReportStockTable
          report_stocks={report_stocks}
          searchQuery={searchQuery}
          onSearchChange={(e) => setSearchQuery(e.target.value)}
          onClearSearch={() => setSearchQuery("")}
          snapshotDate={snapshotDate}
          onSnapshotDateChange={handleSnapshotDateChange}
          onResetSnapshotDate={handleResetSnapshotDate}
          showFilterDropdown={showFilterDropdown}
          onToggleFilter={() => setShowFilterDropdown((prev) => !prev)}
          searchableColumns={searchableColumns}
          onToggleSearchableColumn={(column) =>
            setSearchableColumns((prev) => ({
              ...prev,
              [column]: !prev[column],
            }))
          }
          onClearAllColumns={() =>
            setSearchableColumns({
              snapshot_date: false,
              product_code: false,
              product_name: false,
              unit: false,
              location_name: false,
              building: false,
              zone: false,
              zone_type: false,
              lot_name: false,
              expiration_date: false,
              quantity: false,
            })
          }
          onExportAll={handleExportAll}
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          stockType={stockType}
          onStockTypeChange={handleStockTypeChange}
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

export default ReportStockContainer;