import { useCallback, useEffect, useState } from "react";
import type { InboundType } from "./types/inbound.type";
import { inboundApi } from "./services/inbound.api";
import {
  DEFAULT_PAGE_LIMIT,
  SHOW_LOADING_THRESHOLD,
  MIN_LOADING_TIME,
} from "../../utils/contants";
import Loading from "../../components/Loading/Loading";

import Pegination from "../../components/Pegination/Pegination";
import InboundTable from "./components/InboundTable";

const InboundContainer = () => {
  const [inbound, setInbound] = useState<InboundType[]>([]);
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
    no: true,
    invoice : true,
    date: true,
    department: true,
    code: true,
    reference: true,
    origin: true,
    status: true,
  });

  const fetchInbound = useCallback(
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
        const response = await inboundApi.getAllPaginated({
          page,
          limit,
          search: search.trim() || undefined, // ✅ ส่งไป backend
        });

        const { data = [], meta } = response.data;
        setInbound(data);
        setTotalPages(meta.totalPages);
        setTotalItems(meta.total);
      } catch (error) {
        console.error("Error fetching inbound:", error);
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
    fetchInbound(currentPage, debouncedSearch, itemsPerPage, searchableColumns);
  }, [
    fetchInbound,
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

  return (
    <div className="location-page-container">
      <div>
        <InboundTable
          inbound={inbound}
          searchQuery={searchQuery}
          onSearchChange={(e) => setSearchQuery(e.target.value)}
          onClearSearch={() => setSearchQuery("")}
          showFilterDropdown={showFilterDropdown}
          onToggleFilter={() => setShowFilterDropdown((prev) => !prev)}
          searchableColumns={searchableColumns}
          onClearAllColumns={() =>
            setSearchableColumns({
              no: false,
              invoice: false,
              date: false,
              department: false,
              code: false,
              reference: false,
              origin: false,
              status: false,
            })
          }
          onToggleSearchableColumn={(column) =>
            setSearchableColumns((prev) => ({
              ...prev,
              [column]: !prev[column],
            }))
          }
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

export default InboundContainer;
