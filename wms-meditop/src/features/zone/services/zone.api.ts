import { http } from "../../../services/http";
import type {
  ApiZoneResponse,
  ZoneFormData,
} from "../types/zone.type";

export const zoneApi = {
  getAll: (params?: any) => http.get("/zones/getAll", { params }),

  getAllPaginated: (params: { page: number; limit: number; search?: string }) =>
    http.get<ApiZoneResponse>("/zones/get", { params }),
  getById: (id: number) =>
    http.get<ApiZoneResponse>(`/zones/get/${id}`),

  create: (data: ZoneFormData) => http.post("/zones/create", data),
  update: (id: number, data: ZoneFormData) =>
    http.patch(`/zones/update/${id}`, data),

  remove: (id: number) => http.delete(`/zones/delete/${id}`),
};
