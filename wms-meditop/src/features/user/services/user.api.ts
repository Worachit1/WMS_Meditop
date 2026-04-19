import { http } from "../../../services/http";
import type {
  ApiUserResponse,
  UserFormData,
  UserUpdateData,
} from "../types/user.type";

export const userApi = {
  getAll: (params?: any) => http.get("/users/getAll", { params }),

  getAllPaginated: (params: { page: number; limit: number; search?: string }) =>
    http.get<ApiUserResponse>("/users/get", { params }),

  getById: (id: number) => http.get<ApiUserResponse>(`/users/get/${id}`),

  create: (data: UserFormData) => {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        if (key === "department_ids" && Array.isArray(value)) {
          // จัดการ array แยกต่างหาก
          value.forEach((id) => {
            formData.append("department_ids[]", id.toString());
          });
        } else if (key === "user_img" && value instanceof File) {
          // จัดการ File object
          formData.append(key, value);
        } else if (typeof value === "object") {
          // แปลง object อื่นๆ เป็น JSON
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, value.toString());
        }
      }
    });
    return http.post("/users/create", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  update: (id: number, data: UserUpdateData) => {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        if (key === "department_ids" && Array.isArray(value)) {
          value.forEach((id) => {
            formData.append("department_ids[]", id.toString());
          });
        } else if (key === "user_img" && value instanceof File) {
          formData.append(key, value);
        } else if (typeof value === "object") {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, value.toString());
        }
      }
    });
    return http.patch(`/users/update/${id}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  updatePin: (id: number, pin: string) =>
    http.patch(`/users/update/pin/${id}`, { pin }),

  //   updatePin: (id: number, pin: string) => {
  //     const formData = new FormData();
  //     formData.append("pin", pin);

  //     return http.patch(`/users/update/${id}`, formData, {
  //       headers: { "Content-Type": "multipart/form-data" },
  //     });
  //   },

  remove: (id: number) => http.delete(`/users/delete/${id}`),
};
