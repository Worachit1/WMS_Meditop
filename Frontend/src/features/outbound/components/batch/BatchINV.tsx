import React, { useEffect, useMemo, useRef, useState } from "react";
import "./batchinv.css";
import { toast } from "react-toastify";

import { outboundApi, batchApi } from "../../services/outbound.api";
import { confirmAlert } from "../../../../utils/alert";
import { useNavigate } from "react-router-dom";

type BatchInvRow = {
  outbound_id: number;
  outbound_no: string; // no
  invoice?: string; // ✅ new
  origin?: string; // ✅ new
  department?: string;
  date?: Date | null;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatDateTime(ts: Date) {
  const y = ts.getFullYear();
  const m = pad2(ts.getMonth() + 1);
  const d = pad2(ts.getDate());
  const hh = pad2(ts.getHours());
  const mm = pad2(ts.getMinutes());
  const ss = pad2(ts.getSeconds());
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

function parseDateAny(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function getLoginNameFallback() {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return "user.ref";
    const u = JSON.parse(raw);
    return u?.first_name || u?.username || u?.login || "user.ref";
  } catch {
    return "user.ref";
  }
}

function uniqBy<T>(arr: T[], keyFn: (x: T) => string) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of arr) {
    const k = keyFn(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function normalizeTransfersToDocList(rowsRaw: any[]): BatchInvRow[] {
  const mapped: BatchInvRow[] = rowsRaw
    .map((r: any) => {
      const outbound_id = Number(
        r.outbound_id ?? r.id ?? r.transfer_id ?? r.header_id ?? r.doc_id,
      );

      const outbound_no = String(
        r.outbound_no ?? r.no ?? r.name ?? r.doc_no ?? r.invoice_no ?? "",
      ).trim();

      // ✅ NEW: invoice / origin (พยายามรองรับหลายชื่อ field)
      const invoice = String(
        r.invoice ?? r.invoice_no ?? r.inv ?? r.customer_invoice ?? "",
      ).trim();

      const origin = String(
        r.origin ?? r.source ?? r.ref ?? r.reference ?? r.so_no ?? "",
      ).trim();

      const department = String(
        r.department ?? r.dept ?? r.section ?? r.division ?? "",
      ).trim();

      const date =
        parseDateAny(r.date) ||
        parseDateAny(r.outbound_date) ||
        parseDateAny(r.scheduled_date) ||
        parseDateAny(r.created_at);

      if (!Number.isFinite(outbound_id) || !outbound_no) return null;

      return { outbound_id, outbound_no, invoice, origin, department, date };
    })
    .filter(Boolean) as BatchInvRow[];

  return uniqBy(mapped, (x) => String(x.outbound_id));
}

const BatchINV: React.FC = () => {
  const navigate = useNavigate();
  const [now, setNow] = useState<Date>(() => new Date());
  const [loginName] = useState<string>(() => getLoginNameFallback());

  const [loading, setLoading] = useState(false);

  const [invoiceList, setInvoiceList] = useState<BatchInvRow[]>([]);
  const [batchList, setBatchList] = useState<BatchInvRow[]>([]);

  const [selectedInv, setSelectedInv] = useState<Set<number>>(new Set());
  const [selectedBatch, setSelectedBatch] = useState<Set<number>>(new Set());

  // ✅ Scan mode
  const [isScanActive, setIsScanActive] = useState(false);
  const [scanValue, setScanValue] = useState("");
  const scanInputRef = useRef<HTMLInputElement>(null);

  const [excludedOutboundIds, setExcludedOutboundIds] = useState<Set<number>>(
    new Set(),
  );

  const [searchText, setSearchText] = useState("");
  const [remark, setRemark] = useState("");

  const moveToBatchNow = (row: BatchInvRow) => {
    // กันซ้ำ
    setBatchList((prev) => {
      if (prev.some((x) => x.outbound_id === row.outbound_id)) return prev;
      return [...prev, row];
    });

    // เอาออกจากฝั่งซ้ายทันที
    setInvoiceList((prev) =>
      prev.filter((x) => x.outbound_id !== row.outbound_id),
    );

    // กัน reload แล้วกลับมา
    setExcludedOutboundIds((prev) => {
      const next = new Set(prev);
      next.add(row.outbound_id);
      return next;
    });
  };

  const getUserRefId = () => {
    const id = (localStorage.getItem("id") || "").trim();
    return `${id}`.trim();
  };

  const user_id = getUserRefId();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (isScanActive) {
      setTimeout(() => scanInputRef.current?.focus(), 0);
    }
  }, [isScanActive]);

  const normalizeText = (v: unknown) =>
    String(v ?? "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ");

  const filteredInvoiceList = useMemo(() => {
    const q = normalizeText(searchText);
    if (!q) return invoiceList;

    return invoiceList.filter((row) => {
      const no = normalizeText(row.outbound_no);
      const invoice = normalizeText(row.invoice);
      const origin = normalizeText(row.origin);
      const department = normalizeText(row.department);

      return (
        no.includes(q) ||
        invoice.includes(q) ||
        origin.includes(q) ||
        department.includes(q)
      );
    });
  }, [invoiceList, searchText]);

  const invTotal = useMemo(
    () => filteredInvoiceList.length,
    [filteredInvoiceList.length],
  );

  const toggleSelectInv = (outbound_id: number) => {
    const found = invoiceList.find((x) => x.outbound_id === outbound_id);
    if (!found) return;

    // ย้ายไป Batch ทันที
    setBatchList((prev) => {
      if (prev.some((x) => x.outbound_id === outbound_id)) return prev;
      return [...prev, found];
    });

    setInvoiceList((prev) => prev.filter((x) => x.outbound_id !== outbound_id));

    // กัน reload แล้วกลับมา
    setExcludedOutboundIds((prev) => {
      const next = new Set(prev);
      next.add(outbound_id);
      return next;
    });
  };

  const toggleSelectBatch = (outbound_id: number) => {
    const found = batchList.find((x) => x.outbound_id === outbound_id);
    if (!found) return;

    // ย้ายกลับทันที
    setInvoiceList((prev) => {
      if (prev.some((x) => x.outbound_id === outbound_id)) return prev;
      return [...prev, found];
    });

    setBatchList((prev) => prev.filter((x) => x.outbound_id !== outbound_id));

    // คืนสิทธิ์ให้ reload แล้วเห็นได้
    setExcludedOutboundIds((prev) => {
      const next = new Set(prev);
      next.delete(outbound_id);
      return next;
    });
  };

  const loadLast5DaysTransfers = React.useCallback(async () => {
    setLoading(true);
    try {
      const resp = await outboundApi.getOutboundBatch({ page: 1, limit: 500 });

      const payload = (resp as any)?.data ?? resp;

      const rowsRaw: any[] =
        payload?.data?.data ||
        payload?.data?.rows ||
        payload?.data?.items ||
        payload?.rows ||
        payload?.items ||
        payload?.data ||
        [];

      const docs = normalizeTransfersToDocList(rowsRaw);

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 5);

      const filtered = docs.filter((x) => {
        if (!x.date) return true;
        return x.date.getTime() >= cutoff.getTime();
      });

      filtered.sort(
        (a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0),
      );

      const batchIds = new Set(batchList.map((x) => x.outbound_id));

      const filtered2 = filtered.filter(
        (x) =>
          !excludedOutboundIds.has(x.outbound_id) &&
          !batchIds.has(x.outbound_id),
      );

      setInvoiceList(filtered2);
    } catch (e: any) {
      console.error(e);
      toast.error("โหลดรายการ INV จาก Odoo ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [batchList, excludedOutboundIds]);

  useEffect(() => {
    loadLast5DaysTransfers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // const moveInvToBatch = () => {
  //   if (selectedInv.size === 0) return;

  //   const moveIds = new Set(selectedInv);
  //   const batchSet = new Set(batchList.map((x) => x.outbound_id));

  //   const toMove = invoiceList.filter((x) => moveIds.has(x.outbound_id));
  //   const remain = invoiceList.filter((x) => !moveIds.has(x.outbound_id));

  //   const merged = [
  //     ...batchList,
  //     ...toMove.filter((x) => !batchSet.has(x.outbound_id)),
  //   ];

  //   setInvoiceList(remain);
  //   setBatchList(merged);

  //   // ✅ สำคัญ: กันไม่ให้ reload แล้วกลับมาอีก
  //   setExcludedOutboundIds((prev) => {
  //     const next = new Set(prev);
  //     toMove.forEach((x) => next.add(x.outbound_id));
  //     return next;
  //   });

  //   setSelectedInv(new Set());
  // };

  // const moveBatchToInv = () => {
  //   if (selectedBatch.size === 0) return;

  //   const moveIds = new Set(selectedBatch);
  //   const invSet = new Set(invoiceList.map((x) => x.outbound_id));

  //   const toMove = batchList.filter((x) => moveIds.has(x.outbound_id));
  //   const remain = batchList.filter((x) => !moveIds.has(x.outbound_id));

  //   const merged = [
  //     ...invoiceList,
  //     ...toMove.filter((x) => !invSet.has(x.outbound_id)),
  //   ];

  //   setExcludedOutboundIds((prev) => {
  //     const next = new Set(prev);
  //     toMove.forEach((x) => next.delete(x.outbound_id)); // ✅ คืนสิทธิ์ให้กลับมาแสดงได้
  //     return next;
  //   });
  //   setBatchList(remain);
  //   setInvoiceList(merged);
  //   setSelectedBatch(new Set());
  // };

  // ✅ ปุ่มสแกน INV = toggle scan mode + reload list (กันข้อมูลเก่า)
  const onScanInv = async () => {
    setIsScanActive((p) => !p);
    await loadLast5DaysTransfers();
  };

  // ✅ เมื่อสแกนแล้วเจอใน invoiceList → ติ๊กให้เลย
  const applyScanToSelect = (scan: string) => {
    const s = String(scan || "").trim();
    if (!s) return;

    const found =
      invoiceList.find((x) => x.outbound_no === s) ||
      invoiceList.find((x) => x.outbound_no.includes(s)) ||
      invoiceList.find((x) => s.includes(x.outbound_no));

    if (!found) {
      toast.error(`ไม่พบ INV: ${s}`);
      return;
    }

    moveToBatchNow(found);
    toast.success(`ย้ายแล้ว: ${found.outbound_no}`);
  };

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    applyScanToSelect(scanValue);
    setScanValue("");
    setTimeout(() => scanInputRef.current?.focus(), 0);
  };

  const onCancel = async () => {
    setSelectedInv(new Set());
    setSelectedBatch(new Set());
    navigate("/outbound?view=picking");
  };

  const onCreate = async () => {
    if (!user_id) {
      toast.error("ไม่พบ user_id (ต้อง login หรือส่ง user_id มา)");
      return;
    }

    if (batchList.length === 0) {
      toast.warning("กรุณาเลือก INV อย่างน้อย 1 รายการก่อน");
      return;
    }

    // ✅ confirm ก่อนสร้าง
    const ok = await confirmAlert(
      `ยืนยันการสร้าง Batch INV จำนวน ${batchList.length} รายการ ใช่ไหม?`,
    );
    if (!ok.isConfirmed) return;

    const outbound_ids = batchList
      .map((x) => x.outbound_id)
      .filter(Number.isFinite);

    if (outbound_ids.length !== batchList.length) {
      toast.error(
        "สร้างไม่ได้: API transfers ไม่ส่ง outbound_id มาครบ (ต้องมี id เพื่อ lock)",
      );
      return;
    }

    setLoading(true);
    try {
      const resp = await batchApi.createBatch({
        outbound_ids,
        user_id: Number(user_id),
        remark: remark.trim() || undefined,
      });

      const payload = (resp as any)?.data ?? resp;
      toast.success(payload?.message || "สร้าง Batch INV สำเร็จ");

      setBatchList([]);
      setSelectedBatch(new Set());

      navigate(
        "/group-order?batchName=" +
          encodeURIComponent(payload?.batch_name || ""),
      );

      await loadLast5DaysTransfers();
    } catch (e: any) {
      console.error(e);
      const msg =
        e?.response?.data?.message || e?.message || "สร้าง Batch INV ไม่สำเร็จ";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="batchinv-page">
      <div className="batchinv-header">
        <div className="batchinv-header-left">
          <div className="batchinv-title">Batch INV.</div>

          <div className="batchinv-meta">
            <div className="batchinv-meta-item">
              <span className="batchinv-meta-label">Date :</span>
              <span className="batchinv-meta-value">{formatDateTime(now)}</span>
            </div>

            <div className="batchinv-meta-item">
              <span className="batchinv-meta-label">User :</span>
              <span className="batchinv-meta-value">{loginName}</span>
            </div>
          </div>
        </div>

        <div className="batchinv-header-right">
          <textarea
            className="batchinv-remark-input"
            placeholder="กรอก Remark..."
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            rows={2}
          />
        </div>
      </div>

      <div className="batchinv-divider" />

      <div className="batchinv-grid-head">
        <div className="batchinv-head-left">
          {/* Row 1 */}
          <div className="batchinv-head-toprow">
            <div className="batchinv-section-label">Inv. List From odoo</div>

            <div className="batchinv-head-actions">
              <div className="batchinv-scan-wrapper">
                <button
                  type="button"
                  className={`batchinv-btn batchinv-btn-scan ${isScanActive ? "active" : ""}`}
                  onClick={onScanInv}
                  disabled={loading}
                >
                  {isScanActive ? "ปิดสแกน" : "สแกน INV"}
                </button>

                {isScanActive && (
                  <form
                    className="batchinv-scan-form"
                    onSubmit={handleScanSubmit}
                  >
                    <input
                      ref={scanInputRef}
                      type="text"
                      className="batchinv-scan-input"
                      placeholder="สแกน INV..."
                      value={scanValue}
                      onChange={(e) => setScanValue(e.target.value)}
                    />
                  </form>
                )}
              </div>

              <div className="batchinv-total">total : {invTotal}</div>
            </div>
          </div>

          {/* Row 2 (Search full width) */}
          <div className="batchinv-head-searchrow">
            <div className="batchinv-search-inline">
              <i className="fa-solid fa-magnifying-glass batchinv-search-icon" />
              <input
                type="text"
                className="batchinv-search-input"
                placeholder="Search invoice / origin / no"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                disabled={loading}
              />
              {searchText && (
                <button
                  type="button"
                  className="batchinv-search-clear"
                  onClick={() => setSearchText("")}
                  title="ล้างค้นหา"
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="batchinv-head-mid" />

        <div className="batchinv-head-right">
          <div className="batchinv-section-label">Batch ID</div>
        </div>
      </div>

      <div className="batchinv-content">
        {/* Left */}
        <div className="batchinv-panel">
          <div className="batchinv-table-wrap">
            <table className="batchinv-table">
              <thead>
                <tr>
                  <th className="batchinv-th-select">Select</th>
                  <th>Doc No.</th>
                  <th>Invoice</th>
                  <th>Origin</th>
                  <th>Department</th>
                </tr>
              </thead>
              <tbody>
                {invoiceList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="batchinv-empty">
                      {loading ? "กำลังโหลด..." : "ไม่มีรายการ Batch INV."}
                    </td>
                  </tr>
                ) : (
                  filteredInvoiceList.map((row) => (
                    <tr key={row.outbound_id}>
                      <td className="batchinv-td-select">
                        <input
                          type="checkbox"
                          checked={selectedInv.has(row.outbound_id)}
                          onChange={() => toggleSelectInv(row.outbound_id)}
                        />
                      </td>
                      <td className="batchinv-td-text" title={row.outbound_no}>
                        {row.outbound_no}
                      </td>
                      <td
                        className="batchinv-td-text"
                        title={row.invoice || "-"}
                      >
                        {row.invoice || "-"}
                      </td>
                      <td
                        className="batchinv-td-text"
                        title={row.origin || "-"}
                      >
                        {row.origin || "-"}
                      </td>
                      <td
                        className="batchinv-td-text"
                        title={row.department || "-"}
                      >
                        {row.department || "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Middle */}
        <div className="batchinv-transfer">
          {/* <button
            className="batchinv-transfer-btn"
            onClick={moveInvToBatch}
            disabled={selectedInv.size === 0 || loading}
            title="ย้ายไป Batch"
            type="button"
          >
            <span className="batchinv-transfer-icon">+</span>
          </button>

          <button
            className="batchinv-transfer-btn"
            onClick={moveBatchToInv}
            disabled={selectedBatch.size === 0 || loading}
            title="ย้ายกลับ"
            type="button"
          >
            <span className="batchinv-transfer-icon">−</span>
          </button> */}
        </div>

        {/* Right */}
        <div className="batchinv-panel">
          <div className="batchinv-table-wrap">
            <table className="batchinv-table">
              <thead>
                <tr>
                  <th className="batchinv-th-select">Select</th>
                  <th>Doc No.</th>
                  <th>Invoice</th>
                  <th>Origin</th>
                  <th>Department</th>
                </tr>
              </thead>
              <tbody>
                {batchList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="batchinv-empty">
                      ยังไม่ได้เลือก INV
                    </td>
                  </tr>
                ) : (
                  batchList.map((row) => (
                    <tr key={row.outbound_id}>
                      <td className="batchinv-td-select">
                        <input
                          type="checkbox"
                          checked={selectedBatch.has(row.outbound_id)}
                          onChange={() => toggleSelectBatch(row.outbound_id)}
                        />
                      </td>
                      <td className="batchinv-td-text" title={row.outbound_no}>
                        {row.outbound_no}
                      </td>
                      <td
                        className="batchinv-td-text"
                        title={row.invoice || "-"}
                      >
                        {row.invoice || "-"}
                      </td>
                      <td
                        className="batchinv-td-text"
                        title={row.origin || "-"}
                      >
                        {row.origin || "-"}
                      </td>
                      <td
                        className="batchinv-td-text"
                        title={row.department || "-"}
                      >
                        {row.department || "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="batchinv-footer">
        <button
          className="batchinv-btn batchinv-btn-cancel"
          onClick={onCancel}
          disabled={loading}
          type="button"
        >
          ย้อนกลับ
        </button>
        <button
          className="batchinv-btn batchinv-btn-create"
          onClick={onCreate}
          disabled={loading || batchList.length === 0}
          type="button"
        >
          สร้าง
        </button>
      </div>
    </div>
  );
};

export default BatchINV;
