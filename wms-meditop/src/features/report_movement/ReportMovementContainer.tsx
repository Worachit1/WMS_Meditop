import { useCallback, useEffect, useRef, useState } from "react";
import type { ReportMovementType } from "./types/report_movement.type";
import { reportMovementApi } from "./services/report_movement.api";
import {
  DEFAULT_PAGE_LIMIT,
  SHOW_LOADING_THRESHOLD,
  MIN_LOADING_TIME,
} from "../../utils/contants";
import Loading from "../../components/Loading/Loading";

import Pegination from "../../components/Pegination/Pegination";
import ReportMovementTable from "./components/ReportMovementTable";

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

type SortDir = "asc" | "desc";

type BackendSortKey =
  | "created_at"
  | "no"
  | "type"
  | "code"
  | "location"
  | "location_dest"
  | "user_ref"
  | "source";

const ReportMovementContainer = () => {
  const [report_movements, setReportMovements] = useState<ReportMovementType[]>(
    [],
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_PAGE_LIMIT);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [snapshotDate, setSnapshotDate] = useState<string>(getThailandToday());

  const [sortKey, setSortKey] = useState<BackendSortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [searchableColumns, setSearchableColumns] = useState({
    no: true,
    created_at: true,
    type: true,
    department: true,
    product: true,
    name: true,
    unit: true,
    lot_serial: true,
    exp: true,
    zone_type: true,
    location: true,
    location_dest: true,
  });

  const requestIdRef = useRef(0);

  const buildEnabledColumns = useCallback(
    (columns: typeof searchableColumns) =>
      Object.entries(columns)
        .filter(([, enabled]) => enabled)
        .map(([col]) => col)
        .join(","),
    [],
  );

  const fetchReportMovements = useCallback(
    async (
      page: number,
      search: string,
      limit: number,
      columns: typeof searchableColumns,
      _date: string,
      currentSortKey: BackendSortKey,
      currentSortDir: SortDir,
    ) => {
      const requestId = ++requestIdRef.current;
      const startTime = Date.now();

      const loadingTimeout = setTimeout(() => {
        if (requestId === requestIdRef.current) {
          setLoading(true);
        }
      }, SHOW_LOADING_THRESHOLD);

      try {
        const enabledColumns = buildEnabledColumns(columns);

        const response = await reportMovementApi.getReport({
          page,
          limit,
          search: search.trim() || undefined,
          columns: enabledColumns || undefined,
          sortBy: currentSortKey,
          sortDir: currentSortDir,
        });

        if (requestId !== requestIdRef.current) return;

        const { data = [], meta } = response.data;

        setReportMovements(data);
        setTotalPages(meta?.totalPages ?? 1);
        setTotalItems(meta?.total ?? 0);
      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        console.error("Error fetching report movements:", error);
      } finally {
        clearTimeout(loadingTimeout);

        if (requestId !== requestIdRef.current) return;

        const elapsedTime = Date.now() - startTime;
        if (elapsedTime < MIN_LOADING_TIME) {
          setTimeout(() => {
            if (requestId === requestIdRef.current) {
              setLoading(false);
            }
          }, MIN_LOADING_TIME - elapsedTime);
        } else {
          setLoading(false);
        }
      }
    },
    [buildEnabledColumns],
  );

  const handleExportAll = useCallback(async (): Promise<
    ReportMovementType[]
  > => {
    const enabledColumns = buildEnabledColumns(searchableColumns);

    const response = await reportMovementApi.getReport({
      page: 1,
      limit: 100000,
      search: debouncedSearch.trim() || undefined,
      columns: enabledColumns || undefined,
      sortBy: sortKey,
      sortDir,
    });

    const { data = [] } = response.data;
    return data;
  }, [
    buildEnabledColumns,
    debouncedSearch,
    searchableColumns,
    snapshotDate,
    sortKey,
    sortDir,
  ]);

  useEffect(() => {
    fetchReportMovements(
      currentPage,
      debouncedSearch,
      itemsPerPage,
      searchableColumns,
      snapshotDate,
      sortKey,
      sortDir,
    );
  }, [
    fetchReportMovements,
    currentPage,
    debouncedSearch,
    itemsPerPage,
    searchableColumns,
    snapshotDate,
    sortKey,
    sortDir,
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

  const handleSortChange = (key: BackendSortKey, dir: SortDir) => {
    setSortKey(key);
    setSortDir(dir);
    setCurrentPage(1);
  };

  return (
    <div className="location-page-container">
      <div>
        <ReportMovementTable
          report_movements={report_movements}
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
              no: false,
              created_at: false,
              type: false,
              department: false,
              product: false,
              name: false,
              unit: false,
              lot_serial: false,
              exp: false,
              zone_type: false,
              location: false,
              location_dest: false,
            })
          }
          onExportAll={handleExportAll}
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          sortKey={sortKey}
          sortDir={sortDir}
          onSortChange={handleSortChange}
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

export default ReportMovementContainer;