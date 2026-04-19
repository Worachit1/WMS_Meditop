export interface BarcodeType {
  id : number;
  barcode_id: number;
  barcode: string;
  product_code: string;
  product_name: string;
  lot_start: number;
  lot_stop: number;
  exp_start: number;
  exp_stop: number;
  barcode_length: number;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface BarcodeFormData {
  barcode_id: number;
  barcode: string;
  product_code: string;
  lot_start: number;
  lot_stop: number;
  exp_start: number;
  exp_stop: number;
  barcode_length: number;
}

export interface BarcodeFilter {
  barcode_id: string | null;
  barcode: string | null;
  product_code: string | null;
  lot_start: string | null;
  lot_stop: string | null;
  exp_start?: string | null;
  exp_stop?: string | null;
}

export interface BarcodeMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
export interface ApiBarcodeResponse {
  data: BarcodeType[];
  meta: BarcodeMeta;
}

export interface BarcodeApiItem {
  id: number;
  barcode_id: number | null;
  barcode: string | null;
  product_id: number | null;
  product_code: string | null;
  product_name: string | null;
  lot_start: number | null;
  lot_stop: number | null;
  exp_start: number | null;
  exp_stop: number | null;
  barcode_length: number | null;
  internal_use: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ApiBarcodeDetailResponse {
  data: BarcodeApiItem;
}
