// transfer.api.ts
import { http } from "../../../services/http";
import type { TransferListResponse } from "../types/tranfers.type";

export type ConfirmTransferPickBody = {
  user_ref: string;
  locations: {
    location_full_name: string;
    lines: { transfer_item_id: string; status: string }[];
  }[];
};

export type ConfirmTransferPutBody = {
  user_ref: string;
  pin: string;
  locations: {
    location_full_name: string;
    lines?: {
      transfer_item_id: string;
      status?: string;
      put_qty?: number;
    }[];
  }[];
};

export const transferApi = {
  getAll: (params?: any) => http.get("/transfers_movements/getAll", { params }),
  getExpNcrPaginated: (params: {
    page: number;
    limit: number;
    search?: string;
    columns?: string; // comma-separated
  }) => http.get<TransferListResponse>("/transfers_movements/get", { params }),

  getDetailExpNcr: (no: string) =>
    http.get<TransferListResponse>(
      `/transfers_movements/get/${encodeURIComponent(no)}`,
    ),

  scanLocation: (no: string, data: { location_full_name: string }) =>
    http.post(
      `/transfers_movements/${encodeURIComponent(no)}/scan/location/ncr`,
      data,
    ),

  scanLocationPick: (no: string, data: { location_full_name: string }) =>
    http.post(
      `/transfers_movements/${encodeURIComponent(no)}/scan/location`,
      data,
    ),

     scanLocationPut: (no: string, data: { location_full_name: string }) =>
    http.post(
      `/transfers_movements/${encodeURIComponent(no)}/scan/location/put`,
      data,
    ),

  scanBarcode: (
    no: string,
    data: {
      barcode: string;
      location_full_name: string;
      mode?: "inc" | "set" | "dec" | "clear";
      value?: number;
    },
  ) =>
    http.post(
      `/transfers_movements/${encodeURIComponent(no)}/scan/barcode`,
      data,
    ),
  // scanBarcode: (
  //   no: string,
  //   data: { barcode: string; location_full_name: string; qty_input?: number },
  // ) => http.post(`/transfers_movements/${encodeURIComponent(no)}/scan/barcode`, data),

  setPutQtyByItem: (
  no: string,
  data: { transfer_item_id: string; location_full_name: string; value: number },
) =>
  http.post(
    `/transfers_movements/${encodeURIComponent(no)}/scan/put-qty`,
    data,
  ),

  // ✅ FIX: ใช้ transfer_item_id ให้ตรง transfer
  confirmToPick: (no: string, data: ConfirmTransferPickBody) =>
    http.post(
      `/transfers_movements/${encodeURIComponent(no)}/scan/confirm`,
      data,
    ),

  confirmToPut: (no: string, data: ConfirmTransferPutBody) =>
    http.post(
      `/transfers_movements/${encodeURIComponent(no)}/scan/confirm/put`,
      data,
    ),

  createMovementInvoice: (data: any) =>
    http.post("/transfers_movements/create", data),

  getById: (no: string) =>
    http.get(`/transfers_movements/${encodeURIComponent(no)}`),

  // ✅ NEW: update header/items (edit)
 updateMovement: (id: number, data: any) =>
  http.patch(`/transfers_movements/update/${id}`, data),
};
