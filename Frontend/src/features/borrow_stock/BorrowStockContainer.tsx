import { useCallback, useEffect, useState } from "react";
import type { BorrowStockType } from "./types/borrow_stock.type";
import { borrowStockApi } from "./services/borrow_stock.api";
import {
  DEFAULT_PAGE_LIMIT,
  SHOW_LOADING_THRESHOLD,
  MIN_LOADING_TIME,
} from "../../utils/contants";
import Loading from "../../components/Loading/Loading";

import Pegination from "../../components/Pegination/Pegination";
import BorrowStockTable from "./components/BorrowStockTable";

const BorrowStockContainer = () => {
  const [borrow_stocks, setBorrowStocks] = useState<BorrowStockType[]>([]);
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
    date: true,
    location_name: true,
    department: true,
    status: true,
    user_ref: true,
  });

  const [statusTab, setStatusTab] = useState<"pending" | "completed">(
    "pending",
  );

  const [statusCounts, setStatusCounts] = useState({
    pending: 0,
    completed: 0,
  });

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
        // ส่ง search และ columns ไปให้ backend จัดการ
        const enabledColumns = Object.entries(columns)
          .filter(([, enabled]) => enabled)
          .map(([col]) => col)
          .join(",");

        // ถ้ามี search แต่ไม่มี columns ที่เปิด → ไม่ต้อง fetch ให้ผลว่าง
        if (search.trim() && !enabledColumns) {
          setBorrowStocks([]);
          setTotalPages(1);
          setTotalItems(0);
          return;
        }

        const resp = await borrowStockApi.getAllPaginated({
          page,
          limit,
          search: search.trim() || undefined,
          columns: enabledColumns || undefined,
          status: statusTab,
        });

        const { data = [], meta } = resp.data;

        setBorrowStocks(data);
        setTotalItems(Number(meta?.total ?? 0));
        setTotalPages(Number(meta?.totalPages ?? 1));

        setStatusCounts({
          pending: Number(meta?.statusCounts?.pending ?? 0),
          completed: Number(meta?.statusCounts?.completed ?? 0),
        });
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
    [statusTab],
  );

  useEffect(() => {
    fetchStocks(currentPage, debouncedSearch, itemsPerPage, searchableColumns);
  }, [
    fetchStocks,
    currentPage,
    debouncedSearch,
    itemsPerPage,
    searchableColumns,
    statusTab,
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

  return (
    <div className="location-page-container">
      <div>
        <BorrowStockTable
          borrow_stocks={borrow_stocks}
          searchQuery={searchQuery}
          onSearchChange={(e) => setSearchQuery(e.target.value)}
          onClearSearch={() => setSearchQuery("")}
          showFilterDropdown={showFilterDropdown}
          onToggleFilter={() => setShowFilterDropdown((prev) => !prev)}
          searchableColumns={searchableColumns}
          onClearAllColumns={() =>
            setSearchableColumns({
              date: false,
              location_name: false,
              department: false,
              status: false,
              user_ref: false,
            })
          }
          onToggleSearchableColumn={(column) =>
            setSearchableColumns((prev) => ({
              ...prev,
              [column]: !prev[column],
            }))
          }
          onRefresh={() =>
            fetchStocks(
              currentPage,
              debouncedSearch,
              itemsPerPage,
              searchableColumns,
            )
          } // ✅ เพิ่ม
          statusTab={statusTab}
          onChangeStatusTab={(tab) => {
            setStatusTab(tab);
            setCurrentPage(1);
          }}
          statusCounts={statusCounts}
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

export default BorrowStockContainer;
