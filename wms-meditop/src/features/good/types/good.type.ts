 export interface GoodType {
  id: number;
  product_id: number;
  product_code: string;
  product_name: string;
  lot_id?: number;
  lot_name: string;
  expiration_date: string;
  expiration_date_end: string;
  department_code: string;
  zone_type?: any;
  unit: string;
  input_number: boolean;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface GoodFilter {
    product_id: number | null;
    product_code: string | null;
    product_name: string | null;
    lot_id?: number | null;
    lot_name: string | null;
    department_code: string | null;
    zone_type?: any;
    expiration_date?: string | null;
    expiration_date_end?: string | null;
    unit: string | null;
    input_number: boolean | null;
}

export interface UpdateInputNumberPayload {
    id: number;
    input_number: boolean;
}

export interface GoodMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export interface ApiGoodResponse {
    data: GoodType[];
    meta: GoodMeta;
}

export interface GetAllPaginatedParams {
  page: number;
  limit: number;
  search?: string;
  columns?: string[]; // <-- Add this line
}