import { http } from "../../../services/http";
import type {
  ApiBorrowStockResponse,
  UpdateBorrowStockItemBody,
  BorrowStockType,
  ConfirmBorrowStockResponse,
  StartBorrowStockResponse,
  ScanBarcodePreviewResponse,
  ScanBorrowStockBarcodeResponse,
  ScanBorpZEAWYtiB6bJ16NuLbGCc6CZ6jJdKfb63,
  StartBorrowStockBody,
  AddScannedBorrowStockItemBody,
  AddScannedBorrowStockItemResponse,
} from "../types/borrow_stock.type";

export type BorrowLocationOption = {
  id: number;
  full_name: string;
  lock_no?: string | null;
};

export const borrowStockApi = {
  getAll: (params?: any) => http.get("/borrow-stocks/getAll", { params }),

  getAllPaginated: (params: {
    page: number;
    limit: number;
    search?: string;
    columns?: string;
    status?: string;
  }) => http.get<ApiBorrowStockResponse>("/borrow-stocks/get", { params }),

  getById: (id: string) =>
    http.get<BorrowStockType | { doc: BorrowStockType }>(
      `/borrow-stocks/get/${id}`,
    ),

  scanBarcodePreview(body: ScanBorpZEAWYtiB6bJ16NuLbGCc6CZ6jJdKfb63) {
    return http.post<ScanBarcodePreviewResponse>(
      "/borrow-stocks/scan/pre",
      body,
    );
  },

  start(body: StartBorrowStockBody) {
    return http.post<StartBorrowStockResponse>("/borrow-stocks/start", body);
  },

  scanBarcode(
    id: number,
    body: { barcode: string; location_full_name: string },
  ) {
    return http.post<ScanBorrowStockBarcodeResponse>(
      `/borrow-stocks/${id}/scan-barcode`,
      body,
    );
  },

  addScannedItem(id: number, body: AddScannedBorrowStockItemBody) {
    return http.post<AddScannedBorrowStockItemResponse>(
      `/borrow-stocks/${id}/items`,
      body,
    );
  },

  updateItem(id: number, itemId: number, body: UpdateBorrowStockItemBody) {
    return http.patch<{ doc: BorrowStockType }>(
      `/borrow-stocks/${id}/items/${itemId}`,
      body,
    );
  },

  deleteItem(id: number, itemId: number) {
    return http.delete<{ doc: BorrowStockType }>(
      `/borrow-stocks/${id}/items/${itemId}`,
    );
  },

  getItemsByLocation(params: {
    location_name: string;
    department_ids?: number[];
    all_departments?: boolean;
  }) {
    const query = {
      ...params,
      department_ids: params.department_ids?.join(","),
    };

    return http.get("/borrow-stocks/bor/get/location", { params: query });
  },

  confirm(id: number) {
    return http.post<ConfirmBorrowStockResponse>(
      `/borrow-stocks/${id}/confirm`,
    );
  },

  update(id: number, body: { status: string }) {
    return http.patch<{ doc: BorrowStockType }>(
      `/borrow-stocks/update/${id}`,
      body,
    );
  },

  remove(id: number) {
    return http.delete(`/borrow-stocks/delete/${id}`);
  },
};

export const locationApi = {
  getBylockno: (params?: any) =>
    http.get<BorrowLocationOption[]>("/locations/get/bor", { params }),
};
