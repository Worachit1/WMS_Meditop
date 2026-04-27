import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { PackedItem, PackProductListRow } from "./types/outbound.type";
import { outboundApi, batchApi, packProductApi } from "./services/outbound.api";
import { formatDateTime } from "../../components/Datetime/FormatDateTime";
import {
  DEFAULT_PAGE_LIMIT,
  SHOW_LOADING_THRESHOLD,
  MIN_LOADING_TIME,
} from "../../utils/contants";
import Loading from "../../components/Loading/Loading";
import Pegination from "../../components/Pegination/Pegination";
import OutboundTable, {
  type PickingBatchRow,
} from "./components/OutboundTable";

import type { OutboundView } from "./types/outbound.type";

type OutboundDocRow = {
  no: string;
  date: string;
  department?: string;
  invoice?: string;
  origin?: string;
};

const normalizeView = (v: string | null): OutboundView => {
  if (v === "doc" || v === "picking" || v === "packing") return v;
  return "doc";
};

const OutboundContainer = () => {
  const [docs, setDocs] = useState<OutboundDocRow[]>([]);
  const [outbound, setOutbound] = useState<PackedItem[]>([]);
  const [packProducts, setPackProducts] = useState<PackProductListRow[]>([]);
  const [pickingBatches, setPickingBatches] = useState<PickingBatchRow[]>([]);

  const [loading, setLoading] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_PAGE_LIMIT);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  const [searchableDocColumns, setSearchableDocColumns] = useState({
    no: true,
    date: true,
    department: true,
    invoice: true,
    origin: true,
  });

  const [searchableColumns, setSearchableColumns] = useState({
    date: true,
    code: true,
    batch_no: true,
    box: true,
    qty_required: true,
    pick: true,
    pack: true,
    out_type: true,
    user_pick: true,
    user_pack: true,
  });

  const [searchableBatchColumns, setSearchableBatchColumns] = useState({
    created_at: true,
    name: true,
    status: true,
    user_pick: true,
  });

  const [searchParams, setSearchParams] = useSearchParams();

  const [pickingPackTab, setPickingPackTab] = useState<"not_packed" | "packed">(
    "not_packed",
  );

  const [pickingStatusCounts, setPickingStatusCounts] = useState({
    process: 0,
    completed: 0,
  });

  const [packingTab, setPackingTab] = useState<"process" | "completed">(
    "process",
  );

  const [packStatusCounts, setPackStatusCounts] = useState({
    process: 0,
    completed: 0,
  });

  const handleChangePackingTab = (tab: "process" | "completed") => {
    setPackingTab(tab);
    setCurrentPage(1);
  };

  const urlView = useMemo(
    () => normalizeView(searchParams.get("view")),
    [searchParams],
  );

  const [view, setView] = useState<OutboundView>(urlView);

  useEffect(() => {
    setView(urlView);
  }, [urlView]);

  const filterByView = useCallback((rows: PackedItem[], v: OutboundView) => {
    return rows.filter((r) => {
      const pick = Number(r.pick ?? 0);
      const pack = Number(r.pack ?? 0);

      if (v === "doc") return true;
      if (v === "picking") return pick !== 0 && pack === 0;
      return pack !== 0;
    });
  }, []);

  const extractList = (response: any): any[] => {
    const payload = response?.data;

    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.data?.data)) return payload.data.data;
    if (Array.isArray(payload?.rows)) return payload.rows;

    return [];
  };

  const fetchOutbound = useCallback(
    async (
      page: number,
      search: string,
      limit: number,
      v: OutboundView,
      columnsItems: typeof searchableColumns,
      columnsDocs: typeof searchableDocColumns,
      columnsBatches: typeof searchableBatchColumns,
    ) => {
      const startTime = Date.now();
      const loadingTimeout = setTimeout(
        () => setLoading(true),
        SHOW_LOADING_THRESHOLD,
      );

      try {
        const q = (search ?? "").trim().toLowerCase();
        const hasSearch = q.length > 0;

        if (v === "picking") {
          const status = pickingPackTab === "packed" ? "completed" : "process";

          const resp = await batchApi.getBatchByUserPick({
            page,
            limit,
            search: search.trim() || undefined,
            status,
          });

          const payload = resp?.data ?? {};
          const meta = payload?.meta ?? {};
          const total = Number(meta?.total ?? payload?.total ?? 0);

          const rows: PickingBatchRow[] = Array.isArray(payload?.data)
            ? payload.data
            : [];

          setPickingStatusCounts({
            process: Number(meta?.statusCounts?.process ?? 0),
            completed: Number(meta?.statusCounts?.completed ?? 0),
          });
          if (!hasSearch && Number.isFinite(total) && total >= 0) {
            setTotalItems(total);
            setTotalPages(Math.max(1, Math.ceil(total / limit)));
            setPickingBatches(rows);
          } else {
            let filteredRows = rows;

            if (q) {
              filteredRows = rows.filter((r) =>
                Object.entries(columnsBatches).some(([key, ok]) => {
                  if (!ok) return false;
                  let value: string;
                  if (key === "created_at") {
                    value = formatDateTime(
                      String((r as any)[key] ?? ""),
                    ).toLowerCase();
                  } else {
                    value = String((r as any)[key] ?? "").toLowerCase();
                  }
                  return value.includes(q);
                }),
              );
            }

            setTotalItems(filteredRows.length);
            setTotalPages(Math.max(1, Math.ceil(filteredRows.length / limit)));
            setPickingBatches(filteredRows);
          }

          setPackProducts([]);
          setDocs([]);
          setOutbound([]);
          return;
        }

        if (v === "doc") {
          const resp: any = await outboundApi.getOutboundBatch({
            page,
            limit,
            search: search.trim() || undefined,
          });

          const list = Array.isArray(resp?.data?.data)
            ? resp.data.data
            : Array.isArray(resp?.data)
              ? resp.data
              : [];

          let docRows: OutboundDocRow[] = list.map((ob: any) => ({
            no: String(ob?.no ?? ""),
            date: String(ob?.date ?? ob?.created_at ?? ob?.updated_at ?? ""),
            department:
              String(
                ob?.department ??
                  ob?.department?.code ??
                  ob?.department?.short_name ??
                  ob?.department?.name ??
                  ob?.department_name ??
                  ob?.dept_code ??
                  "",
              ).trim() || undefined,
            invoice: ob?.invoice ?? undefined,
            origin: ob?.origin ?? undefined,
          }));

          if (!hasSearch) {
            const qLocal = (search ?? "").trim().toLowerCase();
            if (qLocal) {
              docRows = docRows.filter((r) =>
                Object.entries(columnsDocs).some(([key, ok]) => {
                  if (!ok) return false;
                  const value = String((r as any)[key] ?? "").toLowerCase();
                  return value.includes(qLocal);
                }),
              );
            }
          }

          const meta = resp?.data?.meta ?? resp?.data?.data?.meta ?? null;
          const serverTotal = Number(
            meta?.total ?? meta?.totalItems ?? meta?.count ?? NaN,
          );

          if (Number.isFinite(serverTotal)) {
            setTotalItems(serverTotal);
            setTotalPages(Math.max(1, Math.ceil(serverTotal / limit)));
            setDocs(docRows);
          } else {
            setTotalItems(docRows.length);
            setTotalPages(Math.max(1, Math.ceil(docRows.length / limit)));
            const start = (page - 1) * limit;
            setDocs(docRows.slice(start, start + limit));
          }

          setOutbound([]);
          setPickingBatches([]);
          setPackProducts([]);
          return;
        }

        if (v === "packing") {
          const status = packingTab === "completed" ? "completed" : "process";

          const resp = await packProductApi.getAll({
            page,
            limit,
            search: search.trim() || undefined,
            status,
          });

          const payload = resp?.data ?? {};
          const meta = payload?.meta ?? {};
          const total = Number(meta?.total ?? 0);

          const rows: PackProductListRow[] = Array.isArray(payload?.data)
            ? payload.data
            : [];

          setPackStatusCounts({
            process: Number(meta?.statusCounts?.process ?? 0),
            completed: Number(meta?.statusCounts?.completed ?? 0),
          });

          if (!hasSearch && Number.isFinite(total) && total >= 0) {
            setTotalItems(total);
            setTotalPages(Math.max(1, Math.ceil(total / limit)));
            setPackProducts(rows);
          } else {
            let filteredRows = rows;

            if (q) {
              filteredRows = rows.filter((r) =>
                Object.entries(columnsBatches).some(([key, ok]) => {
                  if (!ok) return false;

                  let value: string;
                  if (key === "created_at") {
                    value = formatDateTime(
                      String((r as any)[key] ?? ""),
                    ).toLowerCase();
                  } else {
                    value = String((r as any)[key] ?? "").toLowerCase();
                  }

                  return value.includes(q);
                }),
              );
            }

            setTotalItems(filteredRows.length);
            setTotalPages(Math.max(1, Math.ceil(filteredRows.length / limit)));
            setPackProducts(filteredRows);
          }

          setDocs([]);
          setOutbound([]);
          setPickingBatches([]);
          return;
        }

        const response: any = await outboundApi.getOutbound({
          page,
          limit,
          search: search.trim() || undefined,
        });

        const list = extractList(response);

        const flattened: PackedItem[] = list.flatMap((ob: any) =>
          (ob.items ?? []).map((item: any) => {
            const boxText =
              Array.isArray(item.boxes) && item.boxes.length > 0
                ? item.boxes
                    .map((b: any) => `${b.box_code ?? b.box_name ?? "-"}`)
                    .join(", ")
                : "";

            return {
              outbound_no: ob.no,
              date: ob.date,
              out_type: ob.out_type,
              invoice: ob.invoice ?? undefined,
              origin: ob.origin ?? undefined,
              item_id: item.id,
              code: item.code,
              qty_required: item.qty ?? 0,
              pick: item.pick ?? 0,
              pack: item.pack ?? 0,
              user_pack: item.user_pack ?? "",
              user_pick: item.user_pick ?? "",
              status: item.status ?? "",
              box: boxText,
              boxes: item.boxes ?? [],
            } as PackedItem;
          }),
        );

        let rows = filterByView(flattened, v);

        if (q) {
          rows = rows.filter((r) =>
            Object.entries(columnsItems).some(([key, ok]) => {
              if (!ok) return false;
              const value = String((r as any)[key] ?? "").toLowerCase();
              return value.includes(q);
            }),
          );
        }

        setTotalItems(rows.length);
        setTotalPages(Math.max(1, Math.ceil(rows.length / limit)));

        const start = (page - 1) * limit;
        setOutbound(rows.slice(start, start + limit));

        setDocs([]);
        setPickingBatches([]);
        setPackProducts([]);
      } catch (error) {
        console.error("Error fetching outbound:", error);
      } finally {
        clearTimeout(loadingTimeout);
        const elapsed = Date.now() - startTime;
        if (elapsed < MIN_LOADING_TIME) {
          setTimeout(() => setLoading(false), MIN_LOADING_TIME - elapsed);
        } else {
          setLoading(false);
        }
      }
    },
    [filterByView, pickingPackTab, packingTab],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      const normalized = searchQuery.replace(/\r?\n/g, ", ");
      setDebouncedSearch(normalized);
      setCurrentPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    fetchOutbound(
      currentPage,
      debouncedSearch,
      itemsPerPage,
      view,
      searchableColumns,
      searchableDocColumns,
      searchableBatchColumns,
    );
  }, [
    fetchOutbound,
    currentPage,
    debouncedSearch,
    itemsPerPage,
    view,
    searchableColumns,
    searchableDocColumns,
    searchableBatchColumns,
    pickingPackTab,
    packingTab,
  ]);

  const handleItemsPerPageChange = (limit: number) => {
    setItemsPerPage(limit);
    setCurrentPage(1);
  };

  const handleChangeView = (v: OutboundView) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("view", v);
      return p;
    });
    setCurrentPage(1);
  };

  const handleChangePickingTab = (tab: "not_packed" | "packed") => {
    setPickingPackTab(tab);
    setCurrentPage(1);
  };

  return (
    <div className="location-page-container">
      <div>
        <OutboundTable
          docs={docs}
          outbound={outbound}
          packProducts={packProducts}
          pickingBatches={pickingBatches}
          searchQuery={searchQuery}
          onSearchChange={(e) => setSearchQuery(e.target.value)}
          onClearSearch={() => setSearchQuery("")}
          showFilterDropdown={showFilterDropdown}
          onToggleFilter={() => setShowFilterDropdown((prev) => !prev)}
          searchableColumns={searchableColumns}
          onClearAllColumns={() =>
            setSearchableColumns({
              date: false,
              code: false,
              box: false,
              batch_no: false,
              qty_required: false,
              pick: false,
              pack: false,
              out_type: false,
              user_pick: false,
              user_pack: false,
            })
          }
          onClearAllDocColumns={() =>
            setSearchableDocColumns({
              no: false,
              date: false,
              department: false,
              invoice: false,
              origin: false,
            })
          }
          onClearAllBatchColumns={() =>
            setSearchableBatchColumns({
              created_at: false,
              name: false,
              status: false,
              user_pick: false,
            })
          }
          onToggleSearchableColumn={(column) =>
            setSearchableColumns((prev) => ({
              ...prev,
              [column]: !prev[column],
            }))
          }
          searchableDocColumns={searchableDocColumns}
          onToggleSearchableDocColumn={(column) =>
            setSearchableDocColumns((prev) => ({
              ...prev,
              [column]: !prev[column],
            }))
          }
          searchableBatchColumns={searchableBatchColumns}
          onToggleSearchableBatchColumn={(column) =>
            setSearchableBatchColumns((prev) => ({
              ...prev,
              [column]: !prev[column],
            }))
          }
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          view={view}
          onChangeView={handleChangeView}
          pickingPackTab={pickingPackTab}
          onChangePickingTab={handleChangePickingTab}
          pickingStatusCounts={pickingStatusCounts}
          packingTab={packingTab}
          onChangePackingTab={handleChangePackingTab}
          packingStatusCounts={packStatusCounts}
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

export default OutboundContainer;
