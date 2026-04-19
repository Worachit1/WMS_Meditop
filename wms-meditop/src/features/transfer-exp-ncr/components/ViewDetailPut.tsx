import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Swal from "sweetalert2";

import { transferApi } from "../services/transfer.api";
import type { TransferType, TransferItemType } from "../types/tranfers.type";

import Table from "../../../components/Table/Table";
import "../../../components/Button/button.css";
import "../../../components/Table/table.css";
import "../../../styles/component.css";
import { formatDateTime } from "../../../components/Datetime/FormatDateTime";

import Loading from "../../../components/Loading/Loading";
import "../transfer-exp-ncr.css";

type ViewMode = "pending" | "done";

const ViewDetailPut = () => {
  const navigate = useNavigate();
  const params = useParams();
  const no = decodeURIComponent(String(params.no ?? "").trim());

  // ===== refs (คงไว้เพื่อให้ layout เหมือนเดิม) =====
  const scanLocationInputRef = useRef<HTMLInputElement>(null);
  const scanBarcodeInputRef = useRef<HTMLInputElement>(null);

  // ===== data =====
  const [loading, setLoading] = useState(false);
  const [transfer, setTransfer] = useState<TransferType | null>(null);

  // ===== view-only scan states (โชว์เฉยๆ) =====
  const [scanLocation, setScanLocation] = useState("");
  const [confirmedLocation, setConfirmedLocation] = useState<{
    id: number;
    full_name: string;
  } | null>(null);

  // ===== ui =====
  const [viewMode, setViewMode] = useState<ViewMode>("pending");
  const [searchFilter, setSearchFilter] = useState("");

  // ===== Items =====
  const allItems: TransferItemType[] = useMemo(() => {
    const raw = (transfer as any)?.items;
    return Array.isArray(raw) ? (raw as TransferItemType[]) : [];
  }, [transfer]);

  const getUserRefFromTransferItems = (transfer: any): string => {
    const items = Array.isArray(transfer?.items) ? transfer.items : [];

    const refs = items
      .map((x: any) => String(x?.user_ref ?? "").trim())
      .filter((x: string) => x !== "");

    if (refs.length === 0) return "-";

    const unique = Array.from(new Set(refs));

    return unique.length === 1 ? String(unique[0]) : "-";
  };

  // =========================
  // helpers (เหมือนหน้า PUT เดิม)
  // =========================
  const getQtyLimit = (it: TransferItemType) =>
    Number((it as any).quantity_count ?? (it as any).qty ?? 0);

  const getPutQty = (it: TransferItemType) =>
    Number((it as any).quantity_put ?? (it as any).put ?? 0);

  const isDoneItem = useCallback((it: TransferItemType) => {
    const qty = getQtyLimit(it);
    const put = getPutQty(it);
    return qty > 0 && put === qty;
  }, []);

  const isProgressItem = useCallback((it: TransferItemType) => {
    const qty = getQtyLimit(it);
    const put = getPutQty(it);
    return put > 0 && qty > 0 && put < qty;
  }, []);

  const pendingItems = useMemo(
    () => allItems.filter((x) => !isDoneItem(x)),
    [allItems, isDoneItem],
  );

  const doneItems = useMemo(
    () => allItems.filter((x) => isDoneItem(x)),
    [allItems, isDoneItem],
  );

  const pendingCount = pendingItems.length;
  const doneCount = doneItems.length;

  // auto switch tab
  useEffect(() => {
    if (pendingCount === 0 && doneCount > 0) setViewMode("done");
  }, [pendingCount, doneCount]);

  const viewItems = viewMode === "done" ? doneItems : pendingItems;

  // search
  const filteredItems = useMemo(() => {
    const s = searchFilter.trim().toLowerCase();
    if (!s) return viewItems;

    return viewItems.filter((it: any) => {
      const code = String(it?.code ?? "").toLowerCase();
      const name = String(it?.name ?? "").toLowerCase();
      const lot = String(it?.lot_serial ?? it?.lot ?? "").toLowerCase();
      const lock = String(it?.lock_no_list ?? it?.lock_no ?? "").toLowerCase();
      return (
        code.includes(s) ||
        name.includes(s) ||
        lot.includes(s) ||
        lock.includes(s)
      );
    });
  }, [viewItems, searchFilter]);

  // sort: pending -> progress ขึ้นก่อน
  const rowsToRender = useMemo(() => {
    const arr = [...filteredItems];
    if (viewMode !== "pending") return arr;

    arr.sort((a: any, b: any) => {
      const pa = isProgressItem(a) ? 0 : 1;
      const pb = isProgressItem(b) ? 0 : 1;
      if (pa !== pb) return pa - pb;

      const qa = getQtyLimit(a);
      const qb = getQtyLimit(b);
      const ca = getPutQty(a);
      const cb = getPutQty(b);
      const ra = qa > 0 ? ca / qa : 0;
      const rb = qb > 0 ? cb / qb : 0;
      return rb - ra;
    });

    return arr;
  }, [filteredItems, viewMode, isProgressItem]);

  // =========================
  // API shape guard
  // =========================
  const pickTransferFromAnyShape = (respData: any) => {
    if (Array.isArray(respData?.data)) return respData.data[0] ?? null;
    if (Array.isArray(respData?.data?.data))
      return respData.data.data[0] ?? null;
    if (respData?.data && typeof respData.data === "object")
      return respData.data;
    if (
      respData &&
      typeof respData === "object" &&
      (respData.no || respData.id)
    )
      return respData;
    return null;
  };

  // =========================
  // fetch detail
  // =========================
  const fetchDetail = useCallback(async () => {
    if (!no) return;
    setLoading(true);

    try {
      // ✅ ใช้ตัวเดียวกับหน้าเดิมไปก่อน (ถ้าคุณมี getDetailPut ก็สลับชื่อฟังก์ชันตรงนี้)
      const resp = await transferApi.getDetailExpNcr(no);

      const row = pickTransferFromAnyShape(resp.data);
      setTransfer(row);

      // view-only: ถ้า backend ส่ง location ล่าสุดมา ก็โชว์ได้
      const locName =
        row?.scanned_location_full_name ??
        row?.location_full_name ??
        row?.location?.location_name ??
        "";

      const locId = Number(
        row?.scanned_location_id ??
          row?.location_id ??
          row?.location?.location_id ??
          0,
      );

      if (locName) {
        setScanLocation(String(locName));
        setConfirmedLocation({ id: locId || 0, full_name: String(locName) });
      } else {
        setScanLocation("");
        setConfirmedLocation(null);
      }

      if (scanBarcodeInputRef.current) scanBarcodeInputRef.current.value = "";
    } catch (err: any) {
      console.error(err);
      Swal.fire({
        icon: "error",
        title: "โหลดรายละเอียดไม่สำเร็จ",
        text: err?.response?.data?.message || "เกิดข้อผิดพลาด",
      });
      setTransfer(null);
    } finally {
      setLoading(false);
    }
  }, [no]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const tableHeaders = [
    "No",
    "สินค้า",
    "ชื่อ",
    "Lot. Serial",
    "Expire Date",
    "หน่วย",
    "Lock No. EXP&NCR",
    "Pick",
    "Put",
  ];

  if (!transfer && loading) {
    return (
      <div className="transfer-exp-ncr-detail-container">
        <Loading />
      </div>
    );
  }

  return (
    <div className="transfer-exp-ncr-detail-container">
      <div className="transfer-exp-ncr-detail-header">
        <h1 className="transfer-exp-ncr-detail-title">
          VIEW PUT : {(transfer as any)?.no || no || "PUT"}
        </h1>
      </div>

      <div className="transfer-exp-ncr-detail-info">
        {/* ===== row 1 ===== */}
        <div className="transfer-exp-ncr-info-row">
          <div className="transfer-exp-ncr-info-item">
            <label>Department :</label>
            <span>{(transfer as any)?.department || "data"}</span>
          </div>

          <div className="transfer-exp-ncr-info-item">
            <label>PO No. :</label>
            <span>{(transfer as any)?.origin || "data"}</span>
          </div>

          <div className="transfer-exp-ncr-info-item">
            <label>Scan Location :</label>
            <input
              ref={scanLocationInputRef}
              type="text"
              className="transfer-exp-ncr-scan-input"
              value={scanLocation}
              onChange={(e) => setScanLocation(e.target.value)}
              placeholder="View Only"
              disabled
              style={{
                borderColor: confirmedLocation ? "#4CAF50" : undefined,
                opacity: 0.6,
              }}
            />

            {/* ปุ่ม toggle ยังคง “หน้าตา” ไว้ แต่ disabled */}
            <button
              type="button"
              className={`transfer-exp-ncr-btn-scan-toggle`}
              disabled
              title="View Only"
            >
              <i className="fa-solid fa-qrcode"></i>
            </button>
          </div>
        </div>

        {/* ===== row 2 ===== */}
        <div className="transfer-exp-ncr-info-row">
          <div className="transfer-exp-ncr-info-item">
            <label>INV. Sup:</label>
            <span>{(transfer as any)?.reference || "data"}</span>
          </div>

          <div className="transfer-exp-ncr-info-item">
            <label>User :</label>
            <span>{getUserRefFromTransferItems(transfer)}</span>
          </div>

          <div className="transfer-exp-ncr-info-item">
            <label>Scan Barcode/Serial :</label>
            <input
              ref={scanBarcodeInputRef}
              type="text"
              className="transfer-exp-ncr-scan-input"
              placeholder="View Only"
              disabled
            />
          </div>

          <div className="transfer-exp-ncr-info-item">
            <label>เวลารับเข้าเอกสาร:</label>
            <span>{formatDateTime((transfer as any)?.date) || "data"}</span>
          </div>
        </div>

        <br />
        <hr className="transfer-exp-ncr-detail-divider" />

        {/* ===== Tabs + Search ===== */}
        <div className="transfer-exp-ncr-info-row">
          <div className="transfer-exp-ncr-search-bar">
            {/* LEFT */}
            <div className="transfer-exp-ncr-search-left">
              <div className="transfer-exp-ncr-view-tabs">
                {pendingCount > 0 && (
                  <button
                    type="button"
                    className={`transfer-exp-ncr-tab ${
                      viewMode === "pending" ? "active" : ""
                    }`}
                    onClick={() => setViewMode("pending")}
                  >
                    ยังไม่ได้ดำเนินการ{" "}
                    <span className="badge">{pendingCount}</span>
                  </button>
                )}

                {doneCount > 0 && (
                  <button
                    type="button"
                    className={`transfer-exp-ncr-tab ${
                      viewMode === "done" ? "active" : ""
                    }`}
                    onClick={() => setViewMode("done")}
                  >
                    ดำเนินการเสร็จสิ้นแล้ว{" "}
                    <span className="badge">{doneCount}</span>
                  </button>
                )}
              </div>

              {confirmedLocation ? (
                <div className="transfer-exp-ncr-hint-loc">
                  Location ล่าสุด: <b>{confirmedLocation.full_name}</b>
                </div>
              ) : null}
            </div>

            {/* RIGHT */}
            <div className="transfer-exp-ncr-search-right">
              <label className="transfer-exp-ncr-search-label">Search</label>
              <div className="transfer-exp-ncr-search-input-container">
                <i className="fa-solid fa-magnifying-glass transfer-exp-ncr-search-icon"></i>
                <input
                  type="text"
                  className="transfer-exp-ncr-search-input"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Filter Search"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Table ===== */}
      <div className="table__wrapper">
        <Table headers={tableHeaders as any}>
          {rowsToRender.length === 0 ? (
            <tr>
              <td colSpan={tableHeaders.length} className="no-data">
                No items found.
              </td>
            </tr>
          ) : (
            rowsToRender.map((it: any, index) => {
              const qtyLimit = getQtyLimit(it);
              const put = getPutQty(it);

              const isDone = qtyLimit > 0 && put === qtyLimit;
              const isProgress = put > 0 && qtyLimit > 0 && put < qtyLimit;

              const rowClass = [
                isDone ? "row-done" : isProgress ? "row-progress" : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <tr key={`${it.id}-${index}`} className={rowClass}>
                  <td>{index + 1}</td>
                  <td style={{ minWidth: "200px" }}>{it.code || "--"}</td>
                  <td style={{ minWidth: "200px" }}>{it.name || "--"}</td>
                    <td>{it.lot_serial ?? it.lot ?? "--"}</td>
                  <td>{it.exp ? formatDateTime(it.exp) : "--"}</td>
                  <td>{it.unit || "--"}</td>
                  <td style={{ minWidth: 220 }}>
                    {(() => {
                      const putLocs = Array.isArray(it?.put_locations)
                        ? it.put_locations
                        : [];
                      return putLocs.length > 0 ? (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                          }}
                        >
                          {putLocs.map((loc: any, i: number) => (
                            <div key={`${loc.location_name}-${i}`}>
                              {loc.location_name}
                            </div>
                          ))}
                        </div>
                      ) : (
                        "--"
                      );
                    })()}
                  </td>
                  <td>{qtyLimit}</td>
                  <td>{put}</td>
                  
                  
                </tr>
              );
            })
          )}
        </Table>
      </div>

      {/* ===== Footer (View Only: มีแค่ยกเลิก) ===== */}
      <div className="transfer-exp-ncr-detail-footer">
        <button
          className="transfer-exp-ncr-btn-cancel"
          onClick={() => navigate(-1)}
          disabled={loading}
        >
          ยกเลิก
        </button>

        {/* ไม่มีปุ่มยืนยัน */}
      </div>

      {loading && (
        <div className="loading-overlay">
          <Loading />
        </div>
      )}
    </div>
  );
};

export default ViewDetailPut;
