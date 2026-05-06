import { http } from "../../../services/http";
import type { ApiGoodResponse , GetAllPaginatedParams, UpdateInputNumberPayload} from "../types/good.type";

export const goodApi = {
  getAllProduct : (params?: any) => http.get("/goods/wms-mdt-goods/getAllProducts", { params }),
  getAll: (params?: any) => http.get("/goods/wms-mdt-goods/getAll", { params }),

  getAllPaginated: (params: GetAllPaginatedParams) =>
    http.get<ApiGoodResponse>("/goods/wms-mdt-goods/get", { params }),

  getById: (id: string) => http.get<ApiGoodResponse>(`/goods/get/${id}`),

  updateInputNumber: (id :number, data: UpdateInputNumberPayload) =>
    http.patch(`/goods/wms-mdt-goods/update/${id}`, data),
};


