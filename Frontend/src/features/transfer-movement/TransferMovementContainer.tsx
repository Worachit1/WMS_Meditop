import { useCallback, useEffect, useState } from "react";
import type { TransferType } from "./types/tranfers.type";
import { transferApi } from "./services/transfer.api";
import {
  DEFAULT_PAGE_LIMIT,
  SHOW_LOADING_THRESHOLD,
  MIN_LOADING_TIME,
} from "../../utils/contants";
import Loading from "../../components/Loading/Loading";

import TransferMovementTable from "./components/TransferMovementTable";
import Pegination from "../../components/Pegination/Pegination";

const TransferMovementContainer = () => {
  const [transfers, setTransfers] = useState<TransferType[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState(1);

  // filter and search state (เหมือน stock)
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_PAGE_LIMIT);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [searchableColumns, setSearchableColumns] = useState({
    no: true,
    department: true,
    date: true,
    status: true,
    user_ref: true,
  });

  const [statusTab, setStatusTab] = useState<"pick" | "put" | "completed">(
    "pick",
  );

  const [statusCounts, setStatusCounts] = useState({
    pick: 0,
    put: 0,
    completed: 0,
  });

  const fetchTransfers = useCallback(
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
        const enabledColumns = Object.entries(columns)
          .filter(([, enabled]) => enabled)
          .map(([col]) => col)
          .join(",");

        const response = await transferApi.getMovementPaginated({
          page,
          limit,
          search: search.trim() || undefined,
          columns: enabledColumns || undefined,
          status: statusTab,
        });

        const { data = [], meta } = response.data as any;

        setTransfers(Array.isArray(data) ? data : []);
        setTotalPages(Number(meta?.totalPages ?? 1));
        setTotalItems(Number(meta?.total ?? 0));

        setStatusCounts({
          pick: Number(meta?.statusCounts?.pick ?? 0),
          put: Number(meta?.statusCounts?.put ?? 0),
          completed: Number(meta?.statusCounts?.completed ?? 0),
        });
      } catch (error) {
        console.error("Error fetching transfers:", error);
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
    fetchTransfers(
      currentPage,
      debouncedSearch,
      itemsPerPage,
      searchableColumns,
    );
  }, [
    fetchTransfers,
    currentPage,
    debouncedSearch,
    itemsPerPage,
    searchableColumns,
    statusTab,
  ]);

  // debounce search
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
        <TransferMovementTable
          transfers={transfers}
          searchQuery={searchQuery}
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
              department: false,
              date: false,
              status: false,
              user_ref: false,
            })
          }
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          statusTab={statusTab}
          statusCounts={statusCounts}
          onChangeStatusTab={(tab) => {
            setStatusTab(tab);
            setCurrentPage(1);
          }}
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

export default TransferMovementContainer;
