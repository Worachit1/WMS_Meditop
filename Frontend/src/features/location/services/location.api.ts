import { http } from "../../../services/http";
import type {
  ApiLocationResponse,
  LocationFormData,
  LocationUpdateData,
} from "../types/location.type";

export const locationApi = {
  getAll: (params?: any) => http.get("/locations/getAll", { params }),

  getAllPaginated: (params: { page: number; limit: number; search?: string }) =>
    http.get<ApiLocationResponse>("/locations/get", { params }),
  getById: (id: number) =>
    http.get<ApiLocationResponse>(`/locations/get/${id}`),

  create: (data: LocationFormData) => {
    const formData = new FormData();

    Object.entries(data).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        if (key === "location_img" && value instanceof File) {
          formData.append(key, value);
        } else if (typeof value === "boolean") {
          formData.append(key, value ? "true" : "false");
        } else if (typeof value === "object") {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, String(value));
        }
      }
    });

    return http.post("/locations/create", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  update: (id: number, data: LocationUpdateData) => {
    // ถ้ามีรูปภาพ ใช้ FormData
    if (data.location_img instanceof File) {
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          if (value instanceof File) {
            formData.append(key, value);
          } else if (typeof value === "boolean") {
            formData.append(key, value ? "true" : "false");
          } else if (typeof value === "object") {
            formData.append(key, JSON.stringify(value));
          } else {
            formData.append(key, String(value));
          }
        }
      });
      return http.patch(`/locations/update/${id}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    } else {
      // ไม่มีรูปภาพ ส่งเป็น JSON เพื่อให้ number เป็น number จริงๆ
      return http.patch(`/locations/update/${id}`, data);
    }
  },
  remove: (id: number) => http.delete(`/locations/delete/${id}`),
};
