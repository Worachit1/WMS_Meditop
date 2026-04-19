export interface StockType {
  id:number;
  location_name: string;
  product_id: string;
  product_code: string;
  product_name: string;
  lot_id: string;
  lot_name: string;
  expiration_date: string;
  quantity: number;
  active: boolean;
}

export interface StockFilter {
  location_name?: string;
  product_id?: string;
  product_code?: string;
  product_name?: string;
  lot_id?: string;
  expiration_date_start?: string;
  expiration_date_end?: string;
  active?: boolean;
}

export interface StockMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiStockResponse {
  data: StockType[];
  meta: StockMeta;
}
