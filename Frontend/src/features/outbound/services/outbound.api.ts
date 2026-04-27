import { http } from "../../../services/http";
import type {
  GoodsOutItem,
  InvoiceData,
  DocInvoice,
  ScanPackProductResponse,
  ScanPackProductItemResponse,
  GetPackProductResponse,
  PackProductListResponse,
} from "../types/outbound.type";

/**
 * Get invoice by barcode
 * @param outbound_barcode - barcode ของ invoice
 * @returns InvoiceData
 */

export const getInvoiceByBarcode = async (
  outbound_barcode: string,
): Promise<InvoiceData> => {
  const response = await http.get<InvoiceData>(
    `outbounds/get/odoo/barcode/${encodeURIComponent(outbound_barcode)}`,
  );
  return response.data;
};

export const outboundApi = {
  getAll: (params?: any) => http.get("/invoices/getAll", { params }),

  // ✅ เพิ่ม API ใหม่
  getAllPaginated: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    searchFields?: string[];
  }) => http.get("/outbounds/packed-items", { params }),

  bulkDelete: (outboundNos: string[]) =>
    http.post("/outbounds/bulk-delete", {
      outbound_nos: outboundNos,
    }),

  getOutbound: (params: { page: number; limit: number; search?: string }) =>
    http.get("/outbounds/get/odoo/transfers", { params }),
  getOutboundBatch: (params: {
    page: number;
    limit: number;
    search?: string;
  }) => http.get("/outbounds/get/odoo/transfers/available", { params }),
  getOutboundByUser: (
    params: { page: number; limit: number; search?: string },
    batchName: string,
  ) =>
    http.get(
      `/outbounds/get/odoo/transfers/user/${encodeURIComponent(batchName)}`,
      { params },
    ),
};

export const boxApi = {
  getAll: (params?: any) => http.get("/boxes/getAll", { params }),

  // ตรวจสอบว่า endpoint ตรงกับ backend หรือไม่
  create: (data: { box_name: string; box_code: string }) =>
    http.post("/boxes/create", data, { timeout: 60000 }),

  getByBoxcode: (boxCode: string) =>
    http.get(`/boxes/get/${encodeURIComponent(boxCode)}`),
};

export const goodsoutApi = {
  getById: (id: string) =>
    http.get<GoodsOutItem>(`/invoices/get/goods_outs/${id}`),

  update: (id: string, data: Partial<GoodsOutItem>) =>
    http.patch(`/goods_outs/update/${id}`, data),

  updateInvoiceItem: (id: string, data: any) =>
    http.patch(`/invoices/update/invoice_items/${id}`, data),

  getLots: () => http.get("/lots/getAll"),

  searchByCode(code: string) {
    return http.get("/outbounds/get/search", {
      params: { code },
    });
  },

  searchByBatchAndCode: (
    batchName: string,
    params: {
      code?: string;
      product_id?: number;
      search?: string;
    },
  ) =>
    http.get(
      `/outbounds/get/odoo/transfers/user/${encodeURIComponent(batchName)}`,
      { params },
    ),

  getOutboundItem: (no: string, itemId: number) =>
    http.get(`/outbounds/${encodeURIComponent(no)}/items/${itemId}`),

  // ✅ เพิ่ม PATCH edit item
  patchOutboundItem: (
    no: string,
    itemId: string,
    payload: {
      lot_serial?: string;
      qty?: number;
      pick?: number;
      pack?: number;
      status?: string;
      user_ref?: string;
    },
  ) =>
    http.patch(
      `/outbounds/${encodeURIComponent(no)}/items/${itemId}`,
      payload,
      { timeout: 60000 },
    ),

  // ✅ เพิ่ม API สำหรับ box management
  addBoxToItem: (
    outboundNo: string,
    itemId: string,
    data: {
      box_id: number;
      quantity?: number;
    },
  ) =>
    http.post(
      `/outbounds/${encodeURIComponent(outboundNo)}/items/${itemId}/boxes`,
      data,
    ),

  removeBoxFromItem: (no: string, itemId: string, boxId: string) =>
    http.delete(
      `/outbounds/${encodeURIComponent(no)}/items/${itemId}/boxes/${boxId}`,
    ),

  getItemBoxes: (outboundNo: string, itemId: string) =>
    http.get(
      `/outbounds/${encodeURIComponent(outboundNo)}/items/${itemId}/boxes`,
    ),

  // ✅ NEW: Scan Location (บังคับให้ทำก่อน)
  scanLocation: (no: string, data: { location_full_name: string }) =>
    http.post(`/outbounds/${encodeURIComponent(no)}/scan/location`, data),

  // ✅ NEW: Confirm -> upsert stock
  confirmToStock: (
    no: string,
    data: {
      location_full_name: string;
      user_ref: string; // ✅ เพิ่ม
      lines: { goods_out_item_id: string; pick: number }[];
    },
  ) => http.post(`/outbounds/${encodeURIComponent(no)}/scan/confirm`, data),
  confirmToStockMulti: (
    no: string,
    data: {
      user_ref: string;
      locations: {
        location_full_name: string;
        lines: { goods_out_item_id: string }[];
      }[];
    },
  ) =>
    http.post(`/outbounds/${encodeURIComponent(no)}/scan/confirm`, data, {
      timeout: 60000,
    }),

  createOutboundLotAdjustment: (
    no: string,
    itemId: string,
    payload: {
      reason?: string;
      user_ref?: string;
      lines: {
        lot_id?: number | null;
        lot_serial?: string | null;
        qty: number;
      }[];
    },
  ) =>
    http.post(
      `/outbounds/${encodeURIComponent(no)}/items/${itemId}/lot`,
      payload,
      { timeout: 60000 },
    ),

  revertOutboundLotAdjustment: (
    no: string,
    itemId: string,
    adjustmentId: number,
  ) =>
    http.delete(
      `/outbounds/${encodeURIComponent(no)}/items/${itemId}/lot/${adjustmentId}`,
      { timeout: 60000 },
    ),

  updateRtc: (id: string | number, data: { rtc: number }) =>
    http.patch(`outbounds/update/rtc/${id}`, data, { timeout: 60000 }),

  getOutboundByNo: (no: string) =>
    http.get(`/outbounds/${encodeURIComponent(no)}`),

  scanBarcode: (
    no: string,
    data: { barcode: string; location_full_name: string; qty_input?: number },
  ) => http.post(`/outbounds/${encodeURIComponent(no)}/scan/barcode`, data),

  scanReturn: (
    no: string,
    data: { barcode: string; location_full_name: string; qty_input?: number },
  ) => http.post(`/outbounds/${encodeURIComponent(no)}/scan/return`, data),

  checkOutboundItemBarcode: (
    no: string,
    itemId: string | number,
    payload: { barcode: string },
  ) =>
    http.post(
      `/outbounds/${encodeURIComponent(no)}/items/${itemId}/check`,
      payload,
      { timeout: 60000 },
    ),

    scanReturnProduct: (no: string, body: {
  barcode: string;
  location_full_name: string;
  qty_input?: number;
}) => {
  return http.post(
    `/outbounds/${encodeURIComponent(no)}/return/scan`,
    body,
  );
},

confirmReturn: (no: string) => {
  return http.post(
    `/outbounds/${encodeURIComponent(no)}/return/confirm`,
    {},
  );
},
};

export const doc_invoiceApi = {
  getAll: (params?: any) => http.get("/doc_invoices/getAll", { params }),

  /**
   * Get invoice by barcode
   * @param doc_invoice_barcode - barcode ของ invoice
   * @returns DocInvoice
   */

  getDocByBarcode: async (doc_invoice_barcode: string): Promise<DocInvoice> => {
    const response = await http.get<DocInvoice>(
      `doc_invoices/get/${doc_invoice_barcode}`,
    );
    return response.data;
  },
};

// services/batch.api.ts
export const batchApi = {
  getBatchByInvoice: (invoiceNo: string) =>
    http.get(`/batches/get/by-invoice/${encodeURIComponent(invoiceNo)}`),

  getBatchByUserPick(params: {
    page: number;
    limit: number;
    search?: string;
    status?: string; // ✅ เพิ่ม
  }) {
    return http.get("/batch-outbounds/get/groups", { params });
  },

  // ✅ ให้ตรงกับ createBatchOutbounds controller
  createBatch: (data: {
    outbound_ids: number[];
    user_id: number;
    remark?: string;
  }) => http.post("/batch-outbounds/create", data, { timeout: 60000 }),

  remove: (name: string) =>
    http.delete(`/batch-outbounds/delete/${encodeURIComponent(name)}`),
  removeByOutboundId: (outboundId: number) =>
    http.delete(`/batch-outbounds/delete/outboundId/${outboundId}`),
  updateStatus: (name: string, status: string) =>
    http.patch(`/batch-outbounds/update/${encodeURIComponent(name)}`, {
      status,
    }),
};

export const packProductApi = {
  scan: (barcode: string, user_ref?: string) =>
    http.post<ScanPackProductResponse>("/outbounds/pack-products/scan", {
      barcode,
      user_ref,
    }),

  getById: (id: number | string) =>
    http.get<GetPackProductResponse>(`/outbounds/pack-products/${id}`),

  getByPrefix: (prefix: string) =>
    http.get<GetPackProductResponse>(
      `/outbounds/pack-products/by-prefix/${encodeURIComponent(prefix)}`,
    ),

  scanItem: (
    packProductId: number | string,
    boxId: number | string,
    data: {
      barcode: string;
      qty_input?: number;
      user_ref?: string;
    },
  ) =>
    http.post<ScanPackProductItemResponse>(
      `/outbounds/pack-products/${packProductId}/boxes/${boxId}/scan-item`,
      data,
      { timeout: 60000 },
    ),

  scanReturn: (
    packProductId: number | string,
    boxId: number | string,
    data: {
      barcode: string;
      qty_input?: number;
      user_ref?: string;
    },
  ) =>
    http.post<ScanPackProductItemResponse>(
      `/outbounds/pack-products/${packProductId}/boxes/${boxId}/scan-return`,
      data,
      { timeout: 60000 },
    ),

  removeBoxItem: (
    packProductId: number | string,
    boxId: number | string,
    packBoxItemId: number | string,
    data?: {
      quantity?: number;
      user_ref?: string;
    },
  ) =>
    http.delete(
      `/outbounds/pack-products/${packProductId}/boxes/${boxId}/items/${packBoxItemId}`,
      { data, timeout: 60000 },
    ),

  finalize: (
    packProductId: number | string,
    data?: { user_ref?: string; force?: boolean },
  ) =>
    http.post(
      `/outbounds/pack-products/${packProductId}/finalize`,
      data ?? {},
      { timeout: 60000 },
    ),

  getAll: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  }) =>
    http.get<PackProductListResponse>("/outbounds/pack-products", { params }),
};
