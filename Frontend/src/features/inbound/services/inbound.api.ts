import { http } from "../../../services/http";
import type {
  ApiInboundResponse,
  ApiInboundByIdResponse,
  ApiInboundByIdPaginatedResponse,
} from "../types/inbound.type";

export const inboundApi = {
  getAll: (params?: any) => http.get("/inbounds/getAll", { params }),

  getAllPaginated: (params: { page: number; limit: number; search?: string;  status?: "pending" | "completed"; }) =>
    http.get<ApiInboundResponse>("/inbounds/get", { params }),

  getById: (no: string) =>
    http.get<ApiInboundByIdResponse>(
      `/inbounds/get/odoo/transfers/${encodeURIComponent(no)}`,
    ),

  getByIdPagination: (no: string, params: { page: number; limit: number }) =>
    http.get<ApiInboundByIdPaginatedResponse>(
      `/inbounds/get/odoo/transfers/${encodeURIComponent(no)}/paginated`,
      { params },
    ),

  createGoodinBarcode: (data: {
    goods_in_id: string;
    barcode: string;
    lot_start?: number | null;
    lot_stop?: number | null;
    exp_start?: number | null;
    exp_stop?: number | null;
    barcode_length?: number | null;
  }) => http.post("/goods_ins/barcode/create", data),

  scanLocation: (no: string, data: { location_full_name: string }) =>
    http.post(`/inbounds/${encodeURIComponent(no)}/scan/location`, data),

  scanBarcode: (
    no: string,
    data: { barcode: string; location_full_name: string; qty_input?: number },
  ) => http.post(`/inbounds/${encodeURIComponent(no)}/scan/barcode`, data),

  undoScanBarcode: (
    no: string,
    data: {
      goods_in_id: string;
      location_full_name: string;
    },
  ) => http.post(`/inbounds/${encodeURIComponent(no)}/scan/undo`, data),

  

  confirmToStock: (
    no: string,
    data: {
      location_full_name: string | null;
      user_ref: string;
      lines: { goods_in_id: string; quantity_count: number }[];
    },
  ) => http.post(`/inbounds/${encodeURIComponent(no)}/scan/confirm`, data),

  confirmToStockMulti: (
    no: string,
    data: {
      user_ref: string;
      locations: {
        location_full_name: string | null;
        lines: { goods_in_id: string; quantity_count: number }[];
      }[];
    },
  ) => http.post(`/inbounds/${encodeURIComponent(no)}/scan/confirm`, data),
};

export const BarcodeCountDepartmentApi = {
  getAll: (params?: any) =>
    http.get("/barcode-count-departments/getAll", { params }),
  update: (id: string, data: { barcode_count: string }) =>
    http.patch(
      `/barcode-count-departments/update/${encodeURIComponent(id)}`,
      data,
    ),
};