import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { borApi } from "../services/bor.api";
import Loading from "../../../components/Loading/Loading";
import { formatDateTime } from "../../../components/Datetime/FormatDateTime";
import Table from "../../../components/Table/Table";

import "../../../components/Button/button.css";
import "../../../components/Table/table.css";
import "../../../styles/component.css";
import "./detailbor.css";

function safeText(v: any) {
  const s = String(v ?? "").trim();
  return s || "-";
}

function pickItems(bor: any): any[] {
  const v = bor?.items ?? bor?.lines ?? bor?.details ?? [];
  return Array.isArray(v) ? v : [];
}

const tableHeaders = [
  "No",
  "สินค้า",
  "ชื่อ",
  "หน่วย",
  "QTY",
  "Lot serial.",
  "Expire Date",
  "เวลาที่ดำเนินการ",
];

const DetailBor = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const no = decodeURIComponent(String(id ?? "").trim());

  const [bor, setBor] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!no) {
      setErrorMsg("Invalid no");
      return;
    }

    let alive = true;
    const run = async () => {
      setLoading(true);
      setErrorMsg("");
      try {
        const res = await borApi.getBorByNo(no);
        if (!alive) return;
        const raw = res?.data;
        setBor(raw?.data ?? raw ?? null);
      } catch (e: any) {
        if (!alive) return;
        setErrorMsg(e?.message || "โหลดข้อมูลไม่สำเร็จ");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    };
    run();
    return () => {
      alive = false;
    };
  }, [no]);

  const items = useMemo(() => pickItems(bor), [bor]);

  if (!bor && loading) {
    return (
      <div className="dt-bor-container">
        <Loading />
      </div>
    );
  }

  if (errorMsg)
    return <div className="dt-bor-container dt-bor-error">{errorMsg}</div>;

  return (
    <div className="dt-bor-container">
      {/* ─── Header ─────────────────────────────── */}
      <div className="dt-bor-header">
        <h1 className="dt-bor-title">SWAP : {safeText(bor?.no ?? no)}</h1>
      </div>

      {/* ─── Info Panel ──────────────────────────── */}
      <div className="dt-bor-info">
        <div className="dt-bor-info-row">
          <div className="dt-bor-info-item">
            <label>Department :</label>
            <span>{safeText(bor?.department)}</span>
          </div>
          <div className="dt-bor-info-item">
            <label>Location :</label>
            <span>{safeText(bor?.location_name)}</span>
          </div>
          <div className="dt-bor-info-item">
            <label>Location_dest :</label>
            <span>{safeText(bor?.location_dest_name)}</span>
          </div>
        </div>
      </div>

      {/* ─── Table ──────────────────────────────── */}
      <div className="table__wrapper">
        <Table headers={tableHeaders}>
          {items.length === 0 ? (
            <tr>
              <td colSpan={tableHeaders.length} className="no-data">
                ไม่มีรายการ
              </td>
            </tr>
          ) : (
            items.map((item: any, index: number) => (
              <tr key={item?.id ?? index}>
                <td>{index + 1}</td>
                <td>{safeText(item?.code)}</td>
                <td>{safeText(item?.name ?? item?.product_name)}</td>
                <td>{safeText(item?.unit)}</td>
                <td>{safeText(item?.system_qty)}</td>
                <td className={!item?.lot_serial && !item?.lot ? "dt-bor-null" : ""}>
                  {safeText(item?.lot_serial ?? "null") || safeText(item?.lot ?? "null")}
                </td>
                <td
                  className={
                    !item?.exp && !item?.expiration_date ? "dt-bor-null" : ""
                  }
                >
                  {item?.expiration_date
                    ? formatDateTime(item.expiration_date)
                    : "null"}
                </td>
                <td>{formatDateTime(item?.updated_at ?? item?.created_at)}</td>
              </tr>
            ))
          )}
        </Table>
      </div>

      {/* ─── Footer ─────────────────────────────── */}
      <div className="dt-bor-footer">
        <button
          className="dt-bor-btn-back"
          onClick={() => navigate(-1)}
          disabled={loading}
        >
          ย้อนกลับ
        </button>
      </div>

      {loading && (
        <div className="loading-overlay">
          <Loading />
        </div>
      )}
    </div>
  );
};

export default DetailBor;
