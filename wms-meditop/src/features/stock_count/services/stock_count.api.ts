import { http } from "../../../services/http";
import type { ApiStockCountResponse, StockCountFormeData, StockCountUpdateData } from "../types/stock_count.type";

export const stock_countApi = {
  getAll: (params?: any) => http.get("/stocks/getAll", { params }),

  getAllPaginated: (params: { page: number; limit: number; search?: string }) =>
    http.get<ApiStockCountResponse>("/stocks/get", { params }),
  getById: (id: string) => http.get<ApiStockCountResponse>(`/stocks/get/${id}`),

  startCount: (data: StockCountFormeData) => http.post("/stocks/start_count", data),

  update: (id: string, data: StockCountUpdateData) => http.patch(`/stocks/update/${id}`, data),
};
