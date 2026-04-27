import { http } from "../../../services/http";
import type { TransferListResponse } from "../types/tranfers.type";

export type ConfirmTransferPickBody = {
  user_ref: string;
  locations: {
    location_full_name: string;
    lines: { transfer_item_id: string; quantity_count: number }[];
  }[];
};

export type ConfirmTransferPutBody = {
  user_ref: string;
  locations: {
    location_full_name: string;
    lines: { transfer_item_id: string; quantity_put: number }[];
  }[];
};

export type ScanTransferBarcodeBody = {
  barcode: string;
  location_full_name: string;
  qty_input?: number;
  user_ref?: string;
};

export type ScanTransferLocationBody =
  | { location_full_name: string }
  | { locations: { location_full_name: string }[] };

export type ScanTransferLocationResponse = {
  location?: {
    location_id: number;
    location_name: string;
    ncr_check?: boolean;
  } | null;
  locations?: {
    location_id: number;
    location_name: string;
    ncr_check?: boolean;
  }[];
  lines?: any[];
  total_items?: number;
  completed?: boolean;
  put_completed?: boolean;
};

export const transferApi = {
 getExpNcrPaginated: (params: {
  page: number;
  limit: number;
  search?: string;
  columns?: string;
  status?: "pending" | "process" | "completed";
}) => http.get<TransferListResponse>("/transfers/get", { params }),


  getDetailExpNcr: (no: string) =>
    http.get<TransferListResponse>(
      `/transfers/odoo/get/${encodeURIComponent(no)}`,
    ),

  scanLocation: (no: string, data: ScanTransferLocationBody) =>
    http.post<ScanTransferLocationResponse>(
      `/transfers/${encodeURIComponent(no)}/scan/location/ncr`,
      data,
    ),

  scanLocationPick: (no: string, data: ScanTransferLocationBody) =>
    http.post<ScanTransferLocationResponse>(
      `/transfers/${encodeURIComponent(no)}/scan/location`,
      data,
    ),

  scanBarcode: (no: string, data: ScanTransferBarcodeBody) =>
    http.post(`/transfers/${encodeURIComponent(no)}/scan/barcode`, data),

  scanBarcodePut: (no: string, data: ScanTransferBarcodeBody) =>
    http.post(`/transfers/${encodeURIComponent(no)}/scan/barcode/put`, data),

  confirmToPick: (no: string, data: ConfirmTransferPickBody) =>
    http.post(`/transfers/${encodeURIComponent(no)}/scan/confirm`, data),

  confirmToPut: (no: string, data: ConfirmTransferPutBody) =>
    http.post(`/transfers/${encodeURIComponent(no)}/scan/confirm/put`, data),
};