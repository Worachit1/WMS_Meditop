import { useCallback, useEffect, useState } from "react";
import type { BorType } from "./types/bor.type";
import { borApi } from "./services/bor.api";
import {
  DEFAULT_PAGE_LIMIT,
  SHOW_LOADING_THRESHOLD,
  MIN_LOADING_TIME,
} from "../../utils/contants";
import Loading from "../../components/Loading/Loading";

import BorTable from "./components/BorTable";
import Pegination from "../../components/Pegination/Pegination";

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

const BorContainer = () => {
  const [bors, setBors] = useState<BorType[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_PAGE_LIMIT);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [snapshotDate, _setSnapshotDate] = useState<string>(getThailandToday());

  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [searchableColumns, setSearchableColumns] = useState({
    no: true,
    created_at: true,
    location_name: true,
    location_dest_name: true,
    department: true,
  });

  const buildEnabledColumns = useCallback(
    (columns: typeof searchableColumns) =>
      Object.entries(columns)
        .filter(([, enabled]) => enabled)
        .map(([col]) => col)
        .join(","),
    [],
  );

  const fetchBors = useCallback(
    async (
      page: number,
      search: string,
      limit: number,
      _columns: typeof searchableColumns,
    ) => {
      const startTime = Date.now();
      const loadingTimeout = setTimeout(() => {
        setLoading(true);
      }, SHOW_LOADING_THRESHOLD);

      try {
        // const enabledColumns = buildEnabledColumns(columns);

        const response = await borApi.getPagination({
          page,
          limit,
          search: search.trim() || undefined,
        });

        const { data = [], meta } = response.data;
        setBors(data);
        setTotalPages(meta.totalPages);
        setTotalItems(meta.total);
      } catch (error) {
        console.error("Error fetching BORs:", error);
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
  const handleExportAll = useCallback(async (): Promise<BorType[]> => {
    // const enabledColumns = buildEnabledColumns(searchableColumns);

    const response = await borApi.getPagination({
      page: 1,
      limit: 100000, // ✅ ดึงทั้งหมดของวันนั้น
      search: debouncedSearch.trim() || undefined,
    });

    const { data = [] } = response.data;
    return data;
  }, [buildEnabledColumns, debouncedSearch, searchableColumns, snapshotDate]);

  useEffect(() => {
    fetchBors(
      currentPage,
      debouncedSearch,
      itemsPerPage,
      searchableColumns,
    );
  }, [
    fetchBors,
    currentPage,
    debouncedSearch,
    itemsPerPage,
    searchableColumns,
    snapshotDate,
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

  return (
    <div className="location-page-container">
      <div>
        <BorTable
          bors={bors}
          searchQuery={searchQuery}
          snapshotDate={snapshotDate}
          onSearchChange={(e) => setSearchQuery(e.target.value)}
          onClearSearch={() => setSearchQuery("")}
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
                no: false,
                created_at: false,
                location_name: false,
                location_dest_name: false,
                department: false,
            })
          }
          onExportAll={handleExportAll}
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

export default BorContainer;
