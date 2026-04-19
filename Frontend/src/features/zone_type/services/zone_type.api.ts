import { http } from "../../../services/http";
import type {
  ApiZoneTypeResponse,
  ZoneTypeFormData,
} from "../types/zone_type.type";

export const zoneTypeApi = {
  getAll: (params?: any) => http.get("/zone_types/getAll", { params }),

  getAllPaginated: (params: { page: number; limit: number; search?: string }) =>
    http.get<ApiZoneTypeResponse>("/zone_types/get", { params }),
  getById: (id: number) =>
    http.get<ApiZoneTypeResponse>(`/zone_types/get/${id}`),

  create: (data: ZoneTypeFormData) => http.post("/zone_types/create", data),

  update: (id: number, data: ZoneTypeFormData) =>
    http.patch(`/zone_types/update/${id}`, data),

  remove: (id: number) => http.delete(`/zone_types/delete/${id}`),
};
