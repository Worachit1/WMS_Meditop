import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import "./invoiceslist.css";

import type { LotUpdatedPayload } from "../components/groporder/GroupOrder";

import { goodsoutApi } from "../services/outbound.api";
// import { deleteAlert, successAlert } from "../../../utils/alert";

import EditLotModal from "./EditLotModal";

/* ================= Types ================= */

type OutboundItem = {
  id: number;
  outbound_id: number;
  sequence: number;
  product_id: number;
  code: string;
  name: string;
  unit: string;
  tracking: string;
  lot_id: number | null;
  lot_serial: string | null;
  qty: number;
  lock_no: string | null;
  lock_name: string | null;
  pick: number;
  pack: number;
  box_id: number | null;
  box: any;
  barcode_id: number | null;
  barcode: string | null;
  created_at: string;
  updated_at: string | null;
};

type Outbound = {
  id: number;
  no: string; // 🔑 outbound no
  outbound_barcode: string;
  out_type: string;
  date: string;
  items: OutboundItem[];
};

type InvoiceRow = {
  id: string; // ✅ unique row key กันชนกรณี split
  goods_out_item_id: number; // ✅ item id จริง
  no: string; // outbound no
  invoice?: string;
  origin?: string;
  quantity: number;
  item: OutboundItem;
};

/* ================= Props ================= */

type InvoiceListModalProps = {
  isOpen: boolean;
  onClose: () => void;
  code?: string | null;
  lot_serial?: string | null;
  batchName: string;
  onUpdated: (payload?: LotUpdatedPayload) => void;
};

/* ================= Component ================= */

const InvoiceListModal = ({
  isOpen,
  onClose,
  code,
  lot_serial,
  batchName,
  onUpdated,
}: InvoiceListModalProps) => {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [allRows, setAllRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 🔹 Edit Lot
  const [editLotModalOpen, setEditLotModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);

  /* ================= Fetch ================= */

  const fetchInvoiceList = async (code: string, lotSerial?: string | null) => {
    setLoading(true);
    try {
      const res = await goodsoutApi.searchByBatchAndCode(batchName, {
        code,
        search: "",
      });

      const data: Outbound[] = res.data?.data ?? [];

      let mapped: InvoiceRow[] = data.flatMap((outbound) =>
        outbound.items.map((item) => ({
          id: `${outbound.no}_${item.id}_${item.lot_serial ?? "NOLOT"}`,
          goods_out_item_id: Number(item.id),
          no: outbound.no,
          quantity: Number(item.qty ?? 0),
          item,
        })),
      );

      setAllRows(mapped);

      if (lotSerial != null && lotSerial !== "") {
        mapped = mapped.filter((r) => (r.item.lot_serial ?? "") === lotSerial);
      }

      setRows(mapped);
      setSelected(new Set());
    } catch (err) {
      console.error(err);
      toast.error("ไม่สามารถดึงข้อมูล Invoice List ได้");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
  if (isOpen && code && batchName) {
    fetchInvoiceList(code, lot_serial);
  }
}, [isOpen, code, lot_serial, batchName]);

  /* ================= Select ================= */

  const toggleItem = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };
  const toggleAll = () => {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((r) => r.id)));
    }
  };

  /* ================= Bulk Delete ================= */

  // const handleBulkDelete = async () => {
  //   if (selected.size === 0) {
  //     toast.warning("กรุณาเลือกรายการ");
  //     return;
  //   }

  //   const result = await deleteAlert();
  //   if (!result.isConfirmed) return;

  //   try {
  //     const outboundNos = Array.from(
  //       new Set(
  //         rows
  //           .filter((r) => selected.has(r.id))
  //           .map((r) => r.no)
  //           .filter(Boolean),
  //       ),
  //     );

  //     await outboundApi.bulkDelete(outboundNos);
  //     await successAlert("ลบข้อมูลสำเร็จ");

  //     if (code) {
  //       await fetchInvoiceList(code, lot_serial);
  //     }

  //     setSelected(new Set());
  //   } catch (err: any) {
  //     toast.error(err?.response?.data?.message || "ลบข้อมูลไม่สำเร็จ");
  //   }
  // };

  /* ================= Edit Lot ================= */

  const openEditLot = (row: InvoiceRow) => {
    setSelectedItem({
      outbound_no: row.no,
      goods_out_id: row.goods_out_item_id,
      lot_serial: row.item.lot_serial ?? null,
      qty: Number(row.item.qty ?? 0),
      product_id: row.item.product_id ?? null,
      code: row.item.code ?? "",
      name: row.item.name ?? "",
    });
    setEditLotModalOpen(true);
  };

  const handleEditLotSuccess = async (payload?: LotUpdatedPayload) => {
    if (code) {
      const lotToFetch = payload?.lot_new ?? lot_serial;
      await fetchInvoiceList(code, lotToFetch);
    }
    onUpdated(payload);
  };

  /* ================= Render ================= */

  if (!isOpen) return null;

  return (
    <div
      className="invoice-list-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="invoice-list-modal-content">
        <div className="invoice-list-modal-header">
          <h2>List ใบสินค้า</h2>
          {/* <button
            className="invoice-list-delete-btn"
            disabled={selected.size === 0}
            onClick={handleBulkDelete}
          >
            Delete
          </button> */}
        </div>

        {loading ? (
          <div className="invoice-list-loading">Loading...</div>
        ) : (
          <div className="invoice-list-table-wrapper">
            <table className="invoice-list-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={rows.length > 0 && selected.size === rows.length}
                      onChange={toggleAll}
                    />
                    <span style={{ marginLeft: 8 }}>Select</span>
                  </th>
                  <th>Doc No.</th>
                  <th>Invoice</th>
                  <th>Origin</th>
                  <th>SKUS</th>
                  <th>Inv QTY</th>
                  <th>Pick</th>
                  <th>QTY</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="invoice-list-empty">
                      ไม่พบข้อมูล
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(row.id)}
                          onChange={() => toggleItem(row.id)}
                        />
                      </td>
                      <td>{row.no}</td>
                      <td>{row.invoice}</td>
                      <td>{row.origin}</td>
                      <td>
                        {allRows.filter((r) => r.no === row.no).length}
                      </td>
                      <td>
                        {allRows
                          .filter((r) => r.no === row.no)
                          .reduce((sum, r) => sum + r.quantity, 0)}
                      </td>
                      <td>
                        {(() => {
                          const pick = Number(row.item.pick ?? 0);
                          if (pick > 0) return pick;
                          const locPicks = Array.isArray((row.item as any).location_picks)
                            ? (row.item as any).location_picks
                            : [];
                          const locPickSum = locPicks.reduce(
                            (sum: number, lp: any) => sum + Number(lp?.qty_pick ?? 0),
                            0,
                          );
                          return locPickSum > 0 ? locPickSum : pick;
                        })()}
                      </td>
                      <td>{row.quantity}</td>
                      <td>
                        <button
                          className="invoice-list-detail-btn"
                          onClick={() => openEditLot(row)}
                        >
                          เปลี่ยน Lot.
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="invoice-list-modal-footer">
          <button className="invoice-list-close-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {/* ===== Edit Lot Modal ===== */}
      <EditLotModal
        isOpen={editLotModalOpen}
        onClose={() => setEditLotModalOpen(false)}
        onSuccess={handleEditLotSuccess}
        invoiceItem={selectedItem}
      />
    </div>
  );
};

export default InvoiceListModal;
