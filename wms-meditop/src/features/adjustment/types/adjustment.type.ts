// src/modules/adjustment/types/adjustment.type.ts
export type AdjustmentStatus = "pending" | "in-progress" | "completed";

export interface AdjustmentItem {
  id: number;
  sequence?: number | null;
  product_id?: number | null;
  code?: string | null;
  name: string;
  unit: string;
  location?: string | null;
  location_dest?: string | null;
  lot_id?: number | null;
  lot_serial?: string | null;
  qty?: number | null;
}

export interface AdjustmentType {
  id: number;
  date: string;
  no: string;
  location?: string | null;
  origin?: string | null;
  reference?: string | null;
  type?: string | null;
  out_type?: string | null;
  description?: string | null;
  status: AdjustmentStatus;
  items?: AdjustmentItem[];
}

export interface AdjustmentMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiAdjustmentResponse {
  data: AdjustmentType[];
  meta: AdjustmentMeta;
}

export interface GetAllPaginatedParams {
  page: number;
  limit: number;
  search?: string;
  columns?: string[];
}