import { http } from "../../../services/http";
import type {
  ApiDepartmentResponse,
  DepartmentFormData,
} from "../types/department.type";

export const departmentApi = {
  getAll: (params?: any) => http.get("/departments/getAll", { params }),

  getAllPaginated: (params: { page: number; limit: number; search?: string }) =>
    http.get<ApiDepartmentResponse>("/departments/get", { params }),

  getById: (id: number) =>
    http.get<ApiDepartmentResponse>(`/departments/get/${id}`),

  create: (data: DepartmentFormData) => http.post("/departments/create", data),

  update: (id: number, data: DepartmentFormData) =>
    http.patch(`/departments/update/${id}`, data),

  remove: (id: number) => http.delete(`/departments/delete/${id}`),
};
