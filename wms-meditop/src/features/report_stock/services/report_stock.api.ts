import { http } from "../../../services/http";
import type {ApiReportStockResponse} from "../types/report_stock.type";

export const reportStockApi = {
    getReport: (params: { page: number; limit: number; search?: string; columns?: string; snapshot_date?: string }) =>
        http.get<ApiReportStockResponse>("/reports/get", { params }),
    getReportBor: (params: { page: number; limit: number; search?: string; columns?: string; snapshot_date?: string }) =>
        http.get<ApiReportStockResponse>("/stocks/get/bor", { params }),
    getReportSer: (params: { page: number; limit: number; search?: string; columns?: string; snapshot_date?: string }) =>
        http.get<ApiReportStockResponse>("/stocks/get/ser", { params }),
    getReportById: (id: string) => http.get<ApiReportStockResponse>(`/reports/get/${id}`),
};