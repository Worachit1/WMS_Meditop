// transfer.api.ts
import { http } from "../../../services/http";
import type { TransferListResponse } from "../types/tranfers.type";

export type ConfirmTransferPickBody = {
  user_ref?: string;
  location_full_name?: string;
  locations: {
    location_full_name: string;
    lines: {
      transfer_movement_item_id?: string;
      transfer_item_id?: string;
      quantity_pick?: number;
      status?: string;
    }[];
  }[];
};

export type ConfirmTransferPutBody = {
  user_ref?: string;
  pin: string;
  location_full_name?: string;
  locations: {
    location_full_name: string;
    lines?: {
      transfer_movement_item_id?: string;
      transfer_item_id?: string;
      quantity_put?: number;
      put?: number;
      status?: string;
    }[];
  }[];
};

export const transferApi = {
  getAll: (params?: any) => http.get("/transfers-movements/getAll", { params }),
  getMovementPaginated: (params: {
    page: number;
    limit: number;
    search?: string;
    columns?: string;
    status?: "pick" | "put" | "completed";
  }) => http.get<TransferListResponse>("/transfers-movements/get", { params }),

  getDetailExpNcr: (no: string) =>
    http.get<TransferListResponse>(
      `/transfers-movements/get/${encodeURIComponent(no)}`,
    ),

  scanLocation: (no: string, data: { location_full_name: string }) =>
    http.post(
      `/transfers-movements/${encodeURIComponent(no)}/scan/location/ncr`,
      data,
    ),

  scanLocationPick: (
    no: string,
    data:
      | { location_full_name: string }
      | { locations: { location_full_name: string }[] },
  ) =>
    http.post(
      `/transfers-movements/${encodeURIComponent(no)}/scan/location`,
      data,
    ),

  scanLocationPut: (
    no: string,
    data:
      | { location_full_name: string }
      | { locations: { location_full_name: string }[] },
  ) =>
    http.post(
      `/transfers-movements/${encodeURIComponent(no)}/scan/location/put`,
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
      `/transfers-movements/${encodeURIComponent(no)}/scan/barcode`,
      data,
    ),
  // scanBarcode: (
  //   no: string,
  //   data: { barcode: string; location_full_name: string; qty_input?: number },
  // ) => http.post(`/transfers_movements/${encodeURIComponent(no)}/scan/barcode`, data),

  setPutQtyByItem: (
    no: string,
    data: {
      transfer_item_id: string;
      location_full_name: string;
      value: number;
    },
  ) =>
    http.post(
      `/transfers-movements/${encodeURIComponent(no)}/scan/put-qty`,
      data,
    ),

  // ✅ FIX: ใช้ transfer_item_id ให้ตรง transfer
  confirmToPick: (no: string, data: ConfirmTransferPickBody) =>
  http.post(
    `/transfers-movements/${encodeURIComponent(no)}/scan/confirm`,
    data,
  ),

confirmToPut: (no: string, data: ConfirmTransferPutBody) =>
  http.post(
    `/transfers-movements/${encodeURIComponent(no)}/scan/confirm/put`,
    data,
  ),

  createMovementInvoice: (data: any) =>
    http.post("/transfers-movements/create", data),

  getById: (no: string) =>
    http.get(`/transfers-movements/${encodeURIComponent(no)}`),

  // ✅ NEW: update header/items (edit)
  updateMovement: (id: number, data: any) =>
    http.patch(`/transfers-movements/update/${id}`, data),
};
