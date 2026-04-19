import React, { useMemo, useState } from "react";
import type { TransferType } from "../types/tranfers.type";
import { useNavigate } from "react-router-dom";

import Table from "../../../components/Table/Table";
import "../../../components/Button/button.css";
import "../../../components/Table/table.css";
import "../../../styles/component.css";
import { formatDateTime } from "../../../components/Datetime/FormatDateTime";

import "./transfersmovement.css";

type Props = {
  transfers: TransferType[];

  searchQuery: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearSearch: () => void;

  showFilterDropdown: boolean;
  onToggleFilter: () => void;

  searchableColumns: {
    no: boolean;
    department: boolean;
    date: boolean;
    status: boolean;
    user_ref: boolean;
  };
  onToggleSearchableColumn: (column: keyof Props["searchableColumns"]) => void;
  onClearAllColumns: () => void;

  currentPage?: number;
  itemsPerPage?: number;
};

type TabKey = "pick" | "put" | "completed";

const asText = (v: any) => {
  if (v === null || v === undefined) return "-";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    return String(v);

  if (typeof v === "object") {
    if (typeof v.short_name === "string" && v.short_name.trim())
      return v.short_name;
    if (typeof v.full_name === "string" && v.full_name.trim())
      return v.full_name;
    if (typeof v.name === "string" && v.name.trim()) return v.name;
    if (typeof v.no === "string" && v.no.trim()) return v.no;
  }

  return "-";
};

const renderDepartments = (t: any) => {
  const deps = Array.isArray(t?.departments) ? t.departments : [];

  if (deps.length > 0) {
    return deps.map((d: any, i: number) => (
      <React.Fragment key={d.id ?? i}>
        {d.short_name}
        {i < deps.length - 1 && <br />}
      </React.Fragment>
    ));
  }

  return String(t?.department?.short_name ?? "").trim() || "-";
};

const renderUsers_Work = (t: any) => {
  const users = Array.isArray(t?.user_works) ? t.user_works : [];

  if (users.length > 0) {
    return users.map((u: any, i: number) => {
      const first = String(u?.first_name ?? "").trim();
      const last = String(u?.last_name ?? "").trim();
      const full = [first, last].filter(Boolean).join(" ") || "-";

      return (
        <React.Fragment key={u.id ?? u.user_id ?? i}>
          {full}
          {i < users.length - 1 && <br />}
        </React.Fragment>
      );
    });
  }

  const first = String(t?.user_work?.first_name ?? "").trim();
  const last = String(t?.user_work?.last_name ?? "").trim();
  const full = [first, last].filter(Boolean).join(" ").trim();

  if (full) return full;

  return t?.user_work_id ? `User #${t.user_work_id}` : "-";
}

// const getItems = (t: any) => (Array.isArray(t?.items) ? t.items : []);

// const getUserRefFromTransferItems = (t: any): string => {
//   const status = String(t?.status ?? "").toLowerCase();

//   // ✅ completed: ใช้ user_work object (ตามของเดิมคุณ)
//   if (status === "completed") {
//     const u = t?.user_work;
//     if (!u) return "-";

//     const first = String(u?.first_name ?? "").trim();
//     const last = String(u?.last_name ?? "").trim();
//     const full = [first, last].filter(Boolean).join(" ");
//     return full || "-";
//   }

//   // ✅ flow เดิม: ดึง user_work จาก items
//   const items = getItems(t) ?? [];
//   const refs: string[] = items
//     .map((x: any) => String(x?.user_work ?? "").trim())
//     .filter(Boolean);

//   if (refs.length === 0) return "-";
//   const unique = Array.from(new Set(refs));
//   return unique.length === 1 ? unique[0] : "-";
// };

const getCurrentUser = () => {
  const rawId = String(localStorage.getItem("id") ?? "").trim();
  const id = Number(rawId);
  const level = String(localStorage.getItem("user_level") ?? "")
    .trim()
    .toLowerCase();

  return {
    id: Number.isFinite(id) ? id : 0,
    level,
    isOperator: level === "operator",
    rawId,
  };
};

const canEditTransfer = (t: any, currentUserId: number) => {
  const ownerId = Number(t?.user?.id ?? t?.user_id ?? 0) || 0;
  return ownerId > 0 && ownerId === currentUserId;
};

const isVisibleToOperator = (t: any, currentUserId: number) => {
  // ✅ ของใหม่: หลาย user works
  const users = Array.isArray(t?.user_works) ? t.user_works : [];
  const inUserWorks = users.some((u: any) => {
    const id = Number(u?.id ?? u?.user_id ?? 0) || 0;
    return id > 0 && id === currentUserId;
  });

  if (inUserWorks) return true;

  // ✅ compat: ของเดิม object เดียว
  const singleWorkId = Number(t?.user_work?.id ?? 0) || 0;
  if (singleWorkId > 0 && singleWorkId === currentUserId) return true;

  // ✅ compat: field เดิมตรงๆ
  const userWorkId = Number(t?.user_work_id ?? 0) || 0;
  if (userWorkId > 0 && userWorkId === currentUserId) return true;

  return false;
};

const getStatus = (t: any): TabKey => {
  const s = String(t?.status ?? "")
    .trim()
    .toLowerCase();
  if (s === "pick") return "pick";
  if (s === "put") return "put";
  return "completed";
};

const TransferMovementTable = ({
  transfers,
  searchQuery,
  onSearchChange,
  onClearSearch,
  showFilterDropdown,
  onToggleFilter,
  searchableColumns,
  onToggleSearchableColumn,
  onClearAllColumns,
  currentPage = 1,
  itemsPerPage = 10,
}: Props) => {
  const navigate = useNavigate();
  const { id: currentUserId, isOperator } = useMemo(() => getCurrentUser(), []);

  // ✅ 3 tabs
  const [activeTab, setActiveTab] = useState<TabKey>("pick");
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([
    "all",
  ]);
  const [showDeptDropdown, setShowDeptDropdown] = useState(false);

  const toggleDepartment = (dept: string) => {
    if (dept === "all") {
      setSelectedDepartments(["all"]);
      return;
    }

    setSelectedDepartments((prev) => {
      const withoutAll = prev.filter((d) => d !== "all");
      if (withoutAll.includes(dept)) {
        const next = withoutAll.filter((d) => d !== dept);
        return next.length === 0 ? ["all"] : next;
      }
      return [...withoutAll, dept];
    });
  };

  // ✅ operator เห็นเฉพาะงานตัวเอง (เหมือนเดิม)
  const baseRows = useMemo(() => {
    const list = Array.isArray(transfers) ? transfers : [];
    if (!isOperator) return list;
    return list.filter((t: any) => isVisibleToOperator(t, currentUserId));
  }, [transfers, isOperator, currentUserId]);

  // ✅ แยกตาม tab (status)
  const tabRows = useMemo(() => {
    return baseRows.filter((t: any) => getStatus(t) === activeTab);
  }, [baseRows, activeTab]);

  const counts = useMemo(() => {
    const c = { pick: 0, put: 0, completed: 0 };
    for (const t of baseRows) c[getStatus(t)]++;
    return c;
  }, [baseRows]);

  const departmentOptions = useMemo(() => {
    const depts = new Set<string>();
    baseRows.forEach((t: any) => {
      const deps = Array.isArray(t?.departments) ? t.departments : [];
      if (deps.length > 0) {
        deps.forEach((d: any) => {
          const name = String(d?.short_name ?? d?.full_name ?? "").trim();
          if (name) depts.add(name);
        });
      } else {
        const name = String(t?.department?.short_name ?? t?.department ?? "").trim();
        if (name) depts.add(name);
      }
    });
    return Array.from(depts).sort();
  }, [baseRows]);

  const filteredTabRows = useMemo(() => {
    if (
      selectedDepartments.length === 0 ||
      selectedDepartments.includes("all")
    ) {
      return tabRows;
    }

    return tabRows.filter((t: any) => {
      const deps = Array.isArray(t?.departments) ? t.departments : [];
      if (deps.length > 0) {
        return deps.some((d: any) => {
          const name = String(d?.short_name ?? d?.full_name ?? "").trim();
          return selectedDepartments.includes(name);
        });
      }

      const singleDept = String(
        t?.department?.short_name ?? t?.department ?? "",
      ).trim();
      return singleDept ? selectedDepartments.includes(singleDept) : false;
    });
  }, [tabRows, selectedDepartments]);

  const tableHeaders = useMemo(() => {
    const base = [
      "No",
      "Date/Time",
      "Movement No.",
      "Department",
      "Status",
      "เจ้าหน้าที่ปฏิบัติงาน",
      "Action",
    ];
    if (!isOperator) base.push("Edit");
    return base;
  }, [isOperator]);

  const openDetail = (t: TransferType) => {
    const no = String((t as any)?.no ?? "").trim();
    if (!no) return;
    navigate(`/detail-transfer-movement/${encodeURIComponent(no)}`);
  };

  const openEdit = (t: TransferType) => {
    const no = String((t as any)?.no ?? "").trim();
    if (!no) return;
    navigate(`/edit-transfer-movement/${encodeURIComponent(no)}`);
  };

  const tabLabel = (k: TabKey) => {
    if (k === "pick") return "รายการรอ Pick";
    if (k === "put") return "รายการรอ Put";
    return "ดำเนินการเสร็จสิ้น";
  };

  return (
    <>
      <div className="page-header">
        <div className="page-title">Transfer - <span className="transfer-movement-title">Movement</span></div>

        <div className="toolbar">
          {departmentOptions.length > 1 && (
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
                  <i className="fa fa-chevron-down" style={{ marginLeft: 6 }} />
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
                            selectedDepartments.includes(dept)
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
            <button
              className="filter-btn"
              onClick={onToggleFilter}
              type="button"
            >
              <i className="fa fa-filter" /> Filter
            </button>

            {showFilterDropdown && (
              <div className="filter-dropdown">
                <div className="filter-title">
                  Search In Columns
                  <button
                    type="button"
                    className="filter-clear-btn"
                    onClick={onClearAllColumns}
                  >
                    <i className="fa fa-xmark"></i>
                  </button>
                </div>

                {Object.entries({
                  date: "Date/Time",
                  no: "Doc No.",
                  department: "Department",
                  status: "Status",
                  user_ref: "User",
                }).map(([key, label]) => (
                  <label className="filter-option" key={key}>
                    <input
                      type="checkbox"
                      checked={
                        searchableColumns[key as keyof typeof searchableColumns]
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

          {!isOperator && (
            <button
              className="transfer-movement-create-btn"
              onClick={() => navigate("/add-transfer-movement")}
              type="button"
            >
              Create
            </button>
          )}
        </div>
      </div>

      {/* ✅ 3 Tabs */}
      <div className="dt-tf-mv-tabs" style={{ marginTop: 10 }}>
        {(["pick", "put", "completed"] as TabKey[]).map((k) => (
          <button
            key={k}
            type="button"
            className={`dt-tf-mv-tab ${activeTab === k ? "active" : ""}`}
            onClick={() => setActiveTab(k)}
            title={tabLabel(k)}
          >
            {tabLabel(k)} <span className="dt-tf-mv-badge">{counts[k]}</span>
          </button>
        ))}
      </div>

      <br />
      <div className="table__wrapper">
        <Table headers={tableHeaders}>
          {filteredTabRows.length === 0 ? (
            <tr>
              <td colSpan={tableHeaders.length} className="no-data">
                No transfers found.
              </td>
            </tr>
          ) : (
            filteredTabRows.map((t: any, index) => {
              const canEdit = canEditTransfer(t, currentUserId);

              return (
                <tr key={t.id ?? `${t.no}-${index}`}>
                  <td>{(currentPage - 1) * itemsPerPage + index + 1}</td>
                  <td>{t?.created_at ? formatDateTime(t.created_at) : "-"}</td>
                  <td>{t?.no ?? "-"}</td>
                  <td>
                    {renderDepartments(t)}
                  </td>
                  <td>{asText(t?.status)}</td>
                  <td>{renderUsers_Work(t)}</td>
                  <td>
                    <button
                      className="transfer-movement-details-btn"
                      onClick={() => openDetail(t)}
                      type="button"
                    >
                      Details
                    </button>
                  </td>

                  {!isOperator && (
                    <td>
                      <button
                        className={`transfer-movement-edit-btn ${!canEdit ? "disabled" : ""}`}
                        onClick={() => canEdit && openEdit(t)}
                        type="button"
                        disabled={!canEdit}
                        title={canEdit ? "Edit" : "คุณไม่ใช่ผู้สร้างเอกสารนี้"}
                      >
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              );
            })
          )}
        </Table>
      </div>
    </>
  );
};

export default TransferMovementTable;
