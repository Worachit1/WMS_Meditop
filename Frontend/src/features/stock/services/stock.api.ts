import { http } from "../../../services/http";
import type { ApiStockResponse } from "../types/stock.type";

export const stockApi = {
  getAll: (params?: any) => http.get("/stocks/getAll", { params }),

  getAllPaginated: (params: { page: number; limit: number; search?: string; columns?: string }) =>
    http.get<ApiStockResponse>("/stocks/get", { params }),
  getById: (id: string) => http.get<ApiStockResponse>(`/stocks/get/${id}`),
};
