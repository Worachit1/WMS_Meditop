// src/modules/adjustment/services/adjustment.api.ts
import { http } from "../../../services/http";
import type {
  ApiAdjustmentResponse,
  GetAllPaginatedParams,
  AdjustmentType,
} from "../types/adjustment.type";

export type ConfirmAdjustmentCompleteBody = {
  transfers: {
    no: string;
    department_id?: number | string | null;
    department?: string | null;
    reference?: boolean | string | null;
    origin?: string | null;
    items: {
      sequence?: number | null;
      product_id?: number | null;
      code?: string | null;
      name: string;
      location_id?: number | null;
      location?: string | null;
      location_dest_id?: number | null;
      location_dest?: string | null;
      unit: string;
      tracking?: string | null;
      lot_id?: number | null;
      lot_serial?: string | null;
      expire_date?: string | null;
      qty_pick: number;
      barcodes?: {
        barcode_id?: number | null;
        barcode?: string | null;
      }[];
    }[];
  }[];
};

export type GetAdjustmentLevel = "manual" | "auto";
export type GetAdjustmentStatus = "pending" | "completed";

export const adjustmentApi = {
  // ✅ list page: ใช้ combined endpoint ตัวเดียว
  getAllPaginated: (params: GetAllPaginatedParams & {
    level?: GetAdjustmentLevel;
    status?: GetAdjustmentStatus;
  }) =>
    http.get<ApiAdjustmentResponse>("/Adjust", {
      params: {
        ...params,
        columns: params?.columns?.join(","),
      },
    }),

  // ✅ fetch full detail by id
  getDetailById: (id: number) =>
    http.get<{ data: AdjustmentType }>(`/Adjust/${id}`),

  getDetailOutboundById: (id: number) =>
    http.get<{ data: AdjustmentType }>(`/outbounds/get/adjust/${id}`),

  processById: (id: number) => http.post(`/Adjust/${id}/process`),

  scanLocation: (no: string, data: { location_full_name: string }) =>
    http.post(`/Adjust/${encodeURIComponent(no)}/scan/location`, data),

  saveDraft: (no: string, data: any) =>
    http.patch(`/Adjust/${encodeURIComponent(no)}`, data),

  confirm: (no: string, data: any) =>
    http.post(`/Adjust/${encodeURIComponent(no)}/scan/confirm`, data),

  confirmCompleteByNo: (no: string, body: ConfirmAdjustmentCompleteBody) =>
    http.post(`/Adjust/${encodeURIComponent(no)}/complete`, body),

  removeItem: (adjustmentId: number, itemId: number, pin: string) =>
  http.delete(`/Adjust/${adjustmentId}/items/${itemId}`, {
    data: { pin },
  }),

  scanBarcode: (
  no: string,
  data: {
    barcode: string;
    location_full_name: string;
    user_ref?: string | null;
  },
) => http.post(`/Adjust/${encodeURIComponent(no)}/scan/barcode`, data),


};