import { http } from "../../../services/http";
import type { ApiBorResponse } from "../types/bor.type";

export const borApi = {
  getBorList: (params?: any) =>
    http.get<ApiBorResponse>("/swaps/getAll", { params }),

  getPagination(params: {
    page: number;
    limit: number;
    search?: string;
    department?: string; // ✅ เพิ่ม
  }) {
    return http.get<ApiBorResponse>("/swaps/get", { params });
  },

  getBorByNo: (no: string) =>
    http.get<ApiBorResponse>(`/swaps/get/${encodeURIComponent(no)}`),
};