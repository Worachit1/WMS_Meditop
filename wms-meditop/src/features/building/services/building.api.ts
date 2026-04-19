import { http } from "../../../services/http";
import type {
  ApiBuildingResponse,
  BuildingFormData,
} from "../types/building.type";

export const buildingApi = {
  getAll: (params?: any) => http.get("/buildings/getAll", { params }),
  
  getAllPaginated: (params: { page: number; limit: number; search?: string }) =>
    http.get<ApiBuildingResponse>("/buildings/get", { params }),

  getById: (id: number) => http.get<ApiBuildingResponse>(`/buildings/get/${id}`), // ✅ เปลี่ยนเป็น string
  
  create: (data: BuildingFormData) => http.post("/buildings/create", data),
  
  update: (id: number, data: BuildingFormData) => // ✅ เปลี่ยนเป็น string
    http.patch(`/buildings/update/${id}`, data),
  
  remove: (id: number) => http.delete(`/buildings/delete/${id}`), // ✅ เปลี่ยนเป็น string
};
