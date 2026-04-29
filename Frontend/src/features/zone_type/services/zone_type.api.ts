import { http } from "../../../services/http";
import type {
  ApiZoneTypeResponse,
  ZoneTypeFormData,
} from "../types/zone_type.type";

export const zoneTypeApi = {
  getAll: (params?: any) => http.get("/zone-types/getAll", { params }),

  getAllPaginated: (params: { page: number; limit: number; search?: string }) =>
    http.get<ApiZoneTypeResponse>("/zone-types/get", { params }),
  getById: (id: number) =>
    http.get<ApiZoneTypeResponse>(`/zone-types/get/${id}`),

  create: (data: ZoneTypeFormData) => http.post("/zone-types/create", data),

  update: (id: number, data: ZoneTypeFormData) =>
    http.patch(`/zone-types/update/${id}`, data),

  remove: (id: number) => http.delete(`/zone-types/delete/${id}`),
};
