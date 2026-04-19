import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GoodType } from "./types/good.type";
import { goodApi } from "./services/good.api";
import {
  DEFAULT_PAGE_LIMIT,
  SHOW_LOADING_THRESHOLD,
  MIN_LOADING_TIME,
} from "../../utils/contants";
import Loading from "../../components/Loading/Loading";

import GoodTable from "./components/GoodTable";
import Pegination from "../../components/Pegination/Pegination";

const ALL_COLUMNS = [
  "product_id",
  "product_code",
  "product_name",
  "lot_name",
  "expiration_date",
  "expiration_date_end",
  "department_code",
  "zone_type",
  "unit",
  "input_number",
] as const;

type ColumnKey = (typeof ALL_COLUMNS)[number];

const GoodContainer = () => {
  const [goods, setGoods] = useState<GoodType[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_PAGE_LIMIT);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  const [searchableColumns, setSearchableColumns] = useState<Record<ColumnKey, boolean>>({
    product_id: true,
    product_code: true,
    product_name: true,
    lot_name: true,
    expiration_date: true,
    expiration_date_end: true,
    department_code: true,
    zone_type: true,
    unit: true,
    input_number: true,
  });

  // ✅ columns ที่เปิดใช้งาน
  const enabledColumns = useMemo(() => {
    return Object.entries(searchableColumns)
      .filter(([, v]) => v)
      .map(([k]) => k as ColumnKey);
  }, [searchableColumns]);

  const columnsParam = useMemo(() => enabledColumns.join(","), [enabledColumns]);

  // ✅ กัน race condition
  const reqIdRef = useRef(0);

  const fetchGoods = useCallback(
    async (page: number, search: string, limit: number, columns: string) => {
      const myReqId = ++reqIdRef.current;

      const startTime = Date.now();
      const loadingTimeout = setTimeout(() => {
        if (myReqId === reqIdRef.current) setLoading(true);
      }, SHOW_LOADING_THRESHOLD);

      try {
        // ✅ ส่งทุกอย่างไปให้ backend จัดการ
        const response: any = await goodApi.getAll({
          page,
          limit,
          search: search.trim() || undefined, // ส่ง search query
          columns, // ส่ง columns ที่เลือก
        });

        if (myReqId !== reqIdRef.current) return;

        const { data = [], meta } = response.data;
        setGoods(data);
        setTotalPages(meta.totalPages);
        setTotalItems(meta.total);
        
      } catch (error) {
        if (myReqId !== reqIdRef.current) return;
        console.error("Error fetching goods:", error);
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
    [searchableColumns]
  );

  

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ✅ เปลี่ยน columns -> กลับหน้า 1
  useEffect(() => {
    setCurrentPage(1);
  }, [columnsParam]);

  useEffect(() => {
    fetchGoods(currentPage, debouncedSearch, itemsPerPage, columnsParam);
  }, [fetchGoods, currentPage, debouncedSearch, itemsPerPage, columnsParam]);

  const toggleSearchableColumn = (column: ColumnKey) => {
    setSearchableColumns((prev) => ({ ...prev, [column]: !prev[column] }));
  };

  const handleItemsPerPageChange = (limit: number) => {
    setItemsPerPage(limit);
    setCurrentPage(1);
  };

  const handleRefreshData = () => {
    fetchGoods(currentPage, debouncedSearch, itemsPerPage, columnsParam);
  };

  return (
    <div className="location-page-container">
      <div>
        <GoodTable
          goods={goods}
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
              expiration_date_end: false,
              department_code: false,
              zone_type: false,
              unit: false,
              input_number: false,
            })
          }
          onToggleSearchableColumn={toggleSearchableColumn}
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          onRefresh={handleRefreshData}
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

export default GoodContainer;
