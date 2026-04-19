import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type {
  DetailReportMovementType,
  DetailMovementItemType,
} from "../types/report_movement.type";
import { reportMovementApi } from "../services/report_movement.api";
import Table from "../../../components/Table/Table";
import Loading from "../../../components/Loading/Loading";
import { formatDateTime } from "../../../components/Datetime/FormatDateTime";
import "../../../components/Table/table.css";
import "../../../styles/component.css";
import "./detail_report_movement.css";

type SortKey = "code" | "name" | null;
type SortDir = "asc" | "desc";

const DetailReportMovemnt = () => {
  const { source, id } = useParams<{ source: string; id: string }>();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<DetailReportMovementType | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    if (!source || !id) return;
    const fetch = async () => {
      setLoading(true);
      try {
        const res = await reportMovementApi.getDetail(source, id);
        setDetail((res.data as any)?.data ?? (res.data as any) ?? null);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [source, id]);

  const toggleSort = (key: Exclude<SortKey, null>) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return key;
      }
      setSortDir("asc");
      return key;
    });
  };

  const SortIcon = ({ active, dir }: { active: boolean; dir: SortDir }) => {
    if (!active)
      return <i className="fa-solid fa-sort" style={{ opacity: 0.35 }} />;
    return dir === "asc" ? (
      <i className="fa-solid fa-sort-up" />
    ) : (
      <i className="fa-solid fa-sort-down" />
    );
  };

  const items: DetailMovementItemType[] = detail?.items ?? [];

  const filtered = useMemo(() => {
    const s = searchFilter.trim().toLowerCase();
    if (!s) return items;
    return items.filter((it) => {
      const code = (it.code ?? "").toLowerCase();
      const name = (it.name ?? "").toLowerCase();
      const lot = (it.lot_serial ?? "").toLowerCase();
      return code.includes(s) || name.includes(s) || lot.includes(s);
    });
  }, [items, searchFilter]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const aVal = (sortKey === "code" ? a.code : a.name) ?? "";
      const bVal = (sortKey === "code" ? b.code : b.name) ?? "";
      const cmp = aVal
        .toString()
        .localeCompare(bVal.toString(), "th", {
          numeric: true,
          sensitivity: "base",
        });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const tableHeaders = [
    "No.",
    <button
      type="button"
      className="dt-rp-mv-sort-btn"
      onClick={() => toggleSort("code")}
      key="h-code"
    >
      สินค้า <SortIcon active={sortKey === "code"} dir={sortDir} />
    </button>,
    <button
      type="button"
      className="dt-rp-mv-sort-btn"
      onClick={() => toggleSort("name")}
      key="h-name"
    >
      ชื่อ <SortIcon active={sortKey === "name"} dir={sortDir} />
    </button>,
    "หน่วย",
    "QTY",
    "Lot. Serial",
    "Expire Date",
    "Zone Temp",
    "เวลาที่ดำเนินการ",
  ];

  if (loading) {
    return (
      <div className="dt-rp-mv-container">
        <Loading />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="dt-rp-mv-container">
        <div className="dt-rp-mv-no-data">ไม่พบข้อมูล</div>
      </div>
    );
  }

  return (
    <div className="dt-rp-mv-container">
      {/* Header */}
      <div className="dt-rp-mv-header">
        <h1 className="dt-rp-mv-title">{detail.no || "-"}</h1>
      </div>

      {/* Info Panel */}
      <div className="dt-rp-mv-info">
        <div className="dt-rp-mv-info-row">
          <div className="dt-rp-mv-info-item">
            <label>Transaction Type :</label>
            <span>{detail.out_type || "-"}</span>
          </div>
          <div className="dt-rp-mv-info-item">
            <label>Department :</label>
            <span>{detail.department || "-"}</span>
          </div>
          <div className="dt-rp-mv-info-item">
            <label>Date :</label>
            <span>
              {detail.created_at ? formatDateTime(detail.created_at) : "-"}
            </span>
          </div>
        </div>

        <div className="dt-rp-mv-info-row">
          <div className="dt-rp-mv-info-item">
            <label>From Location :</label>
            <span>{detail.location || "-"}</span>
          </div>
          <div className="dt-rp-mv-info-item">
            <label>To Location :</label>
            <span>{detail.location_dest || "-"}</span>
          </div>
          <div className="dt-rp-mv-info-item">
            <label>User :</label>
            <span>{detail.user_ref || "-"}</span>
          </div>
        </div>

        {(detail.origin || detail.reference) && (
          <div className="dt-rp-mv-info-row">
            {detail.origin && (
              <div className="dt-rp-mv-info-item">
                <label>Origin :</label>
                <span>{detail.origin}</span>
              </div>
            )}
            {detail.reference && (
              <div className="dt-rp-mv-info-item">
                <label>Reference :</label>
                <span>{detail.reference}</span>
              </div>
            )}
          </div>
        )}

        <hr className="dt-rp-mv-divider" />

        {/* Search */}
        <div className="dt-rp-mv-search-row">
          <label className="dt-rp-mv-search-label">Search</label>
          <div className="dt-rp-mv-search-input-wrap">
            <i className="fa-solid fa-magnifying-glass dt-rp-mv-search-icon" />
            <input
              type="text"
              className="dt-rp-mv-search-input"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filter Search"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="table__wrapper">
        <Table headers={tableHeaders as any}>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={tableHeaders.length} className="no-data">
                ไม่พบรายการสินค้า
              </td>
            </tr>
          ) : (
            sorted.map((item, index) => (
              <tr key={String(item.id) || index}>
                <td>{index + 1}</td>
                <td style={{ minWidth: 180 }}>{item.code || "--"}</td>
                <td style={{ minWidth: 200 }}>{item.name || "--"}</td>
                <td>{item.unit || "-"}</td>
                <td>{item.qty ?? "-"}</td>
                   <td>{item.lot_serial || "-"}</td>
                <td>
                  {item.exp ? (
                    formatDateTime(item.exp)
                  ) : (
                    <span style={{ color: "red", fontWeight: 500 }}>null</span>
                  )}
                </td>
                <td>
                  {item.zone_type ? (
                    item.zone_type
                  ) : (
                    <span style={{ color: "red", fontWeight: 500 }}>null</span>
                  )}
                </td>
                <td>
                  {item.updated_at ? formatDateTime(item.updated_at) : "-"}
                </td>
              </tr>
            ))
          )}
        </Table>
      </div>

      {/* Footer */}
      <div className="dt-rp-mv-footer">
        <button className="dt-rp-mv-btn-back" onClick={() => navigate(-1)}>
          กลับ
        </button>
      </div>
    </div>
  );
};

export default DetailReportMovemnt;
