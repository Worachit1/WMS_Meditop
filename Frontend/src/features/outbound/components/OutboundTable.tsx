import type { PackedItem, PackProductListRow } from "../types/outbound.type";
import Table from "../../../components/Table/Table";
import "../../../components/Button/button.css";
import "../../../components/Table/table.css";
import "../../../styles/component.css";
import "../outbound.css";
import "./groporder/grouporder.css";

import { formatDateTime } from "../../../components/Datetime/FormatDateTime";
import type { OutboundView } from "../types/outbound.type";
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";

type OutboundDocRow = {
  no: string;
  date: string;
  department?: string;
  invoice?: string;
  origin?: string;
  code?: string;
};

export type PickingBatchRow = {
  name: string;
  status: string;
  created_at: string;
  total_outbounds: number;
  user_pick: string;
};

type PackingDocRow = {
  id: number;
  name: string;
  batch_name: string;
  max_box: number;
  status: string;
  remark?: string | null;
  created_at: string;
};

type Props = {
  docs: OutboundDocRow[];
  outbound: PackedItem[];
  packProducts: PackProductListRow[];
  pickingBatches: PickingBatchRow[];

  searchQuery: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearSearch: () => void;
  showFilterDropdown: boolean;
  onToggleFilter: () => void;

  searchableColumns: {
    date: boolean;
    code: boolean;
    box: boolean;
    batch_no: boolean;
    qty_required: boolean;
    pick: boolean;
    pack: boolean;
    out_type: boolean;
    user_pick?: boolean;
    user_pack?: boolean;
  };
  onToggleSearchableColumn: (column: keyof Props["searchableColumns"]) => void;
  onClearAllColumns: () => void;
  onClearAllDocColumns: () => void;
  onClearAllBatchColumns: () => void;

  searchableDocColumns: {
    no: boolean;
    date: boolean;
    department: boolean;
    invoice?: boolean;
    origin?: boolean;
  };
  onToggleSearchableDocColumn: (
    column: keyof Props["searchableDocColumns"],
  ) => void;

  searchableBatchColumns: {
    created_at: boolean;
    name: boolean;
    status: boolean;
    user_pick: boolean;
  };
  onToggleSearchableBatchColumn: (
    column: keyof Props["searchableBatchColumns"],
  ) => void;

  currentPage?: number;
  itemsPerPage?: number;

  view: OutboundView;
  onChangeView: (v: OutboundView) => void;

  pickingPackTab: "not_packed" | "packed";
  onChangePickingTab: (v: "not_packed" | "packed") => void;
  pickingStatusCounts: {
    process: number;
    completed: number;
  };

  packingTab: "process" | "completed";
  onChangePackingTab: (v: "process" | "completed") => void;
  packingStatusCounts: {
    process: number;
    completed: number;
  };
};

const OutboundTable = ({
  docs,
  outbound,
  packProducts,
  pickingBatches,
  searchQuery,
  onSearchChange,
  onClearSearch,
  showFilterDropdown,
  onToggleFilter,
  searchableColumns,
  onToggleSearchableColumn,
  searchableDocColumns,
  onToggleSearchableDocColumn,
  searchableBatchColumns,
  onToggleSearchableBatchColumn,
  onClearAllColumns,
  onClearAllDocColumns,
  onClearAllBatchColumns,
  currentPage = 1,
  itemsPerPage = 10,
  view,
  pickingPackTab,
  onChangePickingTab,
  pickingStatusCounts,
  packingTab,
  onChangePackingTab,
  packingStatusCounts,
}: Props) => {
  const isDoc = view === "doc";
  const isPicking = view === "picking";
  const isPacking = view === "packing";

  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([
    "all",
  ]);
  const [showDeptDropdown, setShowDeptDropdown] = useState(false);

  const toggleDepartment = (dept: string) => {
    if (dept === "all") {
      setSelectedDepartments(["all"]);
    } else {
      setSelectedDepartments((prev) => {
        const withoutAll = prev.filter((d) => d !== "all");
        if (withoutAll.includes(dept)) {
          const next = withoutAll.filter((d) => d !== dept);
          return next.length === 0 ? ["all"] : next;
        }
        return [...withoutAll, dept];
      });
    }
  };

  const departmentOptions = useMemo(() => {
    const depts = new Set<string>();
    (docs || []).forEach((x) => {
      if (x.department) depts.add(x.department);
    });
    return Array.from(depts).sort();
  }, [docs]);

  const filteredDocs = useMemo(() => {
    if (
      selectedDepartments.length === 0 ||
      selectedDepartments.includes("all") ||
      selectedDepartments.includes("CNE")
    ) {
      return docs || [];
    }
    return (docs || []).filter((x) =>
      selectedDepartments.includes(x.department ?? ""),
    );
  }, [docs, selectedDepartments]);

  const filteredPickingBatches = pickingBatches;

  const pickingNotPackedCount = Number(pickingStatusCounts?.process ?? 0);
  const pickingPackedCount = Number(pickingStatusCounts?.completed ?? 0);

  const getDocNo = (doc: any): string => {
    const value = doc?.no;
    if (value === null || value === undefined) return "-";
    if (typeof value === "string" && value.trim() === "") return "-";
    return String(value).trim();
  };

  const packingDocs = useMemo<PackingDocRow[]>(() => {
    return (packProducts || []).map((row) => ({
      id: row.id,
      name: row.name,
      max_box: row.max_box,
      batch_name: row.batch_name,
      status: String(row.status ?? "").toLowerCase(),
      remark: row.remark ?? "",
      created_at: row.created_at,
    }));
  }, [packProducts]);

  const filteredPackingDocs = useMemo(
    () =>
      packingDocs.filter((row) =>
        packingTab === "completed"
          ? String(row.status).toLowerCase() === "completed"
          : String(row.status).toLowerCase() === "process",
      ),
    [packingDocs, packingTab],
  );

  

  const docHeaders = [
    "No",
    "Date",
    "Doc No.",
    "Invoice",
    "Origin",
    "Department",
  ];

  const pickingHeaders = [
    "No",
    "Date",
    "Batch No.",
    "Status",
    "User Pick",
    "Action",
  ];

  const packingHeaders = [
    "No",
    "Date",
    "Name",
    "Batch No.",
    "Max Box",
    "Status",
    "Remark",
    "Action",
  ];

  const itemHeaders = [
    "No",
    "Date",
    "สินค้า (Item)",
    ...(isPacking ? ["Box"] : []),
    "QTY ที่ต้องส่ง",
    "QTY ที่หยิบ (Pick)",
    ...(isPacking ? ["QTY จริง (Packed)"] : []),
    "Out-Type",
    "User Pick",
    ...(isPacking ? ["User Pack"] : []),
    ...(isPacking ? ["Action"] : []),
  ];

  return (
    <>
      <div className="page-header">
        {isDoc && (
          <div className="page-title">
            Outbound - <span className="outbound-title"> Doc No.</span>
          </div>
        )}
        {isPicking && (
          <div className="page-title">
            Outbound - <span className="outbound-title"> Picking</span>
          </div>
        )}
        {isPacking && (
          <div className="page-title">
            Outbound - <span className="outbound-title"> Packing</span>
          </div>
        )}

        {isPicking && (
          <Link to="/batch-inv" className="outbound-btn-replace">
            Picking
          </Link>
        )}
        {isPacking && (
          <Link to="/scan-box" className="outbound-btn-packing">
            Packing
          </Link>
        )}

        <div className="toolbar">
          {isDoc && departmentOptions.length > 1 && (
            <div className="inbound-dept-filter">
              <label>แผนก:</label>
              <div className="filter-wrap">
                <button
                  type="button"
                  className="inbound-dept-select"
                  onClick={() => setShowDeptDropdown((v) => !v)}
                >
                  {selectedDepartments.includes("all")
                    ? "ทั้งหมด"
                    : selectedDepartments.join(", ")}
                  <i
                    className="fa fa-chevron-down"
                    style={{ marginLeft: 45 }}
                  />
                </button>
                {showDeptDropdown && (
                  <div className="filter-dropdown-2">
                    <label className="filter-option">
                      <input
                        type="checkbox"
                        checked={selectedDepartments.includes("all")}
                        onChange={() => toggleDepartment("all")}
                      />
                      <span>ทั้งหมด</span>
                    </label>
                    {departmentOptions.map((dept) => (
                      <label className="filter-option" key={dept}>
                        <input
                          type="checkbox"
                          checked={
                            selectedDepartments.includes("all") ||
                            selectedDepartments.includes(dept) ||
                            selectedDepartments.includes("CNE")
                          }
                          onChange={() => toggleDepartment(dept)}
                        />
                        <span>{dept}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="search-box">
            <i className="fa fa-search search-icon" />
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={onSearchChange}
            />
            {searchQuery && (
              <button
                type="button"
                className="clear-btn"
                onClick={onClearSearch}
              >
                <i className="fa fa-xmark"></i>
              </button>
            )}
          </div>

          <div className="filter-wrap">
            <div className="outbound-filter-wrap">
              <button className="filter-btn" onClick={onToggleFilter}>
                <i className="fa fa-filter"></i> Filter
              </button>

              {showFilterDropdown && (
                <div className="filter-dropdown-2">
                  <div className="filter-title">
                    Search In Columns
                    <button
                      type="button"
                      className="filter-clear-btn"
                      onClick={
                        isDoc
                          ? onClearAllDocColumns
                          : isPicking
                            ? onClearAllBatchColumns
                            : onClearAllColumns
                      }
                    >
                      <i className="fa fa-xmark"></i>
                    </button>
                  </div>

                  {isDoc
                    ? Object.entries({
                        date: "Date",
                        no: "Doc No.",
                        department: "Department",
                        origin: "Origin",
                        invoice: "Invoice",
                      }).map(([key, label]) => (
                        <label className="filter-option" key={key}>
                          <input
                            type="checkbox"
                            checked={
                              searchableDocColumns[
                                key as keyof typeof searchableDocColumns
                              ]
                            }
                            onChange={() =>
                              onToggleSearchableDocColumn(
                                key as keyof typeof searchableDocColumns,
                              )
                            }
                          />
                          <span>{label}</span>
                        </label>
                      ))
                    : isPicking
                      ? Object.entries({
                          created_at: "Date",
                          name: "Batch No.",
                          status: "Status",
                          user_pick: "User Pick",
                        }).map(([key, label]) => (
                          <label className="filter-option" key={key}>
                            <input
                              type="checkbox"
                              checked={
                                searchableBatchColumns[
                                  key as keyof typeof searchableBatchColumns
                                ]
                              }
                              onChange={() =>
                                onToggleSearchableBatchColumn(
                                  key as keyof typeof searchableBatchColumns,
                                )
                              }
                            />
                            <span>{label}</span>
                          </label>
                        ))
                      : Object.entries(
                          isPacking
                            ? {
                                date: "Date",
                                code: "Name",
                                batch_no: "Batch No.",
                                box: "Max Box",
                                out_type: "Status",
                                user_pack: "Remark",
                              }
                            : {
                                date: "Date",
                                code: "Item",
                                box: "Box",
                                qty_required: "QTY ที่ต้องส่ง",
                                pick: "QTY ที่หยิบ (Pick)",
                                pack: "QTY จริง (Packed)",
                                out_type: "Out-Type",
                                user_pick: "User Pick",
                                user_pack: "User Pack",
                              },
                        ).map(([key, label]) => (
                          <label className="filter-option" key={key}>
                            <input
                              type="checkbox"
                              checked={
                                searchableColumns[
                                  key as keyof typeof searchableColumns
                                ]
                              }
                              onChange={() =>
                                onToggleSearchableColumn(
                                  key as keyof typeof searchableColumns,
                                )
                              }
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {isPicking && (
        <div className="groupOrder-view-tabs">
          <button
            type="button"
            className={`groupOrder-tab ${pickingPackTab === "not_packed" ? "active" : ""}`}
            onClick={() => onChangePickingTab("not_packed")}
          >
            กำลังดำเนินการ
            {pickingNotPackedCount > 0 && (
              <span className="badge">{pickingNotPackedCount}</span>
            )}
          </button>
          <button
            type="button"
            className={`groupOrder-tab ${pickingPackTab === "packed" ? "active" : ""}`}
            onClick={() => onChangePickingTab("packed")}
          >
            ดำเนินการเสร็จสิ้น
            {pickingPackedCount > 0 && (
              <span className="badge">{pickingPackedCount}</span>
            )}
          </button>
        </div>
      )}

      {isPacking && (
        <div className="groupOrder-view-tabs">
          <button
            type="button"
            className={`groupOrder-tab ${packingTab === "process" ? "active" : ""}`}
            onClick={() => onChangePackingTab("process")}
          >
            กำลังดำเนินการ
            {Number(packingStatusCounts?.process ?? 0) > 0 && (
              <span className="badge">
                {Number(packingStatusCounts?.process ?? 0)}
              </span>
            )}
          </button>

          <button
            type="button"
            className={`groupOrder-tab ${packingTab === "completed" ? "active" : ""}`}
            onClick={() => onChangePackingTab("completed")}
          >
            ดำเนินการเสร็จสิ้น
            {Number(packingStatusCounts?.completed ?? 0) > 0 && (
              <span className="badge">
                {Number(packingStatusCounts?.completed ?? 0)}
              </span>
            )}
          </button>
        </div>
      )}

      <br />

      <div className="table__wrapper">
        <Table
          headers={
            isDoc
              ? docHeaders
              : isPicking
                ? pickingHeaders
                : isPacking
                  ? packingHeaders
                  : itemHeaders
          }
        >
          {isDoc ? (
            filteredDocs.length === 0 ? (
              <tr>
                <td colSpan={docHeaders.length} className="no-data">
                  No outbound documents found.
                </td>
              </tr>
            ) : (
              filteredDocs.map((d, index) => (
                <tr key={d.no || index}>
                  <td>{(currentPage - 1) * itemsPerPage + index + 1}</td>
                  <td>{d.date ? formatDateTime(d.date) : "-"}</td>
                  <td>{getDocNo(d)}</td>
                  <td>{d.invoice || "-"}</td>
                  <td>{d.origin || "-"}</td>
                  <td>{d.department || "-"}</td>
                </tr>
              ))
            )
          ) : isPicking ? (
            filteredPickingBatches.length === 0 ? (
              <tr>
                <td colSpan={pickingHeaders.length} className="no-data">
                  No picking batches found.
                </td>
              </tr>
            ) : (
              filteredPickingBatches.map((b, index) => (
                <tr key={b.name || index}>
                  <td>{(currentPage - 1) * itemsPerPage + index + 1}</td>
                  <td>{formatDateTime(b.created_at)}</td>
                  <td>{b.name}</td>
                  <td>
                    {String(b.status).toLowerCase() === "process"
                      ? "IN PROCESS"
                      : String(b.status).toLowerCase() === "completed"
                        ? "COMPLETED"
                        : "-"}
                  </td>
                  <td>{b.user_pick || "-"}</td>
                  <td>
                    {String(b.status).toLowerCase() === "completed" ? (
                      <Link
                        to={`/group-order?batch=${encodeURIComponent(b.name)}&readonly=1`}
                        className="outbound-picking-completed"
                      >
                        Completed
                      </Link>
                    ) : (
                      <Link
                        to={`/group-order?batch=${encodeURIComponent(b.name)}`}
                        className="outbound-picking-draft"
                      >
                        Picking
                      </Link>
                    )}
                  </td>
                </tr>
              ))
            )
          ) : isPacking ? (
            filteredPackingDocs.length === 0 ? (
              <tr>
                <td colSpan={packingHeaders.length} className="no-data">
                  No packing records found.
                </td>
              </tr>
            ) : (
              filteredPackingDocs.map((row, index) => {
                const isCompleted =
                  String(row.status).toLowerCase() === "completed";

                return (
                  <tr key={row.id}>
                    <td>{(currentPage - 1) * itemsPerPage + index + 1}</td>
                    <td>
                      {row.created_at ? formatDateTime(row.created_at) : "-"}
                    </td>
                    <td>
                      {row.name
                        ? row.name
                            .split(",")
                            .map((text, i) => <div key={i}>{text.trim()}</div>)
                        : "-"}
                    </td>
                    <td>{row.batch_name || "-"}</td>
                    <td>{row.max_box ?? "-"}</td>
                    <td>{isCompleted ? "COMPLETED" : "IN PROCESS"}</td>
                    <td>{row.remark || "-"}</td>
                    <td>
                      {isCompleted ? (
                        <Link
                          to={`/scan-box?packId=${row.id}&readonly=1`}
                          state={{
                            view: "packing",
                            status: packingTab,
                            detailList: filteredPackingDocs.map((x) => ({
                              id: x.id,
                            })),
                            detailTotal:
                              packingTab === "completed"
                                ? Number(packingStatusCounts?.completed ?? 0)
                                : Number(packingStatusCounts?.process ?? 0),
                          }}
                          className="outbound-packing-btn outbound-packing-confirmed"
                        >
                          Completed
                        </Link>
                      ) : (
                        <Link
                          to={`/scan-box?packId=${row.id}`}
                          state={{
                            view: "packing",
                            status: packingTab,
                            detailList: filteredPackingDocs.map((x) => ({
                              id: x.id,
                            })),
                            detailTotal:
                              packingTab === "completed"
                                ? Number(packingStatusCounts?.completed ?? 0)
                                : Number(packingStatusCounts?.process ?? 0),
                          }}
                          className="outbound-packing-btn outbound-packing-draft"
                        >
                          Continue
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })
            )
          ) : outbound.length === 0 ? (
            <tr>
              <td colSpan={itemHeaders.length} className="no-data">
                No outbound records found.
              </td>
            </tr>
          ) : (
            outbound.map((outboundItem, index) => (
              <tr key={`${outboundItem.outbound_no}-${outboundItem.item_id}`}>
                <td>{(currentPage - 1) * itemsPerPage + index + 1}</td>
                <td>{formatDateTime(outboundItem.date)}</td>
                <td>{outboundItem.code}</td>
                <td>{outboundItem.qty_required}</td>
                <td>{outboundItem.pick}</td>
                <td>{outboundItem.out_type}</td>
                <td>{outboundItem.user_pick || "-"}</td>
              </tr>
            ))
          )}
        </Table>
      </div>
    </>
  );
};

export default OutboundTable;
