import { http } from "../../../services/http";

import type {
  ApiBarcodeResponse,
  BarcodeFormData,
  ApiBarcodeDetailResponse,
} from "../types/barcode.type";

export const barcodeApi = {
  getAll: (params?: any) => http.get("/barcodes/getAll", { params }),

  getAllPaginated: (params: { page: number; limit: number; search?: string }) =>
    http.get<ApiBarcodeResponse>("/barcodes/get", { params }),

  getById: (id: number) =>
    http.get<ApiBarcodeDetailResponse>(`/barcodes/get/${id}`),

  create: (data: BarcodeFormData) => http.post("/barcodes/create", data),

  update: (id: number, data: BarcodeFormData) =>
    http.patch(`/barcodes/update/${id}`, data),

  remove: (id: number) => http.delete(`/barcodes/delete/${id}`),
};
