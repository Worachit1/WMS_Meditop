import { http } from "../../../services/http";
import type {
  ApiReportMovementResponse,
  DetailReportMovementType,
} from "../types/report_movement.type";

type SortDir = "asc" | "desc";

type BackendSortKey =
  | "created_at"
  | "no"
  | "type"
  | "code"
  | "location"
  | "location_dest"
  | "user_ref"
  | "source";

export const reportMovementApi = {
  getReport: (params: {
    page: number;
    limit: number;
    search?: string;
    columns?: string;
    sortBy?: BackendSortKey;
    sortDir?: SortDir;
  }) =>
    http.get<ApiReportMovementResponse>("/reports/get/history", { params }),

  getDetail: (source: string, id: string) =>
    http.get<{ data: DetailReportMovementType }>(`/all/${source}/${id}`),
};