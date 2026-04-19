export interface StockCountType {
  id: string;
  sku: string;
  name: string;
  lot: string;
  exp_date: string;
  lock_no: string;
  quantity: number;
  count: number;
}

export interface StockCountFormeData {
  count : number;
}

export interface StockCountUpdateData {
  lot: string;
  quantity: number;
  overwrite_remark: string;
}

export interface StockCountFilter {
  id: string | null;
  sku: string | null;
  name: string | null;
  lot: string | null;
  exp_date?: string | null;
  lock_no: string | null;
  quantity?: number | null;
  count: number | null;
}

export interface StockMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiStockCountResponse {
  data: StockCountType[];
  meta: StockMeta;
}
