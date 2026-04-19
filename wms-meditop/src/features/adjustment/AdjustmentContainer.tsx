// src/modules/adjustment/AdjustmentContainer.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AdjustmentType,
  AdjustmentMeta,
} from "./types/adjustment.type";
import { adjustmentApi } from "./services/adjustment.api";
import {
  DEFAULT_PAGE_LIMIT,
  SHOW_LOADING_THRESHOLD,
  MIN_LOADING_TIME,
} from "../../utils/contants";
import Loading from "../../components/Loading/Loading";

import AdjustmentTable from "./components/AdjustmentTable";
import Pegination from "../../components/Pegination/Pegination";

const ALL_COLUMNS = [
  "date",
  "no",
  "location",
  "reference",
  "type",
  "status",
] as const;

type ColumnKey = (typeof ALL_COLUMNS)[number];

const AdjustmentContainer = () => {
  const [adjustments, setAdjustments] = useState<AdjustmentType[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_PAGE_LIMIT);

  const [meta, setMeta] = useState<AdjustmentMeta>({
    page: 1,
    limit: DEFAULT_PAGE_LIMIT,
    total: 0,
    totalPages: 1,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  const [searchableColumns, setSearchableColumns] = useState<
    Record<ColumnKey, boolean>
  >({
    date: true,
    no: true,
    location: true,
    reference: true,
    type: true,
    status: true,
  });

  const enabledColumns = useMemo(() => {
    return Object.entries(searchableColumns)
      .filter(([, v]) => v)
      .map(([k]) => k as ColumnKey);
  }, [searchableColumns]);

  const reqIdRef = useRef(0);

  const fetchAdjustments = useCallback(
    async (page: number, limit: number, search: string, columns: string[]) => {
      const myReqId = ++reqIdRef.current;

      const startTime = Date.now();
      const loadingTimeout = setTimeout(() => {
        if (myReqId === reqIdRef.current) setLoading(true);
      }, SHOW_LOADING_THRESHOLD);

      try {
        const resp = await adjustmentApi.getAllPaginated({
          page,
          limit,
          search: search.trim() || undefined,
          columns: columns.length ? columns : undefined,
        });

        if (myReqId !== reqIdRef.current) return;

        const rows = resp?.data?.data ?? [];
        const nextMeta = resp?.data?.meta ?? {
          page,
          limit,
          total: 0,
          totalPages: 1,
        };

        setAdjustments(rows);
        setMeta(nextMeta);
      } catch (error) {
        if (myReqId !== reqIdRef.current) return;
        console.error("Error fetching adjustments:", error);

        setAdjustments([]);
        setMeta({
          page,
          limit,
          total: 0,
          totalPages: 1,
        });
      } finally {
        clearTimeout(loadingTimeout);

        if (myReqId !== reqIdRef.current) return;

        const elapsedTime = Date.now() - startTime;
        if (elapsedTime < MIN_LOADING_TIME) {
          setTimeout(() => {
            if (myReqId === reqIdRef.current) setLoading(false);
          }, MIN_LOADING_TIME - elapsedTime);
        } else {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [itemsPerPage, enabledColumns]);

  useEffect(() => {
    fetchAdjustments(currentPage, itemsPerPage, debouncedSearch, enabledColumns);
  }, [fetchAdjustments, currentPage, itemsPerPage, debouncedSearch, enabledColumns]);

  const handleItemsPerPageChange = (limit: number) => {
    setItemsPerPage(limit);
    setCurrentPage(1);
  };

  return (
    <div className="location-page-container">
      <div>
        <AdjustmentTable
          adjustments={adjustments}
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
              date: false,
              no: false,
              location: false,
              reference: false,
              type: false,
              status: false,
            })
          }
          currentPage={meta.page}
          itemsPerPage={meta.limit}
          onRefresh={() =>
            fetchAdjustments(currentPage, itemsPerPage, debouncedSearch, enabledColumns)
          }
        />

        <Pegination
          currentPage={meta.page}
          totalPages={meta.totalPages}
          totalItems={meta.total}
          itemsPerPage={meta.limit}
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

export default AdjustmentContainer;