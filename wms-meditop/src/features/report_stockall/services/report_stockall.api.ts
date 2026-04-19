import { http } from "../../../services/http";
import type { ApiReportStockAllResponse } from "../types/reposrt_stockall.type";

export const reportStockAllApi = {
  getAll: (params?: any) => http.get("/stocks/getAll", { params }),

  getAllPaginated: (params: { page: number; limit: number; search?: string; columns?: string; sortBy?: string; sortDir?: string }) =>
    http.get<ApiReportStockAllResponse>("/stocks/get", { params }),

  getAllBorPaginated: (params: { page: number; limit: number; search?: string; columns?: string; sortBy?: string; sortDir?: string }) =>
    http.get<ApiReportStockAllResponse>("/stocks/get/bor", { params }),

  getAllSerPaginated: (params: { page: number; limit: number; search?: string; columns?: string; sortBy?: string; sortDir?: string }) =>
    http.get<ApiReportStockAllResponse>("/stocks/get/ser", { params }),

  getById: (id: string) => http.get<ApiReportStockAllResponse>(`/stocks/get/${id}`),
};
